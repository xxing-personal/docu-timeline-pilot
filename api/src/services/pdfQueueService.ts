import async from 'async';
import { PDFTask, QueueStats, TaskStats } from '../types';
import { PDFProcessor } from './pdfProcessor';

export class PDFQueueService {
  private pdfQueue: async.QueueObject<PDFTask>;
  private pdfProcessor: PDFProcessor;
  private tasks: Map<string, PDFTask> = new Map();
  private taskOrder: string[] = [];

  constructor(pdfProcessor: PDFProcessor, concurrency: number = 1) {
    this.pdfProcessor = pdfProcessor;
    
    // Create PDF processing queue with specified concurrency
    this.pdfQueue = async.queue<PDFTask>(async (task: PDFTask) => {
      const result = await this.processTask(task);
      return result;
    }, concurrency);

    // Queue event listeners for monitoring
    this.pdfQueue.error((error, task) => {
      console.error('Queue error for task:', task?.id, error);
    });

    this.pdfQueue.drain(() => {
      console.log('All PDF processing tasks completed');
    });
  }

  // Initialize service (no longer needs database)
  async init(): Promise<void> {
    // Nothing to initialize for in-memory queue
    console.log('PDF queue service initialized (in-memory)');
  }

  // Process a single task
  private async processTask(task: PDFTask): Promise<PDFTask | undefined> {
    console.log(`Starting to process PDF: ${task.filename} (ID: ${task.id})`);
    
    try {
      // Update status to processing
      const processingTask = this.updateTaskStatus(task.id, 'processing', { startedAt: new Date() });
      
      console.log(`Task ${task.id} is now in 'processing' state - beginning PDF content extraction`);
      
      // Process the PDF
      const result = await this.pdfProcessor.process(task);
      
      // Update task with completion
      const completedTask = this.updateTaskStatus(task.id, 'completed', {
        completedAt: new Date(),
        result: result
      });
      
      console.log(`Successfully processed PDF: ${task.filename} (${result.pageCount} pages, ${result.metadata?.textLength || 0} chars)`);
      
      return completedTask;
      
    } catch (error) {
      console.error(`Failed to process PDF: ${task.filename}`, error);
      
      // Update task with failure
      const failedTask = this.updateTaskStatus(task.id, 'failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date()
      });
      
      return failedTask;
    }
  }

  // Helper method to update task status
  private updateTaskStatus(taskId: string, status: PDFTask['status'], updates: Partial<PDFTask> = {}): PDFTask | undefined {
    const task = this.tasks.get(taskId);
    if (task) {
      const updatedTask = {
        ...task,
        status,
        ...updates
      };
      this.tasks.set(taskId, updatedTask);
      return updatedTask;
    }
    return undefined;
  }

  // Add a PDF task to the queue
  async addTask(filename: string, path: string): Promise<string> {
    // Validate PDF file before adding to queue
    const isValidPDF = await this.pdfProcessor.validatePDF(path);
    if (!isValidPDF) {
      throw new Error('Invalid PDF file');
    }
    
    const taskId = this.generateTaskId();
    
    const pdfTask: PDFTask = {
      id: taskId,
      filename,
      path,
      status: 'pending',
      createdAt: new Date(),
      displayOrder: this.taskOrder.length
    };
    
    // Store task in memory
    this.tasks.set(taskId, pdfTask);
    this.taskOrder.push(taskId);
    
    // Add task to processing queue
    this.pdfQueue.push(pdfTask);
    
    return taskId;
  }

  // Generate unique task ID
  private generateTaskId(): string {
    return `pdf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Get task by ID
  async getTask(taskId: string): Promise<PDFTask | undefined> {
    return this.tasks.get(taskId);
  }

  // Get all tasks (sorted by display order)
  async getAllTasks(): Promise<PDFTask[]> {
    return this.taskOrder
      .map(id => this.tasks.get(id))
      .filter((task): task is PDFTask => task !== undefined);
  }

  // Get tasks by status
  async getTasksByStatus(status: PDFTask['status']): Promise<PDFTask[]> {
    return Array.from(this.tasks.values()).filter(task => task.status === status);
  }

  // Get comprehensive queue statistics
  async getQueueStats(): Promise<{ queue: QueueStats; tasks: TaskStats }> {
    const allTasks = Array.from(this.tasks.values());
    
    const taskStats: TaskStats = {
      total: allTasks.length,
      pending: allTasks.filter(t => t.status === 'pending').length,
      processing: allTasks.filter(t => t.status === 'processing').length,
      completed: allTasks.filter(t => t.status === 'completed').length,
      failed: allTasks.filter(t => t.status === 'failed').length
    };
    
    return {
      queue: {
        length: this.pdfQueue.length(),
        working: this.pdfQueue.workersList().length,
        concurrency: this.pdfQueue.concurrency
      },
      tasks: taskStats
    };
  }

  // Queue control methods
  pauseQueue(): void {
    this.pdfQueue.pause();
  }

  resumeQueue(): void {
    this.pdfQueue.resume();
  }

  killQueue(): void {
    this.pdfQueue.kill();
  }

  // Set concurrency
  async setConcurrency(concurrency: number): Promise<void> {
    if (concurrency < 1 || concurrency > 10) {
      throw new Error('Concurrency must be between 1 and 10');
    }
    
    this.pdfQueue.concurrency = concurrency;
  }

  // Get concurrency
  async getConcurrency(): Promise<number> {
    return this.pdfQueue.concurrency;
  }

  // Cleanup methods
  async clearCompletedTasks(): Promise<number> {
    const completedTasks = Array.from(this.tasks.entries())
      .filter(([_, task]) => task.status === 'completed' || task.status === 'failed');
    
    for (const [taskId, _] of completedTasks) {
      this.tasks.delete(taskId);
      const orderIndex = this.taskOrder.indexOf(taskId);
      if (orderIndex > -1) {
        this.taskOrder.splice(orderIndex, 1);
      }
    }
    
    // Update display order for remaining tasks
    this.taskOrder.forEach((taskId, index) => {
      const task = this.tasks.get(taskId);
      if (task) {
        this.tasks.set(taskId, { ...task, displayOrder: index });
      }
    });
    
    return completedTasks.length;
  }

  // Clear all tasks and files
  async clearAllTasks(): Promise<number> {
    const taskCount = this.tasks.size;
    
    // Kill the queue to stop any running tasks
    this.pdfQueue.kill();
    
    // Clear all tasks
    this.tasks.clear();
    this.taskOrder = [];
    
    // Recreate the queue
    this.pdfQueue = async.queue<PDFTask>(async (task: PDFTask) => {
      const result = await this.processTask(task);
      return result;
    }, this.pdfQueue.concurrency);
    
    // Re-add event listeners
    this.pdfQueue.error((error, task) => {
      console.error('Queue error for task:', task?.id, error);
    });

    this.pdfQueue.drain(() => {
      console.log('All PDF processing tasks completed');
    });
    
    return taskCount;
  }

  async removeTask(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }
    
    // Remove from tasks map
    this.tasks.delete(taskId);
    
    // Remove from order array
    const orderIndex = this.taskOrder.indexOf(taskId);
    if (orderIndex > -1) {
      this.taskOrder.splice(orderIndex, 1);
    }
    
    // Update display order for remaining tasks
    this.taskOrder.forEach((id, index) => {
      const remainingTask = this.tasks.get(id);
      if (remainingTask) {
        this.tasks.set(id, { ...remainingTask, displayOrder: index });
      }
    });
    
    return true;
  }

  // Reorder tasks - only works with completed tasks
  async reorderTasks(taskIds: string[]): Promise<boolean> {
    try {
      // Validate that all provided task IDs exist
      const invalidIds = taskIds.filter(id => !this.tasks.has(id));
      if (invalidIds.length > 0) {
        console.error('Invalid task IDs:', invalidIds);
        return false;
      }
      
      // Check if all tasks are completed
      const nonCompletedTasks = taskIds
        .map(id => this.tasks.get(id))
        .filter((task): task is PDFTask => task !== undefined && task.status !== 'completed');
      
      if (nonCompletedTasks.length > 0) {
        console.error('Cannot reorder tasks that are not completed. Non-completed tasks:', 
          nonCompletedTasks.map(t => `${t.filename} (${t.status})`));
        return false;
      }
      
      // Update the task order for completed tasks only
      this.taskOrder = taskIds;
      
      // Update display order for all completed tasks
      taskIds.forEach((taskId, index) => {
        const task = this.tasks.get(taskId);
        if (task && task.status === 'completed') {
          this.tasks.set(taskId, { ...task, displayOrder: index });
        }
      });
      
      console.log(`Successfully reordered ${taskIds.length} completed tasks`);
      return true;
      
    } catch (error) {
      console.error('Error reordering tasks:', error);
      return false;
    }
  }

  // Health check
  isHealthy(): boolean {
    return this.pdfQueue.idle() || this.pdfQueue.running() > 0;
  }

  // Get queue status
  getQueueStatus(): {
    isRunning: boolean;
    isPaused: boolean;
    isIdle: boolean;
    length: number;
    working: number;
  } {
    return {
      isRunning: this.pdfQueue.running() > 0,
      isPaused: this.pdfQueue.paused,
      isIdle: this.pdfQueue.idle(),
      length: this.pdfQueue.length(),
      working: this.pdfQueue.workersList().length
    };
  }
} 