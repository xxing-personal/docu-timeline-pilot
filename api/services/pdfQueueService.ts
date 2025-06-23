import async from 'async';
import { PDFTask } from '../types';
import { PDFProcessor } from './pdfProcessor';
import { DatabaseService } from './databaseService';

export class PDFQueueService {
  private queue: async.QueueObject<PDFTask>;
  private taskOrder: string[] = []; // Maintain order of tasks
  private pdfProcessor: PDFProcessor;
  private databaseService: DatabaseService;

  constructor(pdfProcessor: PDFProcessor, databaseService: DatabaseService, concurrency: number = 1) {
    this.pdfProcessor = pdfProcessor;
    this.databaseService = databaseService;
    
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
      await this.updateTaskStatus(task.id, 'processing', { startedAt: new Date() });
      
      // Process the PDF using the real PDFProcessor
      const result = await this.pdfProcessor.process(task);
      
      // Update task with completion
      await this.updateTaskStatus(task.id, 'completed', {
        completedAt: new Date(),
        result: result
      });
      
      // Update statistics
      await this.databaseService.updateStatistics(true, false);
      
      console.log(`[END] Finished PDF Task #${task.id}: "${task.filename}"`);
      
    } catch (error) {
      console.error(`[ERROR] Failed to process PDF Task #${task.id}: "${task.filename}"`, error);
      
      // Update task with failure
      await this.updateTaskStatus(task.id, 'failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date()
      });
      
      // Update statistics
      await this.databaseService.updateStatistics(false, true);
    }
  }

  // Helper method to update task status
  private async updateTaskStatus(taskId: string, status: PDFTask['status'], updates: Partial<PDFTask> = {}): Promise<void> {
    await this.databaseService.updateTask(taskId, { status, ...updates });
  }

  // 4. Public method to add new PDF tasks to the queue
  public async addTask(filename: string, path: string): Promise<string> {
    const taskId = `pdf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const task: PDFTask = {
      id: taskId,
      filename,
      path,
      status: 'pending',
      createdAt: new Date(),
      displayOrder: this.taskOrder.length
    };
    
    // Store task in database
    await this.databaseService.addTask(task);
    
    // Add task to the order array
    this.taskOrder.push(taskId);
    
    // Add task to the queue
    this.queue.push(task);
    console.log(`📥 Added PDF Task #${taskId} to the queue. Current length: ${this.queue.length()}`);
    
    return taskId;
  }

  // Get task by ID
  public async getTask(taskId: string): Promise<PDFTask | undefined> {
    return await this.databaseService.getTask(taskId);
  }

  // Get all tasks
  public async getAllTasks(): Promise<PDFTask[]> {
    return await this.databaseService.getAllTasks();
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
  public async removeTask(taskId: string): Promise<boolean> {
    const removed = await this.databaseService.removeTask(taskId);
    
    if (removed) {
      // Remove from task order array
      const orderIndex = this.taskOrder.indexOf(taskId);
      if (orderIndex > -1) {
        this.taskOrder.splice(orderIndex, 1);
      }
      console.log(`🗑️ Removed task ${taskId}`);
    }
    
    return removed;
  }

  public async clearCompletedTasks(): Promise<number> {
    const clearedCount = await this.databaseService.clearCompletedTasks();
    console.log(`🧹 Cleared ${clearedCount} completed tasks`);
    return clearedCount;
  }

  // Safe reorder method that only works on completed tasks
  public async reorderTasks(taskIds: string[]): Promise<boolean> {
    // Validate that all tasks exist and are completed
    for (const taskId of taskIds) {
      const task = await this.databaseService.getTask(taskId);
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
    const allTasks = await this.databaseService.getAllTasks();
    for (const task of allTasks) {
      if (task.status === 'completed' && !taskIds.includes(task.id)) {
        newTaskOrder.push(task.id);
      }
    }
    
    // Update the task order
    this.taskOrder = newTaskOrder;
    
    console.log(`🔄 Reordered ${taskIds.length} tasks`);
    return true;
  }

  // Database service access
  public getDatabaseService(): DatabaseService {
    return this.databaseService;
  }
} 