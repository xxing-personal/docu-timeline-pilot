import { AgentQueueDatabaseService } from './agentQueueDatabaseService';
import { Memory } from './memory';
import { MemoryDatabaseService } from './memoryDatabaseService';

export interface AgentTask {
  id: string;
  type: string;
  payload: any;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  resultPath?: string;
  result?: any;
  error?: string;
}

export class AgentQueue {
  private db: AgentQueueDatabaseService;
  private memoryDb: MemoryDatabaseService;
  private memory: Memory;

  constructor(memory: Memory) {
    this.db = new AgentQueueDatabaseService();
    this.memoryDb = new MemoryDatabaseService();
    this.memory = memory;
    console.log(`[AGENT QUEUE] Created new AgentQueue with memory id: ${memory['id']}`);
  }

  async addTask(task: AgentTask) {
    await this.db.addTask(task);
    console.log(`[AGENT QUEUE] Added task: ${task.id} (${task.type})`);
    // Optionally trigger worker processing here
  }

  async getTasks(): Promise<AgentTask[]> {
    const tasks = await this.db.getAllTasks();
    console.log(`[AGENT QUEUE] Retrieved all tasks (count: ${tasks.length})`);
    return tasks;
  }

  async getTask(taskId: string): Promise<AgentTask | undefined> {
    const task = await this.db.getTask(taskId);
    if (task) {
      console.log(`[AGENT QUEUE] Retrieved task: ${taskId}`);
    } else {
      console.warn(`[AGENT QUEUE] Task not found: ${taskId}`);
    }
    return task;
  }

  async updateTask(taskId: string, updates: Partial<AgentTask>): Promise<boolean> {
    const result = await this.db.updateTask(taskId, updates);
    if (result) {
      console.log(`[AGENT QUEUE] Updated task: ${taskId} with updates: ${JSON.stringify(updates)}`);
    } else {
      console.warn(`[AGENT QUEUE] Failed to update task: ${taskId}`);
    }
    return result;
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
    const allTasks = await this.db.getAllTasks();
    const order = await this.db.getTaskOrder();
    const idx = order.indexOf(taskId);
    if (idx === -1) {
      console.error(`[AGENT QUEUE] Task not found in order: ${taskId}`);
      throw new Error('Task not found in order');
    }
    // Find the previous task (or use initial memory if first)
    const prevTaskId = idx > 0 ? order[idx - 1] : null;
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
    for (let i = idx; i < order.length; i++) {
      const t = await this.db.getTask(order[i]);
      if (t) {
        await this.db.updateTask(t.id, { status: 'pending', resultPath: undefined });
        console.log(`[AGENT QUEUE] Reset task to pending: ${t.id}`);
      }
    }
    // Optionally, re-queue these tasks for processing
  }

  static create(agentType: string, userQuery: string) {
    // TODO: create a queue for the agent type
    // For now, just create a new memory and queue
    const memory = new Memory(`agent-${agentType}-${Date.now()}`);
    console.log(`[AGENT QUEUE] Static create for agentType: ${agentType}, userQuery: ${userQuery}`);
    return new AgentQueue(memory);
  }
} 