import { AgentQueueDatabaseService, QueueMetadata, TaskMetadata } from './agentQueueDatabaseService';
import { Memory } from './memory';
import { MemoryDatabaseService } from './memoryDatabaseService';

export interface AgentTask {
  id: string;
  type: string;
  payload?: any; // Optional lightweight payload
  status: 'pending' | 'processing' | 'completed' | 'failed';
  metadata?: Record<string, any>;
  resultPath?: string;
  result?: any;
  error?: string;
}

export class AgentQueue {
  private db: AgentQueueDatabaseService;
  private memoryDb: MemoryDatabaseService;
  private memory: Memory;
  private queueId: string;

  constructor(memory: Memory, queueId?: string) {
    this.db = new AgentQueueDatabaseService();
    this.memoryDb = new MemoryDatabaseService();
    this.memory = memory;
    this.queueId = queueId || `queue-${memory['id']}`;
    console.log(`[AGENT QUEUE] Created new AgentQueue with queue id: ${this.queueId}, memory id: ${memory['id']}`);
  }

  async initializeQueue(name: string, type: string): Promise<void> {
    try {
      // Check if queue already exists
      const existingQueue = await this.db.getQueue(this.queueId);
      if (!existingQueue) {
        await this.db.createQueue({
          id: this.queueId,
          name,
          type,
          status: 'active'
        });
        console.log(`[AGENT QUEUE] Created new queue: ${this.queueId} (${name})`);
      } else {
        console.log(`[AGENT QUEUE] Using existing queue: ${this.queueId}`);
      }
    } catch (error) {
      console.error(`[AGENT QUEUE] Failed to initialize queue: ${this.queueId}`, error);
      throw error;
    }
  }

  async addTask(task: AgentTask): Promise<void> {
    try {
      const { payload, ...taskData } = task;
      
      const taskMetadata: Omit<TaskMetadata, 'createdAt' | 'updatedAt'> = {
        id: task.id,
        type: task.type,
        status: task.status,
        metadata: task.metadata || {},
        resultPath: task.resultPath,
        error: task.error
      };

      await this.db.addTask(this.queueId, taskMetadata, payload);
      console.log(`[AGENT QUEUE] Added task: ${task.id} (${task.type}) to queue: ${this.queueId}`);
    } catch (error) {
      console.error(`[AGENT QUEUE] Failed to add task: ${task.id}`, error);
      throw error;
    }
  }

  async getTasks(): Promise<AgentTask[]> {
    try {
      const taskMetadatas = await this.db.getQueueTasks(this.queueId);
      const tasks: AgentTask[] = [];

      for (const taskMetadata of taskMetadatas) {
        const payload = await this.db.getTaskPayload(this.queueId, taskMetadata.id);
        
        tasks.push({
          id: taskMetadata.id,
          type: taskMetadata.type,
          payload,
          status: taskMetadata.status,
          metadata: taskMetadata.metadata,
          resultPath: taskMetadata.resultPath,
          error: taskMetadata.error
        });
      }

      console.log(`[AGENT QUEUE] Retrieved ${tasks.length} tasks from queue: ${this.queueId}`);
      return tasks;
    } catch (error) {
      console.error(`[AGENT QUEUE] Failed to get tasks from queue: ${this.queueId}`, error);
      return [];
    }
  }

  async getTask(taskId: string): Promise<AgentTask | undefined> {
    try {
      const taskMetadata = await this.db.getTask(this.queueId, taskId);
      if (!taskMetadata) {
        console.warn(`[AGENT QUEUE] Task not found: ${taskId}`);
        return undefined;
      }

      const payload = await this.db.getTaskPayload(this.queueId, taskId);
      
      const task: AgentTask = {
        id: taskMetadata.id,
        type: taskMetadata.type,
        payload,
        status: taskMetadata.status,
        metadata: taskMetadata.metadata,
        resultPath: taskMetadata.resultPath,
        error: taskMetadata.error
      };

      console.log(`[AGENT QUEUE] Retrieved task: ${taskId}`);
      return task;
    } catch (error) {
      console.error(`[AGENT QUEUE] Failed to get task: ${taskId}`, error);
      return undefined;
    }
  }

