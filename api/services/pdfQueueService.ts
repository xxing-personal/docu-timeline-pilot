import async from 'async';
import { PDFTask } from '../types';
import { PDFProcessor } from './pdfProcessor';

export class PDFQueueService {
  private queue: async.QueueObject<PDFTask>;
  private tasks: Map<string, PDFTask> = new Map();
  private taskIdCounter = 1;
  private pdfProcessor: PDFProcessor;
  private taskOrder: string[] = []; // Maintain order of tasks

  constructor(pdfProcessor: PDFProcessor, concurrency: number = 1) {
    this.pdfProcessor = pdfProcessor;
    // 1. Initialize the queue with our worker function
    this.queue = async.queue(
      (task: PDFTask, callback) => {
        // The worker simply calls our async processing function
        this.processTask(task)
          .then(() => callback()) // Call callback with no error on success
          .catch(err => callback(err)); // Call callback with an error on failure
      },
      concurrency
    );

    // 2. Add a drain handler to know when the queue is empty
    this.queue.drain(() => {
      console.log('✅ All PDF tasks have been processed. The queue is now empty.');
    });
  }

  // 3. This is our async function that processes PDF tasks
  private async processTask(task: PDFTask): Promise<void> {
    console.log(`[START] Processing PDF Task #${task.id}: "${task.filename}"`);
    
    try {
      // Update task status to processing
      this.updateTaskStatus(task.id, 'processing', { startedAt: new Date() });
      
      // Process the PDF using the real PDFProcessor
      const result = await this.pdfProcessor.process(task);
      
      // Update task with completion
      this.updateTaskStatus(task.id, 'completed', {
        completedAt: new Date(),
        result: result
      });
      
      console.log(`[END] Finished PDF Task #${task.id}: "${task.filename}"`);
      
    } catch (error) {
      console.error(`[ERROR] Failed to process PDF Task #${task.id}: "${task.filename}"`, error);
      
      // Update task with failure
      this.updateTaskStatus(task.id, 'failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date()
      });
    }
  }

  // Helper method to update task status
  private updateTaskStatus(taskId: string, status: PDFTask['status'], updates: Partial<PDFTask> = {}): void {
    const task = this.tasks.get(taskId);
    if (task) {
      this.tasks.set(taskId, {
        ...task,
        status,
        ...updates
      });
    }
  }

  // 4. Public method to add new PDF tasks to the queue
  public addTask(filename: string, path: string): string {
    const taskId = `pdf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const task: PDFTask = {
      id: taskId,
      filename,
      path,
      status: 'pending',
      createdAt: new Date(),
      displayOrder: this.tasks.size
    };
    
    // Store task in the tasks map
    this.tasks.set(taskId, task);
    
    // Add task to the order array
    this.taskOrder.push(taskId);
    
    // Add task to the queue
    this.queue.push(task);
    console.log(`📥 Added PDF Task #${taskId} to the queue. Current length: ${this.queue.length()}`);
    
    return taskId;
  }

  // Get task by ID
  public getTask(taskId: string): PDFTask | undefined {
    return this.tasks.get(taskId);
  }

  // Get all tasks
  public getAllTasks(): PDFTask[] {
    return Array.from(this.tasks.values());
  }

  // Get queue statistics
  public async getQueueStats(): Promise<{ queue: { length: number; working: number } }> {
    return {
      queue: {
        length: this.queue.length(),
        working: this.queue.running()
      }
    };
  }

  // Queue control methods
  public pauseQueue(): void {
    this.queue.pause();
    console.log('⏸️ Queue paused');
  }

  public resumeQueue(): void {
    this.queue.resume();
    console.log('▶️ Queue resumed');
  }

  // Task management methods
  public removeTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    // Remove from tasks map
    this.tasks.delete(taskId);
    
    // Remove from task order array
    const orderIndex = this.taskOrder.indexOf(taskId);
    if (orderIndex > -1) {
      this.taskOrder.splice(orderIndex, 1);
    }

    console.log(`🗑️ Removed task ${taskId}`);
    return true;
  }

  public clearCompletedTasks(): number {
    let clearedCount = 0;
    const tasksToRemove: string[] = [];

    // Find completed tasks
    for (const [taskId, task] of this.tasks.entries()) {
      if (task.status === 'completed') {
        tasksToRemove.push(taskId);
      }
    }

    // Remove completed tasks
    for (const taskId of tasksToRemove) {
      if (this.removeTask(taskId)) {
        clearedCount++;
      }
    }

    console.log(`🧹 Cleared ${clearedCount} completed tasks`);
    return clearedCount;
  }

  // Safe reorder method that only works on completed tasks
  public reorderTasks(taskIds: string[]): boolean {
    // Validate that all tasks exist and are completed
    for (const taskId of taskIds) {
      const task = this.tasks.get(taskId);
      if (!task) {
        console.error(`❌ Task ${taskId} not found`);
        return false;
      }
      if (task.status !== 'completed') {
        console.error(`❌ Task ${taskId} is not completed (status: ${task.status})`);
        return false;
      }
    }

    // Create new task order array with only the specified completed tasks
    const newTaskOrder: string[] = [];
    
    // Add the specified tasks in the new order
    for (const taskId of taskIds) {
      newTaskOrder.push(taskId);
    }
    
    // Add any remaining completed tasks that weren't in the reorder list
    for (const taskId of this.taskOrder) {
      const task = this.tasks.get(taskId);
      if (task && task.status === 'completed' && !taskIds.includes(taskId)) {
        newTaskOrder.push(taskId);
      }
    }

    // Update the task order
    this.taskOrder = newTaskOrder;
    
    // Update display order for all tasks
    for (let i = 0; i < this.taskOrder.length; i++) {
      const taskId = this.taskOrder[i];
      const task = this.tasks.get(taskId);
      if (task) {
        this.tasks.set(taskId, { ...task, displayOrder: i });
      }
    }

    console.log(`🔄 Reordered ${taskIds.length} completed tasks`);
    return true;
  }
} 