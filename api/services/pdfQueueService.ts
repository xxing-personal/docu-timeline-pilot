import async from 'async';
import { PDFTask } from '../types';
import { PDFProcessor } from './pdfProcessor';
import { DatabaseService } from './databaseService';

export class PDFQueueService {
  private queue: async.QueueObject<PDFTask>;
  private taskOrder: string[] = []; // Maintain order of tasks
  private pdfProcessor: PDFProcessor;
  private databaseService: DatabaseService;
  private autoReorderCompleted: boolean = false; // Track if auto-reorder has been done

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
    this.queue.drain(async () => {
      console.log('✅ All PDF tasks have been processed. The queue is now empty.');
      
      // Auto-reorder by inferred timestamp after all tasks are completed
      await this.autoReorderByInferredTimestamp();
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
    const now = new Date();
    const task: PDFTask = {
      id: taskId,
      filename,
      path,
      status: 'pending',
      createdAt: now,
      displayOrder: this.taskOrder.length,
      sortingTimestamp: now.toISOString()
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
    // Check if auto-reorder by inferred timestamp has been completed
    if (!this.autoReorderCompleted) {
      console.error('❌ Manual reordering not allowed until auto-reorder by inferred timestamp is completed');
      return false;
    }

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

  // Check if auto-reorder by inferred timestamp has been completed
  public isAutoReorderCompleted(): boolean {
    return this.autoReorderCompleted;
  }

  // Get auto-reorder status for API responses
  public getAutoReorderStatus(): { completed: boolean; message: string } {
    if (this.autoReorderCompleted) {
      return {
        completed: true,
        message: 'Auto-reorder by inferred timestamp completed. Manual reordering is now allowed.'
      };
    } else {
      return {
        completed: false,
        message: 'Auto-reorder by inferred timestamp not yet completed. Manual reordering is disabled.'
      };
    }
  }

  private async autoReorderByInferredTimestamp(): Promise<void> {
    try {
      console.log('[QUEUE] Starting auto-reorder by inferred timestamp...');
      
      const allTasks = await this.databaseService.getAllTasks();
      const completedTasks = allTasks.filter(task => task.status === 'completed');
      
      if (completedTasks.length === 0) {
        console.log('[QUEUE] No completed tasks to reorder');
        return;
      }
      
      // Filter tasks that have inferred timestamps
      const tasksWithTimestamps = completedTasks.filter(task => 
        task.result?.metadata?.inferredTimestamp
      );
      
      if (tasksWithTimestamps.length === 0) {
        console.log('[QUEUE] No tasks with inferred timestamps found');
        return;
      }
      
      // Sort by inferred timestamp
      const sortedTaskIds = tasksWithTimestamps
        .sort((a, b) => {
          const timestampA = new Date(a.result?.metadata?.inferredTimestamp || 0).getTime();
          const timestampB = new Date(b.result?.metadata?.inferredTimestamp || 0).getTime();
          return timestampA - timestampB;
        })
        .map(task => task.id);
      
      // Update sortingTimestamp for each task
      for (const task of tasksWithTimestamps) {
        await this.databaseService.updateTask(task.id, {
          sortingTimestamp: task.result?.metadata?.inferredTimestamp || task.sortingTimestamp
        });
      }
      
      console.log(`[QUEUE] Auto-reordering ${sortedTaskIds.length} tasks by inferred timestamp`);
      
      // Perform the reorder
      const success = await this.reorderTasksByInferredTimestamp(sortedTaskIds);
      
      if (success) {
        console.log('[QUEUE] Auto-reorder by inferred timestamp completed successfully');
        this.autoReorderCompleted = true;
      } else {
        console.error('[QUEUE] Auto-reorder by inferred timestamp failed');
      }
      
    } catch (error) {
      console.error('[QUEUE] Error during auto-reorder by inferred timestamp:', error);
    }
  }

  // New method for reordering by inferred timestamp (separate from manual reorder)
  private async reorderTasksByInferredTimestamp(taskIds: string[]): Promise<boolean> {
    try {
      // Validate that all tasks exist and are completed
      for (const taskId of taskIds) {
        const task = await this.databaseService.getTask(taskId);
        if (!task) {
          console.error(`❌ Task ${taskId} not found during auto-reorder`);
          return false;
        }
        if (task.status !== 'completed') {
          console.error(`❌ Task ${taskId} is not completed during auto-reorder`);
          return false;
        }
        if (!task.result?.metadata?.inferredTimestamp) {
          console.error(`❌ Task ${taskId} has no inferred timestamp during auto-reorder`);
          return false;
        }
      }

      // Update the task order
      this.taskOrder = [...taskIds];
      
      console.log(`🔄 Auto-reordered ${taskIds.length} tasks by inferred timestamp`);
      return true;
    } catch (error) {
      console.error('Error during auto-reorder by inferred timestamp:', error);
      return false;
    }
  }

  // Update task result (for editing metadata, scores, etc.)
  public async updateTaskResult(taskId: string, result: any): Promise<boolean> {
    try {
      const success = await this.databaseService.updateTask(taskId, { result });
      if (success) {
        console.log(`✅ Updated result for task ${taskId}`);
      }
      return success;
    } catch (error) {
      console.error(`❌ Failed to update result for task ${taskId}:`, error);
      return false;
    }
  }

  // Regenerate a completed task
  public async regenerateTask(taskId: string): Promise<boolean> {
    try {
      const task = await this.databaseService.getTask(taskId);
      if (!task) {
        console.error(`❌ Task ${taskId} not found for regeneration`);
        return false;
      }

      // Reset task to pending status
      await this.databaseService.updateTask(taskId, {
        status: 'pending',
        startedAt: undefined,
        completedAt: undefined,
        error: undefined,
        result: undefined
      });

      // Add task back to queue
      this.queue.push(task);
      console.log(`🔄 Regenerated task ${taskId} - added back to queue`);
      
      return true;
    } catch (error) {
      console.error(`❌ Failed to regenerate task ${taskId}:`, error);
      return false;
    }
  }
} 