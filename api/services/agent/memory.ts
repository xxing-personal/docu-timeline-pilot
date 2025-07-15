import OpenAI from 'openai';
import { MemoryDatabaseService } from './memoryDatabaseService';
import { callReasoningModel } from '../ModelUtils';

export class Memory {
  private id: string;
  private context: string = '';
  private maxLength: number = 1000; // Max characters
  private memoryDb: MemoryDatabaseService;

  constructor(id: string) {
    this.id = id;
    this.memoryDb = new MemoryDatabaseService();
  }

  async add(text: string): Promise<void> {
    this.context += `\n${text}`;
    if (this.context.length > this.maxLength) {
      await this.compress();
    }
    
    // Save snapshot to database using the correct method
    await this.memoryDb.addSnapshot({
      id: this.id,
      context: this.context,
      maxLength: this.maxLength,
      shrinkMode: 'compress'
    });
  }

  async getContext(): Promise<string> {
    return this.context;
  }

  private async compress(): Promise<void> {
    const targetLength = Math.floor(this.maxLength / 2);
    
    const systemPrompt = 'You are a helpful assistant that compresses and summarizes text.';
    const userPrompt = `The following is a long context string. Please compress or summarize it to fit within ${targetLength} characters, preserving as much important information as possible.\n\nContext:\n${this.context}`;
    
    const response = await callReasoningModel(systemPrompt, userPrompt, '[MEMORY COMPRESSION]');
    
    if (response.success && response.text) {
      this.context = response.text;
    }
    
    this.truncate();
  }

  private truncate(): void {
    if (this.context.length > this.maxLength) {
      this.context = this.context.substring(this.context.length - this.maxLength);
    }
  }
} 