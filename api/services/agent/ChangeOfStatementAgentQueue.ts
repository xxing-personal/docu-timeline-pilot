import { AgentQueue, AgentTask } from './agentQueue';
import { ResearchWorker, WritingWorker } from './Worker';
import { Memory } from './memory';
import { DatabaseService } from '../databaseService';
import { callReasoningModel, extractJsonFromResponse } from '../ModelUtils';
import fs from 'fs/promises';
import path from 'path';

export class ChangeOfStatementAgentQueue extends AgentQueue {
  private name: string;
  private intent: string;
  private dbService: DatabaseService;

  constructor(memory: Memory, queueId?: string) {
    super(memory, queueId);
    this.name = '';
    this.intent = '';
    this.dbService = new DatabaseService();
  }

  async initiate(userQuery: string): Promise<void> {
    console.log(`[CHANGE OF STATEMENT AGENT] Initiating with query: ${userQuery}`);
    
    // Analyze user intent and generate task name using OpenAI
    const systemPrompt = 'You are a helpful assistant for analyzing user intent for research tasks.';
    
    const userPrompt = `
You are analyzing a user query for a change of statement agent. The agent will analyze PDF documents to answer research questions.

User Query: "${userQuery}"

Please provide:
1. A clear analysis of what the user wants to research and understand.
2. A concise, descriptive name for this research task (max 50 characters)

Output as JSON (do not wrap in markdown code blocks):
{
  "intent": "brief analysis of research objective",
  "taskName": "concise task name"
}
`;

    const response = await callReasoningModel(systemPrompt, userPrompt, '[CHANGE OF STATEMENT AGENT QUEUE]');
    
    if (response.success) {
      try {
        // Extract JSON from markdown code blocks if present
        const jsonText = extractJsonFromResponse(response.text);
        console.log('[CHANGE OF STATEMENT AGENT QUEUE] JSON text to parse:', jsonText);
        
        const analysis = JSON.parse(jsonText);
        console.log('[CHANGE OF STATEMENT AGENT QUEUE] Parsed analysis:', analysis);
        
        this.name = analysis.taskName || `Change of Statement: ${userQuery.substring(0, 30)}...`;
        this.intent = analysis.intent || '';
        
        // Add task info to memory (without intent since it's in prompt)
        const taskMemory = `\n--- TASK INITIATION ---\nTask Name: ${this.name}\nUser Query: ${userQuery}\n--- END INITIATION ---\n`;
        console.log(`[CHANGE OF STATEMENT AGENT] Adding to memory during initiation:`);
        console.log(`[CHANGE OF STATEMENT AGENT] Task memory:`, taskMemory);
        console.log(`[CHANGE OF STATEMENT AGENT] --- End Task Memory ---`);
        await this.getMemory().add(taskMemory);
        
        console.log(`[CHANGE OF STATEMENT AGENT] Task named: ${this.name}`);
        console.log(`[CHANGE OF STATEMENT AGENT] Intent: ${this.intent}`);
      } catch (error) {
        console.error('[CHANGE OF STATEMENT AGENT QUEUE] Error parsing JSON:', error);
        this.name = `Change of Statement: ${userQuery.substring(0, 30)}...`;
        this.intent = 'Unable to analyze intent - JSON parsing error';
      }
    } else {
      console.warn('[CHANGE OF STATEMENT AGENT QUEUE] Failed to get response from OpenAI:', response.error);
      this.name = `Change of Statement: ${userQuery.substring(0, 30)}...`;
      this.intent = 'Unable to analyze intent - API error';
    }
  }

