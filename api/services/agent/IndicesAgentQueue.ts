import { AgentQueue, AgentTask } from './agentQueue';
import { QuantifyWorker } from './Worker';
import { Memory } from './memory';
import { DatabaseService } from '../databaseService';
import { callReasoningModel, extractJsonFromResponse } from '../ModelUtils';
import { PromptManager } from '../promptManager';
import fs from 'fs/promises';
import path from 'path';

export class IndicesAgentQueue extends AgentQueue {
  private name: string;
  private intent: string;
  private indexName: string;
  private dbService: DatabaseService;

  constructor(memory: Memory, queueId?: string) {
    super(memory, queueId);
    this.name = '';
    this.intent = '';
    this.indexName = '';
    this.dbService = new DatabaseService();
  }

  async initiate(userQuery: string): Promise<void> {
    console.log(`[INDICES AGENT] Initiating with query: ${userQuery}`);
    
    // Analyze user intent and generate task name using PromptManager
    const prompts = await PromptManager.getPrompt('intentAnalysis', 'indices', { userQuery });
    const response = await callReasoningModel(prompts.system, prompts.user, '[INDICES AGENT QUEUE]');
    
    if (response.success) {
      try {
        // Extract JSON from markdown code blocks if present
        const jsonText = extractJsonFromResponse(response.text);
        console.log('[INDICES AGENT QUEUE] JSON text to parse:', jsonText);
        
        const analysis = JSON.parse(jsonText);
        console.log('[INDICES AGENT QUEUE] Parsed analysis:', analysis);
        
        this.name = analysis.taskName || `Indices: ${userQuery.substring(0, 30)}...`;
        this.intent = analysis.intent || '';
        this.indexName = analysis.indexName || this.name;
        
        // Add task info to memory (without intent since it's in prompt)
        const taskMemory = `\n--- TASK INITIATION ---\nTask Name: ${this.name}\nIndex Name: ${this.indexName}\nUser Query: ${userQuery}\n--- END INITIATION ---\n`;
        console.log(`[INDICES AGENT] Adding to memory during initiation:`);
        console.log(`[INDICES AGENT] Task memory:`, taskMemory);
        console.log(`[INDICES AGENT] --- End Task Memory ---`);
        await this.getMemory().add(taskMemory);
        
        console.log(`[INDICES AGENT] Task named: ${this.name}`);
        console.log(`[INDICES AGENT] Index name: ${this.indexName}`);
        console.log(`[INDICES AGENT] Intent: ${this.intent}`);
      } catch (error) {
        console.error('[INDICES AGENT QUEUE] Error parsing JSON:', error);
        this.name = `Indices: ${userQuery.substring(0, 30)}...`;
        this.intent = 'Unable to analyze intent - JSON parsing error';
        this.indexName = this.name;
      }
    } else {
      console.warn('[INDICES AGENT QUEUE] Failed to get response from OpenAI:', response.error);
      this.name = `Indices: ${userQuery.substring(0, 30)}...`;
      this.intent = 'Unable to analyze intent - API error';
      this.indexName = this.name;
    }
  }

