import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import path from 'path';
import fs from 'fs/promises';

export interface QueueMetadata {
  id: string;
  name: string;
  type: string;
  status: 'active' | 'paused' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
  tasks: { [taskId: string]: TaskMetadata }; // tasks nested under queue
}

export interface TaskMetadata {
  id: string;
  type: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  metadata: Record<string, any>; // lightweight metadata only
  dataPath?: string; // path to separate data file for large payloads
  resultPath?: string;
  result?: any;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

interface QueueDatabaseSchema {
  queues: { [queueId: string]: QueueMetadata };
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
  private db: Low<QueueDatabaseSchema>;
  private dbPath: string;
  private mutex = new Mutex();

  constructor() {
    this.dbPath = path.join(process.cwd(), 'data', 'agent-queues.json');
    const adapter = new JSONFile<QueueDatabaseSchema>(this.dbPath);
    this.db = new Low(adapter, { queues: {} });
    this.initializeDatabase();
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.db.data) {
      await this.initializeDatabase();
    }
  }

  private async initializeDatabase(): Promise<void> {
    try {
      const dbDir = path.dirname(this.dbPath);
      await fs.mkdir(dbDir, { recursive: true });
      await this.db.read();
      if (!this.db.data) {
        this.db.data = { queues: {} };
        await this.db.write();
      }
    } catch (error) {
      console.error('[QUEUE DB] Error initializing database:', error);
      throw error;
    }
  }

  // Queue operations
  async createQueue(queueData: Omit<QueueMetadata, 'createdAt' | 'updatedAt' | 'tasks'>): Promise<QueueMetadata> {
    await this.mutex.acquire();
    
    try {
      await this.ensureInitialized();
      await this.db.read();
      
      const now = new Date().toISOString();
      const queue: QueueMetadata = {
        ...queueData,
        tasks: {},
        createdAt: now,
        updatedAt: now
      };
      
      this.db.data!.queues[queue.id] = queue;
      await this.db.write();
      return queue;
    } finally {
      this.mutex.release();
    }
  }

  async getQueue(queueId: string): Promise<QueueMetadata | undefined> {
    await this.ensureInitialized();
    await this.db.read();
    return this.db.data!.queues[queueId];
  }

  async getAllQueues(): Promise<QueueMetadata[]> {
    await this.ensureInitialized();
    await this.db.read();
    return Object.values(this.db.data!.queues);
  }

  async updateQueue(queueId: string, updates: Partial<Omit<QueueMetadata, 'id' | 'createdAt' | 'tasks'>>): Promise<boolean> {
    await this.mutex.acquire();
    
    try {
      await this.ensureInitialized();
      await this.db.read();
      
      const queue = this.db.data!.queues[queueId];
      if (!queue) return false;
      
      this.db.data!.queues[queueId] = {
        ...queue,
        ...updates,
        updatedAt: new Date().toISOString()
      };
      
      await this.db.write();
      return true;
    } finally {
      this.mutex.release();
    }
  }

  // Task operations
  async addTask(queueId: string, taskData: Omit<TaskMetadata, 'createdAt' | 'updatedAt'>, payload?: any): Promise<TaskMetadata> {
    await this.mutex.acquire();
    
    try {
      await this.ensureInitialized();
      await this.db.read();
      
      const queue = this.db.data!.queues[queueId];
      if (!queue) {
        throw new Error(`Queue ${queueId} not found`);
      }
      
      const now = new Date().toISOString();
      const task: TaskMetadata = {
        ...taskData,
        createdAt: now,
        updatedAt: now
      };
      
      // Store payload directly in the task object if provided
      if (payload) {
        (task as any).payload = payload;
      }
      
      // Add task to queue
      queue.tasks[task.id] = task;
      queue.updatedAt = now;
      
      await this.db.write();
      return task;
    } finally {
      this.mutex.release();
    }
  }

  async getTask(queueId: string, taskId: string): Promise<TaskMetadata | undefined> {
    await this.ensureInitialized();
    await this.db.read();
    
    const queue = this.db.data!.queues[queueId];
    if (!queue) return undefined;
    
    return queue.tasks[taskId];
  }

  async getTaskPayload(queueId: string, taskId: string): Promise<any | undefined> {
    const task = await this.getTask(queueId, taskId);
    if (!task) return undefined;
    // Return the payload property if present
    return (task as any).payload;
  }

  async getQueueTasks(queueId: string): Promise<TaskMetadata[]> {
    await this.ensureInitialized();
    await this.db.read();
    
    const queue = this.db.data!.queues[queueId];
    if (!queue) return [];
    
    return Object.values(queue.tasks);
  }

  async updateTask(queueId: string, taskId: string, updates: Partial<Omit<TaskMetadata, 'id' | 'createdAt'>>): Promise<boolean> {
    await this.mutex.acquire();
    
    try {
      await this.ensureInitialized();
      await this.db.read();
      
      const queue = this.db.data!.queues[queueId];
      if (!queue || !queue.tasks[taskId]) return false;
      
      queue.tasks[taskId] = {
        ...queue.tasks[taskId],
        ...updates,
        updatedAt: new Date().toISOString()
      };
      
      queue.updatedAt = new Date().toISOString();
      
      await this.db.write();
      return true;
    } finally {
      this.mutex.release();
    }
  }

  async deleteQueue(queueId: string): Promise<boolean> {
    await this.mutex.acquire();
    
    try {
      await this.ensureInitialized();
      await this.db.read();
      
      const queue = this.db.data!.queues[queueId];
      if (!queue) return false;
      
      // Delete all task payloads
      for (const task of Object.values(queue.tasks)) {
        if ((task as any).payload) {
          delete (task as any).payload;
        }
      }
      
      // Delete queue (this automatically deletes all nested tasks)
      delete this.db.data!.queues[queueId];
      
      await this.db.write();
      return true;
    } finally {
      this.mutex.release();
    }
  }

  // Helper method for backward compatibility - find task across all queues
  async findTaskInAnyQueue(taskId: string): Promise<{ queueId: string; task: TaskMetadata } | undefined> {
    await this.ensureInitialized();
    await this.db.read();
    
    for (const [queueId, queue] of Object.entries(this.db.data!.queues)) {
      if (queue.tasks[taskId]) {
        return { queueId, task: queue.tasks[taskId] };
      }
    }
    
    return undefined;
  }
} 