  async addTasks(userQuery: string): Promise<void> {
    console.log(`[CHANGE OF STATEMENT AGENT] Adding tasks for query: ${userQuery}`);
    
    // Get all completed PDF tasks
    const allTasks = await this.dbService.getAllTasks();
    const pdfTasks = allTasks.filter(
      t => t.status === 'completed' && t.result && t.result.extractedTextPath
    );

    if (pdfTasks.length === 0) {
      throw new Error('No completed PDF tasks found to process');
    }

    console.log(`[CHANGE OF STATEMENT AGENT] Found ${pdfTasks.length} PDF documents to process`);

    // Sort documents chronologically by timestamp
    const sortedTasks = pdfTasks.sort((a, b) => {
      const timeA = a.result?.metadata?.inferredTimestamp || a.TimeStamp || a.createdAt;
      const timeB = b.result?.metadata?.inferredTimestamp || b.TimeStamp || b.createdAt;
      return new Date(timeA).getTime() - new Date(timeB).getTime();
    });

    console.log(`[CHANGE OF STATEMENT AGENT] Processing ${sortedTasks.length} documents in chronological order`);

    // Create a ResearchWorker task for each PDF
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
            console.log(`[CHANGE OF STATEMENT AGENT] Loaded previous article from: ${previousPdf.filename}`);
            console.log(`[CHANGE OF STATEMENT AGENT] Previous article preview (first 200 chars): ${previousArticle.substring(0, 200)}${previousArticle.length > 200 ? '...' : ''}`);
          } catch (error) {
            console.error(`[CHANGE OF STATEMENT AGENT] Failed to load previous article from ${previousPdf.filename}:`, error);
            previousArticle = 'Previous article could not be loaded.';
          }
        }

        const task: AgentTask = {
          id: `research-${pdf.id}`,
          type: 'research',
          payload: {
            article_id: pdf.id,
            question: userQuery,
            intent: this.intent,
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
        console.log(`[CHANGE OF STATEMENT AGENT] Added research task for: ${pdf.filename}${task.payload.timestamp ? ` with timestamp: ${task.payload.timestamp}` : ''}${previousPdf ? ` (previous: ${previousPdf.filename})` : ' (first document)'}`);
      } catch (error) {
        console.error(`[CHANGE OF STATEMENT AGENT] Error adding task for ${pdf.filename}:`, error);
      }
    }

    // Add a final WritingWorker task with timestamp information
    const articleIdMap = Object.fromEntries(sortedTasks.map(pdf => [pdf.id, pdf.filename]));
    const timestampMap = Object.fromEntries(sortedTasks.map(pdf => [pdf.id, pdf.result?.metadata?.inferredTimestamp || pdf.TimeStamp]));
    const writingTask: AgentTask = {
      id: `writing-${Date.now()}`,
      type: 'writing',
      payload: {
        question: userQuery,
        intent: this.intent,
        articleIdMap,
        timestampMap
      },
      status: 'pending',
    };
    await this.addTask(writingTask);
    console.log(`[CHANGE OF STATEMENT AGENT] Added writing task for final article with timestamp information for ${sortedTasks.length} documents`);
  }

  async process(): Promise<void> {
    console.log(`[CHANGE OF STATEMENT AGENT] Starting processing for: ${this.name}`);
    
    const tasks = await this.getTasks();
    const pendingTasks = tasks.filter(t => t.status === 'pending');
    
    console.log(`[CHANGE OF STATEMENT AGENT] Processing ${pendingTasks.length} pending tasks`);

    for (const task of pendingTasks) {
      try {
        // Mark task as processing
        await this.updateTask(task.id, { status: 'processing' });
        
        let worker;
        if (task.type === 'research') {
          worker = new ResearchWorker(this.getMemory());
        } else if (task.type === 'writing') {
          worker = new WritingWorker(this.getMemory());
        } else {
          throw new Error(`Unknown task type: ${task.type}`);
        }
        
        const result = await worker.process(task.payload, task.id);
        
        // Mark task as completed
        await this.updateTask(task.id, { 
          status: 'completed', 
          result: result 
        });
        
        console.log(`[CHANGE OF STATEMENT AGENT] Completed task: ${task.id}`);
      } catch (error) {
        console.error(`[CHANGE OF STATEMENT AGENT] Error processing task ${task.id}:`, error);
        await this.updateTask(task.id, { 
          status: 'failed', 
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  async ensuringFinish(): Promise<boolean> {
    console.log(`[CHANGE OF STATEMENT AGENT] Ensuring finish for: ${this.name}`);
    
    const tasks = await this.getTasks();
    const allCompleted = tasks.every(t => t.status === 'completed');
    const anyFailed = tasks.some(t => t.status === 'failed');
    
    if (allCompleted) {
      console.log(`[CHANGE OF STATEMENT AGENT] All tasks completed successfully`);
      
      // Add completion summary to memory
      const researchTasks = tasks.filter(t => t.type === 'research');
      const writingTasks = tasks.filter(t => t.type === 'writing');
      const summary = `\n--- TASK COMPLETION ---\nChange of statement analysis completed.\nResearched ${researchTasks.length} documents and generated ${writingTasks.length} article(s).\nTask: ${this.name}\n--- END COMPLETION ---\n`;
      await this.getMemory().add(summary);
      
      return true;
    } else if (anyFailed) {
      console.log(`[CHANGE OF STATEMENT AGENT] Some tasks failed`);
      return false;
    } else {
      console.log(`[CHANGE OF STATEMENT AGENT] Still processing...`);
      return false;
    }
  }

  getName(): string {
    return this.name;
  }
} 