  async addTasks(userQuery: string): Promise<void> {
    console.log(`[INDICES AGENT] Adding tasks for query: ${userQuery}`);
    
    // Get all completed PDF tasks
    const allTasks = await this.dbService.getAllTasks();
    const pdfTasks = allTasks.filter(
      t => t.status === 'completed' && t.result && t.result.extractedTextPath
    );

    if (pdfTasks.length === 0) {
      throw new Error('No completed PDF tasks found to process');
    }

    console.log(`[INDICES AGENT] Found ${pdfTasks.length} PDF documents to process`);

    // Sort documents chronologically by timestamp
    const sortedTasks = pdfTasks.sort((a, b) => {
      const timeA = a.result?.metadata?.inferredTimestamp || a.TimeStamp || a.createdAt;
      const timeB = b.result?.metadata?.inferredTimestamp || b.TimeStamp || b.createdAt;
      return new Date(timeA).getTime() - new Date(timeB).getTime();
    });

    console.log(`[INDICES AGENT] Processing ${sortedTasks.length} documents in chronological order`);

    // Create a QuantifyWorker task for each PDF
    for (let i = 0; i < sortedTasks.length; i++) {
      const pdf = sortedTasks[i];
      const previousPdf = i > 0 ? sortedTasks[i - 1] : null;

      try {
        // Load previous article content if available
        let previousArticle = '';
        if (previousPdf) {
          try {
            const fs = require('fs/promises');
            const path = require('path');
            const fullPath = path.isAbsolute(previousPdf.result!.extractedTextPath) 
              ? previousPdf.result!.extractedTextPath 
              : path.join(process.cwd(), previousPdf.result!.extractedTextPath);
            previousArticle = await fs.readFile(fullPath, 'utf-8');
            console.log(`[INDICES AGENT] Loaded previous article from: ${previousPdf.filename}`);
            console.log(`[INDICES AGENT] Previous article preview (first 200 chars): ${previousArticle.substring(0, 200)}${previousArticle.length > 200 ? '...' : ''}`);
          } catch (error) {
            console.error(`[INDICES AGENT] Failed to load previous article from ${previousPdf.filename}:`, error);
            previousArticle = 'Previous article could not be loaded.';
          }
        }

        const task: AgentTask = {
          id: `indices-quantify-${pdf.id}`,
          type: 'quantify',
          payload: {
            article_id: pdf.id,
            question: userQuery,
            intent: this.intent,
            indexName: this.indexName,
            filename: pdf.filename,
            extractedTextPath: pdf.result!.extractedTextPath,
            timestamp: pdf.result?.metadata?.inferredTimestamp || pdf.TimeStamp,
            previousArticle: previousArticle,
            previousFilename: previousPdf?.filename,
            previousTimestamp: previousPdf ? (previousPdf.result?.metadata?.inferredTimestamp || previousPdf.TimeStamp) : undefined
          },
          status: 'pending',
        };

        await this.addTask(task);
        console.log(`[INDICES AGENT] Added quantify task for: ${pdf.filename}${task.payload.timestamp ? ` with timestamp: ${task.payload.timestamp}` : ''}${previousPdf ? ` (previous: ${previousPdf.filename})` : ' (first document)'}`);
      } catch (error) {
        console.error(`[INDICES AGENT] Error adding task for ${pdf.filename}:`, error);
      }
    }
  }

  async process(): Promise<void> {
    console.log(`[INDICES AGENT] Starting processing for: ${this.name}`);
    
    const tasks = await this.getTasks();
    const pendingTasks = tasks.filter(t => t.status === 'pending');
    
    console.log(`[INDICES AGENT] Processing ${pendingTasks.length} pending tasks`);

    for (const task of pendingTasks) {
      try {
        // Mark task as processing
        await this.updateTask(task.id, { status: 'processing' });
        
        // Create worker and process
        const worker = new QuantifyWorker(this.getMemory());
        const result = await worker.process(task.payload, task.id);
        
        // Mark task as completed
        await this.updateTask(task.id, { 
          status: 'completed', 
          result: result 
        });
        
        console.log(`[INDICES AGENT] Completed task: ${task.id}`);
      } catch (error) {
        console.error(`[INDICES AGENT] Error processing task ${task.id}:`, error);
        await this.updateTask(task.id, { 
          status: 'failed', 
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  async ensuringFinish(): Promise<boolean> {
    console.log(`[INDICES AGENT] Ensuring finish for: ${this.name}`);
    
    const tasks = await this.getTasks();
    const allCompleted = tasks.every(t => t.status === 'completed');
    const anyFailed = tasks.some(t => t.status === 'failed');
    
    if (allCompleted) {
      console.log(`[INDICES AGENT] All tasks completed successfully`);
      
      // Add completion summary to memory
      const summary = `\n--- TASK COMPLETION ---\nIndices creation completed for ${tasks.length} documents.\nTask: ${this.name}\n--- END COMPLETION ---\n`;
      await this.getMemory().add(summary);
      
      return true;
    } else if (anyFailed) {
      console.log(`[INDICES AGENT] Some tasks failed`);
      return false;
    } else {
      console.log(`[INDICES AGENT] Still processing...`);
      return false;
    }
  }

  getName(): string {
    return this.name;
  }

  getIndexName(): string {
    return this.indexName;
  }
} 