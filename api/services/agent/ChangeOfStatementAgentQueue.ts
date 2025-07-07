import { AgentQueue, AgentTask } from './agentQueue';
import { ChangeOfStatementWorker } from './Worker';
import { Memory } from './memory';
import { DatabaseService } from '../databaseService';
import { callReasoningModel, extractJsonFromResponse } from '../openaiUtil';
import fs from 'fs/promises';
import path from 'path';

export class ChangeOfStatementAgentQueue extends AgentQueue {
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
    console.log(`[CHANGE OF STATEMENT AGENT] Initiating with query: ${userQuery}`);
    
    // Analyze user intent and generate task name using OpenAI
    const systemPrompt = 'You are a helpful assistant for analyzing user intent for statement change analysis tasks.';
    
    const userPrompt = `
You are analyzing a user query for a change of statement agent. The agent will analyze PDF documents to identify and track changes in language, tone, messaging, or statements over time.

User Query: "${userQuery}"

Please provide:
1. A clear analysis of what changes in statements/language the user wants to track.
2. A concise, descriptive name for this statement change analysis task (max 50 characters)

Output as JSON (do not wrap in markdown code blocks):
{
  "intent": "brief analysis of what statement changes to track",
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
        
        this.name = analysis.taskName || `Statement Changes: ${userQuery.substring(0, 30)}...`;
        this.intent = analysis.intent || '';
        
        // Initialize the queue with the analyzed name and type
        await this.initializeQueue(this.name, 'change_statement');
        
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
        this.name = `Statement Changes: ${userQuery.substring(0, 30)}...`;
        this.intent = 'Unable to analyze intent - JSON parsing error';
      }
    } else {
      console.warn('[CHANGE OF STATEMENT AGENT QUEUE] Failed to get response from OpenAI:', response.error);
      this.name = `Statement Changes: ${userQuery.substring(0, 30)}...`;
      this.intent = 'Unable to analyze intent - API error';
    }
  }

  getTaskName(): string {
    return this.name;
  }

  getIntent(): string {
    return this.intent;
  }

  async addStatementTask(filename: string, extractedTextPath: string, articleId: string, timestamp?: string): Promise<void> {
    console.log(`[CHANGE OF STATEMENT AGENT] Adding task for file: ${filename}`);
    
    const taskId = `change_statement_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const task: AgentTask = {
      id: taskId,
      type: 'change_statement',
      payload: {
        filename,
        extractedTextPath,
        article_id: articleId,
        question: `Analyze changes in statements, language, or messaging. Focus on: ${this.intent}`,
        intent: this.intent,
        timestamp,
        taskId
      },
      status: 'pending',
      metadata: {
        filename,
        articleId,
        timestamp
      }
    };

    await this.addTask(task);
    console.log(`[CHANGE OF STATEMENT AGENT] Task ${taskId} added to queue for ${filename}`);
  }

  async processTask(task: AgentTask): Promise<any> {
    console.log(`[CHANGE OF STATEMENT AGENT] Processing task: ${task.id}`);
    
    try {
      const worker = new ChangeOfStatementWorker(this.getMemory());
      const result = await worker.process(task.payload, task.id);
      
      console.log(`[CHANGE OF STATEMENT AGENT] Task ${task.id} completed successfully`);
      console.log(`[CHANGE OF STATEMENT AGENT] Result:`, JSON.stringify(result, null, 2));
      
      return result;
    } catch (error) {
      console.error(`[CHANGE OF STATEMENT AGENT] Task ${task.id} failed:`, error);
      throw error;
    }
  }

  async addTasks(userQuery: string): Promise<void> {
    console.log(`[CHANGE OF STATEMENT AGENT] Starting document processing`);
    
    try {
      // Get all completed PDF processing tasks
      const allTasks = await this.dbService.getAllTasks();
      const completedTasks = allTasks.filter(task => task.status === 'completed' && task.result);
      
      console.log(`[CHANGE OF STATEMENT AGENT] Found ${completedTasks.length} completed tasks to process`);
      
      // Sort by timestamp for chronological analysis
      const sortedTasks = completedTasks.sort((a, b) => {
        const timeA = a.result?.metadata?.inferredTimestamp || a.TimeStamp || a.createdAt;
        const timeB = b.result?.metadata?.inferredTimestamp || b.TimeStamp || b.createdAt;
        return new Date(timeA).getTime() - new Date(timeB).getTime();
      });
      
      console.log(`[CHANGE OF STATEMENT AGENT] Processing ${sortedTasks.length} documents in chronological order`);
      
      for (const task of sortedTasks) {
        try {
          console.log(`[CHANGE OF STATEMENT AGENT] Adding document: ${task.filename}`);
          
          const timestamp = task.result?.metadata?.inferredTimestamp || task.TimeStamp || task.createdAt;
          await this.addStatementTask(
            task.filename, 
            task.result!.extractedTextPath, 
            task.id,
            timestamp
          );
        } catch (error) {
          console.error(`[CHANGE OF STATEMENT AGENT] Error adding task for ${task.filename}:`, error);
        }
      }
      
      console.log(`[CHANGE OF STATEMENT AGENT] Finished adding all document tasks to queue`);
    } catch (error) {
      console.error(`[CHANGE OF STATEMENT AGENT] Error in addTasks:`, error);
      throw error;
    }
  }

  // Override the process method from base class
  async process(): Promise<void> {
    console.log(`[CHANGE OF STATEMENT AGENT] Starting queue processing`);
    
    try {
      const tasks = await this.getTasks();
      const pendingTasks = tasks.filter(task => task.status === 'pending');
      
      console.log(`[CHANGE OF STATEMENT AGENT] Found ${pendingTasks.length} pending tasks to process`);
      
      for (const task of pendingTasks) {
        try {
          // Update task status to processing
          await this.updateTask(task.id, { status: 'processing' });
          
          // Process the task
          const result = await this.processTask(task);
          
          // Update task with result
          await this.updateTask(task.id, { 
            status: 'completed',
            result: result
          });
          
        } catch (error) {
          console.error(`[CHANGE OF STATEMENT AGENT] Error processing task ${task.id}:`, error);
          await this.updateTask(task.id, { 
            status: 'failed',
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
      
      console.log(`[CHANGE OF STATEMENT AGENT] Finished processing all tasks`);
    } catch (error) {
      console.error(`[CHANGE OF STATEMENT AGENT] Error in process:`, error);
      throw error;
    }
  }
} 