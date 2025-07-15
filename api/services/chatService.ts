import express from 'express';
import { ChatDatabaseService, ChatMessage } from './chatDatabaseService';
import { callReasoningModel } from './ModelUtils';

const router = express.Router();

export class ChatService {
  private chatDb: ChatDatabaseService;

  constructor() {
    this.chatDb = new ChatDatabaseService();
  }

  async processMessage(content: string, sessionId: string): Promise<{
    id: string;
    content: string;
    timestamp: Date;
    sessionId: string;
  }> {
    try {
      // Save user message to database
      const userMessage: ChatMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        content,
        isUser: true,
        timestamp: new Date(),
        sessionId
      };

      await this.chatDb.addMessage(userMessage);

      // Get recent message history for context
      const recentMessages = await this.chatDb.getMessages(sessionId, 10);
      
      // Create context from recent messages
      const context = recentMessages
        .filter(msg => msg.id !== userMessage.id) // Exclude the current message
        .map(msg => `${msg.isUser ? 'User' : 'Assistant'}: ${msg.content}`)
        .join('\n');

      // Create system prompt
      const systemPrompt = `You are a helpful AI assistant for a document analysis platform. You help users with:
- Understanding document content and analysis results
- Interpreting data visualizations and timelines
- Providing insights about document relationships
- Answering questions about the platform features

Keep responses concise but informative. Use the conversation context to provide relevant follow-up suggestions.`;

      // Create user prompt with context
      const userPrompt = context 
        ? `Previous conversation:\n${context}\n\nCurrent message: ${content}`
        : content;

      // Call OpenAI API using centralized utility
      const response = await callReasoningModel(systemPrompt, userPrompt, '[CHAT SERVICE]');

      const responseText = response.success 
        ? (response.text || "I apologize, but I couldn't generate a response.")
        : "I apologize, but I encountered an error while processing your request.";

      // Save AI response to database
      const aiMessage: ChatMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        content: responseText,
        isUser: false,
        timestamp: new Date(),
        sessionId
      };

      await this.chatDb.addMessage(aiMessage);

      return {
        id: aiMessage.id,
        content: responseText,
        timestamp: aiMessage.timestamp,
        sessionId
      };

    } catch (error) {
      console.error('[CHAT SERVICE] Error processing message:', error);
      throw new Error('Failed to process chat message');
    }
  }

  async getMessageHistory(sessionId: string, limit?: number): Promise<ChatMessage[]> {
    return this.chatDb.getMessages(sessionId, limit);
  }

  async createSession(): Promise<string> {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
} 