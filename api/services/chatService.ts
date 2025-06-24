import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import { DatabaseService } from './databaseService';

export interface ChatMessage {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
  mentions?: string[];
}

export interface ChatRequest {
  message: string;
  mentions: string[];
}

export interface ChatResponse {
  id: string;
  content: string;
  timestamp: Date;
}

export class ChatService {
  private openai: OpenAI;
  private databaseService: DatabaseService;

  constructor(databaseService: DatabaseService) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.databaseService = databaseService;
  }

  async processChat(request: ChatRequest): Promise<ChatResponse> {
    try {
      // Get all completed tasks
      const allTasks = await this.databaseService.getAllTasks();
      const completedTasks = allTasks.filter(task => task.status === 'completed' && task.result);

      // Build context based on mentions
      let context = '';
      let documentContext = '';

      const mentions = request.mentions as string[];
      
      if (mentions.includes('@all')) {
        // Include summaries from all documents
        const summaries = completedTasks.map(task => {
          const result = task.result!;
          return `Document: ${task.filename}\nSummary: ${result.summary}\n---`;
        });
        documentContext = summaries.join('\n\n');
        context = `You are analyzing ALL documents. Here are the summaries:\n\n${documentContext}`;
      } else if (mentions.length > 0) {
        // Include extracted text from mentioned documents
        const mentionedTasks = completedTasks.filter(task => 
          mentions.some(mention => mention === `@${task.filename}`)
        );

        const documentTexts = [];
        for (const task of mentionedTasks) {
          try {
            const extractedTextPath = path.join(__dirname, '..', task.result!.extractedTextPath);
            const extractedText = await fs.readFile(extractedTextPath, 'utf-8');
            documentTexts.push(`Document: ${task.filename}\nExtracted Text:\n${extractedText}\n---`);
          } catch (error) {
            console.error(`Error reading extracted text for ${task.filename}:`, error);
            documentTexts.push(`Document: ${task.filename}\nError: Could not read extracted text\n---`);
          }
        }
        documentContext = documentTexts.join('\n\n');
        context = `You are analyzing specific documents. Here is the extracted text:\n\n${documentContext}`;
      } else {
        // No specific mentions - provide general context about available documents
        const availableDocs = completedTasks.map(task => task.filename).join(', ');
        context = `You have access to the following processed documents: ${availableDocs}. Please ask the user to mention specific documents using @filename or @all to analyze all documents.`;
      }

      // Build the prompt
      const systemPrompt = `You are an AI assistant helping analyze PDF documents. You have access to processed documents and can provide insights based on their content.

${context}

Please provide helpful, accurate responses based on the document content. If the user asks about specific documents, focus on those. If they mention @all, provide insights across all documents.

Keep responses concise but informative.`;

      const userPrompt = request.message;

      // Call OpenAI API
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        max_tokens: 1000,
        temperature: 0.7,
      });

      const response = completion.choices[0]?.message?.content || 'Sorry, I could not generate a response.';

      return {
        id: Date.now().toString(),
        content: response,
        timestamp: new Date()
      };

    } catch (error) {
      console.error('Chat processing error:', error);
      throw new Error('Failed to process chat request');
    }
  }
} 