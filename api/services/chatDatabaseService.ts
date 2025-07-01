import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import path from 'path';
import fs from 'fs/promises';

export interface ChatMessage {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
  mentions?: string[];
  sessionId?: string;
}

export interface ChatSession {
  id: string;
  name: string;
  createdAt: Date;
  lastActivity: Date;
  messageCount: number;
  documents?: string[]; // Array of document filenames mentioned in this session
}

interface ChatDatabaseSchema {
  messages: ChatMessage[];
  sessions: ChatSession[];
  settings: {
    lastBackup: string;
    version: string;
  };
  statistics: {
    totalMessages: number;
    totalSessions: number;
    lastMessageDate: string;
  };
}

// Simple mutex implementation for database locking
class Mutex {
  private locked = false;
  private waitQueue: Array<() => void> = [];

  async acquire(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.locked) {
        this.locked = true;
        resolve();
      } else {
        this.waitQueue.push(resolve);
      }
    });
  }

  release(): void {
    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift()!;
      next();
    } else {
      this.locked = false;
    }
  }
}

export class ChatDatabaseService {
  private db: Low<ChatDatabaseSchema>;
  private dbPath: string;
  private mutex = new Mutex(); // Add mutex for database locking

  constructor() {
    this.dbPath = path.join(process.cwd(), 'data', 'chat-database.json');
    const adapter = new JSONFile<ChatDatabaseSchema>(this.dbPath);
    this.db = new Low(adapter, {
      messages: [],
      sessions: [],
      settings: {
        lastBackup: new Date().toISOString(),
        version: '1.0.0'
      },
      statistics: {
        totalMessages: 0,
        totalSessions: 0,
        lastMessageDate: new Date().toISOString()
      }
    });
    
    // Initialize the database asynchronously
    this.initializeDatabase();
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.db.data) {
      await this.initializeDatabase();
    }
  }

  private async initializeDatabase(): Promise<void> {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.dbPath);
      await fs.mkdir(dataDir, { recursive: true });

      // Set default data if database is empty
      await this.db.read();
      
      if (!this.db.data) {
        this.db.data = {
          messages: [],
          sessions: [],
          settings: {
            lastBackup: new Date().toISOString(),
            version: '1.0.0'
          },
          statistics: {
            totalMessages: 0,
            totalSessions: 0,
            lastMessageDate: new Date().toISOString()
          }
        };
        await this.db.write();
        console.log('[CHAT DATABASE] Initialized new chat database');
      } else {
        console.log('[CHAT DATABASE] Loaded existing chat database');
      }
    } catch (error) {
      console.error('[CHAT DATABASE] Error initializing database:', error);
      throw error;
    }
  }

  // Message management methods
  async addMessage(message: ChatMessage): Promise<void> {
    console.log(`[CHAT DATABASE] Adding message to database: ${message.id}`);
    
    // Acquire mutex lock before database operations
    await this.mutex.acquire();
    
    try {
      await this.ensureInitialized();
      await this.db.read();
      
      if (!this.db.data) {
        throw new Error('Chat database data is null');
      }
      
      this.db.data.messages.push(message);
      this.db.data.statistics.totalMessages++;
      this.db.data.statistics.lastMessageDate = new Date().toISOString();
      
      await this.db.write();
      console.log(`[CHAT DATABASE] Successfully added message ${message.id} to database`);
    } catch (error) {
      console.error(`[CHAT DATABASE] Failed to add message ${message.id}:`, error);
      throw error;
    } finally {
      // Always release the mutex lock
      this.mutex.release();
    }
  }

  async getMessages(sessionId?: string, limit: number = 50): Promise<ChatMessage[]> {
    await this.ensureInitialized();
    await this.db.read();
    
    let messages = this.db.data!.messages;
    
    if (sessionId) {
      messages = messages.filter(msg => msg.sessionId === sessionId);
    }
    
    // Sort by timestamp (newest first) and limit
    return messages
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  async getMessage(messageId: string): Promise<ChatMessage | undefined> {
    await this.ensureInitialized();
    await this.db.read();
    return this.db.data!.messages.find(msg => msg.id === messageId);
  }

  async deleteMessage(messageId: string): Promise<boolean> {
    // Acquire mutex lock before database operations
    await this.mutex.acquire();
    
    try {
      await this.ensureInitialized();
      await this.db.read();
      const initialLength = this.db.data!.messages.length;
      this.db.data!.messages = this.db.data!.messages.filter(msg => msg.id !== messageId);
      
      if (this.db.data!.messages.length < initialLength) {
        this.db.data!.statistics.totalMessages--;
        await this.db.write();
        return true;
      }
      return false;
    } finally {
      // Always release the mutex lock
      this.mutex.release();
    }
  }

  // Session management methods
  async createSession(name: string, documents?: string[]): Promise<ChatSession> {
    // Acquire mutex lock before database operations
    await this.mutex.acquire();
    
    try {
      await this.ensureInitialized();
      await this.db.read();
      
      const session: ChatSession = {
        id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name,
        createdAt: new Date(),
        lastActivity: new Date(),
        messageCount: 0,
        documents
      };
      
      this.db.data!.sessions.push(session);
      this.db.data!.statistics.totalSessions++;
      await this.db.write();
      
      console.log(`[CHAT DATABASE] Created new session: ${session.id}`);
      return session;
    } finally {
      // Always release the mutex lock
      this.mutex.release();
    }
  }

  async getSession(sessionId: string): Promise<ChatSession | undefined> {
    await this.ensureInitialized();
    await this.db.read();
    return this.db.data!.sessions.find(session => session.id === sessionId);
  }

  async getAllSessions(): Promise<ChatSession[]> {
    await this.ensureInitialized();
    await this.db.read();
    return this.db.data!.sessions.sort((a, b) => 
      new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
    );
  }

  async updateSession(sessionId: string, updates: Partial<ChatSession>): Promise<boolean> {
    // Acquire mutex lock before database operations
    await this.mutex.acquire();
    
    try {
      await this.ensureInitialized();
      await this.db.read();
      
      const sessionIndex = this.db.data!.sessions.findIndex(session => session.id === sessionId);
      if (sessionIndex === -1) {
        return false;
      }
      
      this.db.data!.sessions[sessionIndex] = {
        ...this.db.data!.sessions[sessionIndex],
        ...updates,
        lastActivity: new Date()
      };
      
      await this.db.write();
      return true;
    } finally {
      // Always release the mutex lock
      this.mutex.release();
    }
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    // Acquire mutex lock before database operations
    await this.mutex.acquire();
    
    try {
      await this.ensureInitialized();
      await this.db.read();
      
      const initialLength = this.db.data!.sessions.length;
      this.db.data!.sessions = this.db.data!.sessions.filter(session => session.id !== sessionId);
      
      // Also delete all messages in this session
      const initialMessageCount = this.db.data!.messages.length;
      this.db.data!.messages = this.db.data!.messages.filter(msg => msg.sessionId !== sessionId);
      const deletedMessageCount = initialMessageCount - this.db.data!.messages.length;
      
      if (this.db.data!.sessions.length < initialLength) {
        this.db.data!.statistics.totalSessions--;
        this.db.data!.statistics.totalMessages -= deletedMessageCount;
        await this.db.write();
        return true;
      }
      return false;
    } finally {
      // Always release the mutex lock
      this.mutex.release();
    }
  }

  // Convenience methods
  async addMessageToSession(message: ChatMessage, sessionId: string): Promise<void> {
    message.sessionId = sessionId;
    await this.addMessage(message);
    const session = await this.getSession(sessionId);
    await this.updateSession(sessionId, { 
      messageCount: (session?.messageCount || 0) + 1 
    });
  }

  async getConversation(sessionId: string): Promise<ChatMessage[]> {
    return this.getMessages(sessionId);
  }

  async getStatistics(): Promise<ChatDatabaseSchema['statistics']> {
    await this.ensureInitialized();
    await this.db.read();
    return this.db.data!.statistics;
  }

  // Database maintenance methods
  async backup(): Promise<string> {
    // Acquire mutex lock before database operations
    await this.mutex.acquire();
    
    try {
      await this.ensureInitialized();
      await this.db.read();
      const backupPath = path.join(process.cwd(), 'data', `chat-backup-${Date.now()}.json`);
      await fs.writeFile(backupPath, JSON.stringify(this.db.data, null, 2));
      
      this.db.data!.settings.lastBackup = new Date().toISOString();
      await this.db.write();
      
      return backupPath;
    } finally {
      // Always release the mutex lock
      this.mutex.release();
    }
  }

  async getDatabaseInfo(): Promise<{
    messageCount: number;
    sessionCount: number;
    lastMessageDate: string;
    lastBackup: string;
    version: string;
  }> {
    await this.ensureInitialized();
    await this.db.read();
    
    return {
      messageCount: this.db.data!.messages.length,
      sessionCount: this.db.data!.sessions.length,
      lastMessageDate: this.db.data!.statistics.lastMessageDate,
      lastBackup: this.db.data!.settings.lastBackup,
      version: this.db.data!.settings.version
    };
  }

  async resetDatabase(): Promise<void> {
    // Acquire mutex lock before database operations
    await this.mutex.acquire();
    
    try {
      await this.ensureInitialized();
      this.db.data = {
        messages: [],
        sessions: [],
        settings: {
          lastBackup: new Date().toISOString(),
          version: '1.0.0'
        },
        statistics: {
          totalMessages: 0,
          totalSessions: 0,
          lastMessageDate: new Date().toISOString()
        }
      };
      await this.db.write();
      console.log('[CHAT DATABASE] Chat database reset');
    } finally {
      // Always release the mutex lock
      this.mutex.release();
    }
  }

  async cleanupOldMessages(daysToKeep: number = 30): Promise<number> {
    // Acquire mutex lock before database operations
    await this.mutex.acquire();
    
    try {
      await this.ensureInitialized();
      await this.db.read();
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      
      const initialLength = this.db.data!.messages.length;
      this.db.data!.messages = this.db.data!.messages.filter(msg => 
        new Date(msg.timestamp) > cutoffDate
      );
      
      const deletedCount = initialLength - this.db.data!.messages.length;
      if (deletedCount > 0) {
        this.db.data!.statistics.totalMessages -= deletedCount;
        await this.db.write();
      }
      
      return deletedCount;
    } finally {
      // Always release the mutex lock
      this.mutex.release();
    }
  }
} 