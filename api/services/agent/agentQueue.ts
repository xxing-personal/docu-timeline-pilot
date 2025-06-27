import { AgentQueueDatabaseService } from './agentQueueDatabaseService';
import { Memory } from './memory';
import { MemoryDatabaseService } from './memoryDatabaseService';

export interface AgentTask {
  id: string;
  type: string;
  payload: any;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  resultPath?: string;
}

export class AgentQueue {
  private db: AgentQueueDatabaseService;
  private memoryDb: MemoryDatabaseService;
  private memory: Memory;

  constructor(memory: Memory) {
    this.db = new AgentQueueDatabaseService();
    this.memoryDb = new MemoryDatabaseService();
    this.memory = memory;
  }

  async addTask(task: AgentTask) {
    await this.db.addTask(task);
    // Optionally trigger worker processing here
  }

  async getTasks(): Promise<AgentTask[]> {
    return await this.db.getAllTasks();
  }

  async getTask(taskId: string): Promise<AgentTask | undefined> {
    return await this.db.getTask(taskId);
  }

  async processNext() {
    // TODO: process the next pending task using a Worker
  }

  // Restart from a certain task: resets all tasks from taskId onward to pending, loads memory snapshot for previous task
  async restartFromTask(taskId: string) {
    const allTasks = await this.db.getAllTasks();
    const order = await this.db.getTaskOrder();
    const idx = order.indexOf(taskId);
    if (idx === -1) throw new Error('Task not found in order');
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
    // Reset all tasks from taskId onward
    for (let i = idx; i < order.length; i++) {
      const t = await this.db.getTask(order[i]);
      if (t) {
        await this.db.updateTask(t.id, { status: 'pending', resultPath: undefined });
      }
    }
    // Optionally, re-queue these tasks for processing
  }

  static create(agentType: string, userQuery: string) {
    // TODO: create a queue for the agent type
    // For now, just create a new memory and queue
    const memory = new Memory(`agent-${agentType}-${Date.now()}`);
    return new AgentQueue(memory);
  }
} 