  async updateTask(taskId: string, updates: Partial<AgentTask>): Promise<boolean> {
    try {
      const { payload, ...updateData } = updates;
      
      const taskUpdates: Partial<Omit<TaskMetadata, 'id' | 'createdAt'>> = {
        type: updateData.type,
        status: updateData.status,
        metadata: updateData.metadata,
        resultPath: updateData.resultPath,
        error: updateData.error
      };

      // Remove undefined values
      Object.keys(taskUpdates).forEach(key => {
        if (taskUpdates[key as keyof typeof taskUpdates] === undefined) {
          delete taskUpdates[key as keyof typeof taskUpdates];
        }
      });

      const result = await this.db.updateTask(this.queueId, taskId, taskUpdates);
      
      if (result) {
        console.log(`[AGENT QUEUE] Updated task: ${taskId} with updates: ${JSON.stringify(taskUpdates)}`);
      } else {
        console.warn(`[AGENT QUEUE] Failed to update task: ${taskId}`);
      }
      
      return result;
    } catch (error) {
      console.error(`[AGENT QUEUE] Failed to update task: ${taskId}`, error);
      return false;
    }
  }

  async getQueueInfo(): Promise<QueueMetadata | undefined> {
    try {
      return await this.db.getQueue(this.queueId);
    } catch (error) {
      console.error(`[AGENT QUEUE] Failed to get queue info: ${this.queueId}`, error);
      return undefined;
    }
  }

  async updateQueueStatus(status: QueueMetadata['status']): Promise<boolean> {
    try {
      return await this.db.updateQueue(this.queueId, { status });
    } catch (error) {
      console.error(`[AGENT QUEUE] Failed to update queue status: ${this.queueId}`, error);
      return false;
    }
  }

  protected getMemory(): Memory {
    return this.memory;
  }

  async processNext() {
    // TODO: process the next pending task using a Worker
  }

  // Abstract method to be implemented by subclasses
  async process(): Promise<void> {
    throw new Error('process() method must be implemented by subclasses');
  }

  // Restart from a certain task: resets all tasks from taskId onward to pending, loads memory snapshot for previous task
  async restartFromTask(taskId: string) {
    try {
      const tasks = await this.db.getQueueTasks(this.queueId);
      const taskIds = tasks.map(t => t.id);
      const idx = taskIds.indexOf(taskId);
      
      if (idx === -1) {
        console.error(`[AGENT QUEUE] Task not found in queue: ${taskId}`);
        throw new Error('Task not found in queue');
      }

      // Find the previous task (or use initial memory if first)
      const prevTaskId = idx > 0 ? taskIds[idx - 1] : null;
      let memoryContext = '';
      
      if (prevTaskId) {
        // Find the latest memory snapshot for prevTaskId
        const snapshots = await this.memoryDb.getSnapshots(this.memory['id']);
        // Find the last snapshot with taskId === prevTaskId
        const prevSnapshot = snapshots.reverse().find(s => (s as any).taskId === prevTaskId);
        if (prevSnapshot) memoryContext = prevSnapshot.context;
      }

      // Reset memory
      this.memory = new Memory(this.memory['id'], memoryContext, (this.memory as any).maxLength, (this.memory as any).shrinkMode);
      console.log(`[AGENT QUEUE] Memory reset for restart from task: ${taskId}`);

      // Reset all tasks from taskId onward
      for (let i = idx; i < taskIds.length; i++) {
        await this.db.updateTask(this.queueId, taskIds[i], { 
          status: 'pending', 
          resultPath: undefined 
        });
        console.log(`[AGENT QUEUE] Reset task to pending: ${taskIds[i]}`);
      }
    } catch (error) {
      console.error(`[AGENT QUEUE] Failed to restart from task: ${taskId}`, error);
      throw error;
    }
  }

  static async create(agentType: string, userQuery: string, queueName?: string): Promise<AgentQueue> {
    // Create a new memory and queue
    const memory = new Memory(`agent-${agentType}-${Date.now()}`);
    const queue = new AgentQueue(memory);
    
    // Initialize the queue in the database
    await queue.initializeQueue(
      queueName || `${agentType} Queue`,
      agentType
    );
    
    console.log(`[AGENT QUEUE] Static create for agentType: ${agentType}, userQuery: ${userQuery}`);
    return queue;
  }
} 