import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import path from 'path';
import fs from 'fs/promises';
import { AgentTask } from './agentQueue';

interface AgentQueueDatabaseSchema {
  tasks: AgentTask[];
  taskOrder: string[];
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

export class AgentQueueDatabaseService {
  private db: Low<AgentQueueDatabaseSchema>;
  private dbPath: string;
  private mutex = new Mutex(); // Add mutex for database locking

  constructor() {
    this.dbPath = path.join(process.cwd(), 'data', 'agent-queue.json');
    const adapter = new JSONFile<AgentQueueDatabaseSchema>(this.dbPath);
    this.db = new Low(adapter, { tasks: [], taskOrder: [] });
    this.initializeDatabase();
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.db.data) {
      await this.initializeDatabase();
    }
  }

  private async initializeDatabase(): Promise<void> {
    try {
      const dataDir = path.dirname(this.dbPath);
      await fs.mkdir(dataDir, { recursive: true });
      await this.db.read();
      if (!this.db.data) {
        this.db.data = { tasks: [], taskOrder: [] };
        await this.db.write();
      }
    } catch (error) {
      console.error('[AGENT QUEUE DB] Error initializing database:', error);
      throw error;
    }
  }

  async addTask(task: AgentTask) {
    // Acquire mutex lock before database operations
    await this.mutex.acquire();
    
    try {
      await this.ensureInitialized();
      await this.db.read();
      
      // Ensure arrays exist
      if (!this.db.data!.tasks) {
        this.db.data!.tasks = [];
      }
      if (!this.db.data!.taskOrder) {
        this.db.data!.taskOrder = [];
      }
      
      this.db.data!.tasks.push(task);
      this.db.data!.taskOrder.push(task.id);
      await this.db.write();
    } finally {
      // Always release the mutex lock
      this.mutex.release();
    }
  }

  async updateTask(taskId: string, updates: Partial<AgentTask>): Promise<boolean> {
    // Acquire mutex lock before database operations
    await this.mutex.acquire();
    
    try {
      await this.ensureInitialized();
      await this.db.read();
      const idx = this.db.data!.tasks.findIndex(t => t.id === taskId);
      if (idx === -1) return false;
      this.db.data!.tasks[idx] = { ...this.db.data!.tasks[idx], ...updates };
      await this.db.write();
      return true;
    } finally {
      // Always release the mutex lock
      this.mutex.release();
    }
  }

  async getTask(taskId: string): Promise<AgentTask | undefined> {
    await this.ensureInitialized();
    await this.db.read();
    return this.db.data!.tasks.find(t => t.id === taskId);
  }

  async getAllTasks(): Promise<AgentTask[]> {
    await this.ensureInitialized();
    await this.db.read();
    
    // Ensure tasks array exists
    if (!this.db.data!.tasks) {
      this.db.data!.tasks = [];
    }
    
    return this.db.data!.tasks;
  }

  async getTaskOrder(): Promise<string[]> {
    await this.ensureInitialized();
    await this.db.read();
    return this.db.data!.taskOrder;
  }

  async setTaskOrder(order: string[]) {
    // Acquire mutex lock before database operations
    await this.mutex.acquire();
    
    try {
      await this.ensureInitialized();
      await this.db.read();
      this.db.data!.taskOrder = order;
      await this.db.write();
    } finally {
      // Always release the mutex lock
      this.mutex.release();
    }
  }
} 