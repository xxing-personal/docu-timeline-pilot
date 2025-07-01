import { AgentQueue, AgentTask } from './agentQueue';
import { ResearchWorker, WritingWorker } from './Worker';
import { Memory } from './memory';
import { DatabaseService } from '../databaseService';
import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';

export class DeepResearchAgentQueue extends AgentQueue {
  private name: string;
  private intent: string;
  private dbService: DatabaseService;
  private openai: OpenAI;

  constructor(memory: Memory) {
    super(memory);
    this.name = '';
    this.intent = '';
    this.dbService = new DatabaseService();
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  }

  async initiate(userQuery: string): Promise<void> {
    console.log(`[DEEP RESEARCH AGENT] Initiating with query: ${userQuery}`);
    
    // Analyze user intent and generate task name using OpenAI
    const intentPrompt = `
You are analyzing a user query for a deep research agent. The agent will research PDF documents and generate a comprehensive article based on the user's question.

User Query: "${userQuery}"

Please provide:
1. A clear analysis of what the user wants to research or investigate
2. A concise, descriptive name for this research task (max 50 characters)

Output as JSON (do not wrap in markdown code blocks):
{
  "intent": "brief analysis of what user wants to research",
  "taskName": "concise task name"
}
`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a helpful assistant for analyzing user intent for research tasks.' },
          { role: 'user', content: intentPrompt }
        ],
        max_tokens: 200,
        temperature: 0.3,
      });

      const response = completion.choices[0]?.message?.content;
      if (response) {
        // Extract JSON from markdown code blocks if present
        let jsonText = response;
        const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (codeBlockMatch) {
          jsonText = codeBlockMatch[1].trim();
        }
        
        const analysis = JSON.parse(jsonText);
        this.name = analysis.taskName || `Research: ${userQuery.substring(0, 30)}...`;
        this.intent = analysis.intent || '';
        
        // Add task info to memory (without intent since it's in prompt)
        const taskMemory = `\n--- TASK INITIATION ---\nTask Name: ${this.name}\nUser Query: ${userQuery}\n--- END INITIATION ---\n`;
        console.log(`[DEEP RESEARCH AGENT] Adding to memory during initiation:`);
        console.log(`[DEEP RESEARCH AGENT] Task memory:`, taskMemory);
        console.log(`[DEEP RESEARCH AGENT] --- End Task Memory ---`);
        await this.getMemory().add(taskMemory);
        
        console.log(`[DEEP RESEARCH AGENT] Task named: ${this.name}`);
        console.log(`[DEEP RESEARCH AGENT] Intent: ${this.intent}`);
      }
    } catch (error) {
      console.error('[DEEP RESEARCH AGENT] Error analyzing intent:', error);
      this.name = `Research: ${userQuery.substring(0, 30)}...`;
    }
  }

  async addTasks(userQuery: string): Promise<void> {
    console.log(`[DEEP RESEARCH AGENT] Adding tasks for query: ${userQuery}`);
    
    // Get all completed PDF tasks
    const allTasks = await this.dbService.getAllTasks();
    const pdfTasks = allTasks.filter(
      t => t.status === 'completed' && t.result && t.result.extractedTextPath
    );

    if (pdfTasks.length === 0) {
      throw new Error('No completed PDF tasks found to process');
    }

    console.log(`[DEEP RESEARCH AGENT] Found ${pdfTasks.length} PDF documents to process`);

    // Create a ResearchWorker task for each PDF
    for (const pdf of pdfTasks) {
      try {
        const task: AgentTask = {
          id: `research-${pdf.id}`,
          type: 'research',
          payload: {
            article_id: pdf.id,
            question: userQuery,
            intent: this.intent,
            filename: pdf.filename,
            extractedTextPath: pdf.result!.extractedTextPath
          },
          status: 'pending',
        };

        await this.addTask(task);
        console.log(`[DEEP RESEARCH AGENT] Added research task for: ${pdf.filename}`);
      } catch (error) {
        console.error(`[DEEP RESEARCH AGENT] Error adding task for ${pdf.filename}:`, error);
      }
    }

    // Add a final WritingWorker task
    const articleIdMap = Object.fromEntries(pdfTasks.map(pdf => [pdf.id, pdf.filename]));
    const writingTask: AgentTask = {
      id: `writing-${Date.now()}`,
      type: 'writing',
      payload: {
        question: userQuery,
        intent: this.intent,
        articleIdMap
      },
      status: 'pending',
    };
    await this.addTask(writingTask);
    console.log(`[DEEP RESEARCH AGENT] Added writing task for final article`);
  }

  async process(): Promise<void> {
    console.log(`[DEEP RESEARCH AGENT] Starting processing for: ${this.name}`);
    
    const tasks = await this.getTasks();
    const pendingTasks = tasks.filter(t => t.status === 'pending');
    
    console.log(`[DEEP RESEARCH AGENT] Processing ${pendingTasks.length} pending tasks`);

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
        
        console.log(`[DEEP RESEARCH AGENT] Completed task: ${task.id}`);
      } catch (error) {
        console.error(`[DEEP RESEARCH AGENT] Error processing task ${task.id}:`, error);
        await this.updateTask(task.id, { 
          status: 'failed', 
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  async ensuringFinish(): Promise<boolean> {
    console.log(`[DEEP RESEARCH AGENT] Ensuring finish for: ${this.name}`);
    
    const tasks = await this.getTasks();
    const allCompleted = tasks.every(t => t.status === 'completed');
    const anyFailed = tasks.some(t => t.status === 'failed');
    
    if (allCompleted) {
      console.log(`[DEEP RESEARCH AGENT] All tasks completed successfully`);
      
      // Add completion summary to memory
      const researchTasks = tasks.filter(t => t.type === 'research');
      const writingTasks = tasks.filter(t => t.type === 'writing');
      const summary = `\n--- TASK COMPLETION ---\nDeep research completed.\nResearched ${researchTasks.length} documents and generated ${writingTasks.length} article(s).\nTask: ${this.name}\n--- END COMPLETION ---\n`;
      await this.getMemory().add(summary);
      
      return true;
    } else if (anyFailed) {
      console.log(`[DEEP RESEARCH AGENT] Some tasks failed`);
      return false;
    } else {
      console.log(`[DEEP RESEARCH AGENT] Still processing...`);
      return false;
    }
  }

  getName(): string {
    return this.name;
  }
} 