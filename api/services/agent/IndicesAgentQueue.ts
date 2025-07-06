import { AgentQueue, AgentTask } from './agentQueue';
import { ComparisonWorker } from './Worker';
import { Memory } from './memory';
import { DatabaseService } from '../databaseService';
import { callReasoningModel, extractJsonFromResponse } from '../openaiUtil';
import fs from 'fs/promises';
import path from 'path';

export class IndicesAgentQueue extends AgentQueue {
  private name: string;
  private intent: string;
  private dbService: DatabaseService;

  constructor(memory: Memory) {
    super(memory);
    this.name = '';
    this.intent = '';
    this.dbService = new DatabaseService();
  }

  async initiate(userQuery: string): Promise<void> {
    console.log(`[INDICES AGENT] Initiating with query: ${userQuery}`);
    
    // Analyze user intent and generate task name using OpenAI
    const systemPrompt = 'You are a helpful assistant for analyzing user intent for document analysis tasks.';
    
    const userPrompt = `
You are analyzing a user query for an indices creation agent. The agent will analyze PDF documents and create scoring indices based on the user's question.

User Query: "${userQuery}"

Please provide:
1. A clear analysis of what the users' intent. 
2. A concise, descriptive name for this indices creation task (max 50 characters)

Output as JSON (do not wrap in markdown code blocks):
{
  "intent": "brief analysis of what user wants to measure",
  "taskName": "concise task name"
}
`;

    const response = await callReasoningModel(systemPrompt, userPrompt, '[INDICES AGENT QUEUE]');
    
    if (response.success) {
      try {
        // Extract JSON from markdown code blocks if present
        const jsonText = extractJsonFromResponse(response.text);
        console.log('[INDICES AGENT QUEUE] JSON text to parse:', jsonText);
        
        const analysis = JSON.parse(jsonText);
        console.log('[INDICES AGENT QUEUE] Parsed analysis:', analysis);
        
        this.name = analysis.taskName || `Indices: ${userQuery.substring(0, 30)}...`;
        this.intent = analysis.intent || '';
        
        // Add task info to memory (without intent since it's in prompt)
        const taskMemory = `\n--- TASK INITIATION ---\nTask Name: ${this.name}\nUser Query: ${userQuery}\n--- END INITIATION ---\n`;
        console.log(`[INDICES AGENT] Adding to memory during initiation:`);
        console.log(`[INDICES AGENT] Task memory:`, taskMemory);
        console.log(`[INDICES AGENT] --- End Task Memory ---`);
        await this.getMemory().add(taskMemory);
        
        console.log(`[INDICES AGENT] Task named: ${this.name}`);
        console.log(`[INDICES AGENT] Intent: ${this.intent}`);
      } catch (error) {
        console.error('[INDICES AGENT QUEUE] Error parsing JSON:', error);
        this.name = `Indices: ${userQuery.substring(0, 30)}...`;
        this.intent = 'Unable to analyze intent - JSON parsing error';
      }
    } else {
      console.warn('[INDICES AGENT QUEUE] Failed to get response from OpenAI:', response.error);
      this.name = `Indices: ${userQuery.substring(0, 30)}...`;
      this.intent = 'Unable to analyze intent - API error';
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

    // Create a ComparisonWorker task for each PDF
    for (const pdf of pdfTasks) {
      try {
        const task: AgentTask = {
          id: `indices-comparison-${pdf.id}`,
          type: 'comparison',
          payload: {
            article_id: pdf.id,
            question: userQuery,
            intent: this.intent,
            filename: pdf.filename,
            extractedTextPath: pdf.result!.extractedTextPath,
            timestamp: pdf.result?.metadata?.inferredTimestamp || pdf.TimeStamp
          },
          status: 'pending',
        };

        await this.addTask(task);
        console.log(`[INDICES AGENT] Added comparison task for: ${pdf.filename}${task.payload.timestamp ? ` with timestamp: ${task.payload.timestamp}` : ''}`);
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
        const worker = new ComparisonWorker(this.getMemory());
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
} 