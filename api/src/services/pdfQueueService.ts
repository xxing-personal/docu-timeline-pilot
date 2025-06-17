import async from 'async';
import { PDFTask, QueueStats, TaskStats } from '../types';
import { TaskRepository } from '../repositories/taskRepository';
import { PDFProcessor } from './pdfProcessor';

export class PDFQueueService {
  private pdfQueue: async.QueueObject<PDFTask>;
  private taskRepository: TaskRepository;
  private pdfProcessor: PDFProcessor;

  constructor(
    taskRepository: TaskRepository,
    pdfProcessor: PDFProcessor,
    concurrency: number = 1
  ) {
    this.taskRepository = taskRepository;
    this.pdfProcessor = pdfProcessor;
    
    // Create PDF processing queue with specified concurrency
    this.pdfQueue = async.queue<PDFTask>(async (task: PDFTask) => {
      await this.processTask(task);
    }, concurrency);

    // Queue event listeners for monitoring
    this.pdfQueue.error((error, task) => {
      console.error('Queue error for task:', task?.id, error);
    });

    this.pdfQueue.drain(() => {
      console.log('All PDF processing tasks completed');
    });
  }

  // Initialize service and restore pending tasks from database
  async init(): Promise<void> {
    await this.taskRepository.init();
    
    // Restore pending tasks to queue after server restart
    const pendingTasks = await this.taskRepository.findByStatus('pending');
    for (const task of pendingTasks) {
      this.pdfQueue.push(task);
    }
    
    // Reset any tasks that were processing when server stopped
    const processingTasks = await this.taskRepository.findByStatus('processing');
    for (const task of processingTasks) {
      await this.taskRepository.update(task.id, { status: 'pending' });
      this.pdfQueue.push({ ...task, status: 'pending' });
    }
    
    console.log(`Restored ${pendingTasks.length + processingTasks.length} tasks to queue`);
  }

  // Process a single task
  private async processTask(task: PDFTask): Promise<void> {
    console.log(`Starting to process PDF: ${task.filename}`);
    
    try {
      // Update status to processing
      await this.taskRepository.update(task.id, {
        status: 'processing',
        startedAt: new Date()
      });
      
      // Process the PDF using the processor service
      const result = await this.pdfProcessor.process(task);
      
      // Update task with completion
      await this.taskRepository.update(task.id, {
        status: 'completed',
        completedAt: new Date(),
        result: result
      });
      
      console.log(`Successfully processed PDF: ${task.filename}`);
      
    } catch (error) {
      console.error(`Failed to process PDF: ${task.filename}`, error);
      
      // Update task with failure
      await this.taskRepository.update(task.id, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date()
      });
    }
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
      createdAt: new Date()
    };
    
    // Store task in repository
    await this.taskRepository.create(pdfTask);
    
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
    return await this.taskRepository.findById(taskId);
  }

  // Get all tasks (sorted by display order when available)
  async getAllTasks(): Promise<PDFTask[]> {
    const tasks = await this.taskRepository.findAll();
    
    // Sort by displayOrder if available, otherwise by createdAt
    return tasks.sort((a, b) => {
      if (a.displayOrder !== undefined && b.displayOrder !== undefined) {
        return a.displayOrder - b.displayOrder;
      }
      if (a.displayOrder !== undefined && b.displayOrder === undefined) {
        return -1;
      }
      if (a.displayOrder === undefined && b.displayOrder !== undefined) {
        return 1;
      }
      // Both undefined, sort by creation date
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }

  // Get tasks by status
  async getTasksByStatus(status: PDFTask['status']): Promise<PDFTask[]> {
    return await this.taskRepository.findByStatus(status);
  }

  // Get comprehensive queue statistics
  async getQueueStats(): Promise<{ queue: QueueStats; tasks: TaskStats }> {
    const taskStats = await this.taskRepository.getStats();
    
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

  // Set concurrency (both queue and repository)
  async setConcurrency(concurrency: number): Promise<void> {
    if (concurrency < 1 || concurrency > 10) {
      throw new Error('Concurrency must be between 1 and 10');
    }
    
    this.pdfQueue.concurrency = concurrency;
    await this.taskRepository.setConcurrency(concurrency);
  }

  // Get concurrency from repository
  async getConcurrency(): Promise<number> {
    return await this.taskRepository.getConcurrency();
  }

  // Cleanup methods
  async clearCompletedTasks(): Promise<number> {
    return await this.taskRepository.deleteByStatus(['completed', 'failed']);
  }

  async removeTask(taskId: string): Promise<boolean> {
    // Remove from queue if it's still pending
    const task = await this.taskRepository.findById(taskId);
    if (task?.status === 'pending') {
      // Remove from in-memory queue (this is tricky with async.queue)
      // For now, we'll just mark it as failed so it won't be processed
      await this.taskRepository.update(taskId, { 
        status: 'failed', 
        error: 'Task cancelled by user' 
      });
    }
    
    return await this.taskRepository.delete(taskId);
  }

  // Reorder tasks in the queue (affects pending tasks) and display order (for all reorderable tasks)
  async reorderTasks(taskIds: string[]): Promise<boolean> {
    try {
      // Get all current tasks
      const allTasks = await this.taskRepository.findAll();
      
      // Validate that all provided task IDs exist
      const validTaskIds = allTasks.map(task => task.id);
      const invalidIds = taskIds.filter(id => !validTaskIds.includes(id));
      
      if (invalidIds.length > 0) {
        console.error('Invalid task IDs:', invalidIds);
        return false;
      }
      
      // Update display order for all reorderable tasks (pending, processing, completed)
      const updatedTasks = [];
      for (let i = 0; i < taskIds.length; i++) {
        const taskId = taskIds[i];
        const task = allTasks.find(t => t.id === taskId);
        if (task && task.status !== 'failed') { // Don't reorder failed tasks
          // Update the display order in the database
          await this.taskRepository.update(taskId, { displayOrder: i });
          updatedTasks.push({ ...task, displayOrder: i });
        }
      }
      
      // Handle pending tasks - reorder them in the actual processing queue
      const pendingTasks = allTasks.filter(task => task.status === 'pending');
      const pendingTaskIds = pendingTasks.map(task => task.id);
      
      // Filter taskIds to only include pending tasks for queue reordering
      const reorderedPendingIds = taskIds.filter(id => pendingTaskIds.includes(id));
      
      if (reorderedPendingIds.length > 0) {
        // Clear the current queue of pending tasks
        this.pdfQueue.kill();
        
        // Recreate the queue with the same concurrency
        const currentConcurrency = this.pdfQueue.concurrency;
        this.pdfQueue = async.queue<PDFTask>(async (task: PDFTask) => {
          await this.processTask(task);
        }, currentConcurrency);
        
        // Re-add event listeners
        this.pdfQueue.error((error, task) => {
          console.error('Queue error for task:', task?.id, error);
        });

        this.pdfQueue.drain(() => {
          console.log('All PDF processing tasks completed');
        });
        
        // Add pending tasks back to queue in the new order
        for (const taskId of reorderedPendingIds) {
          const task = allTasks.find(t => t.id === taskId);
          if (task) {
            this.pdfQueue.push(task);
          }
        }
        
        console.log(`Reordered ${reorderedPendingIds.length} pending tasks in processing queue`);
      }
      
      // Note: Processing tasks are not reordered in the queue since they're actively being processed
      // But their display order is updated for UI purposes
      const processingTasks = allTasks.filter(task => task.status === 'processing');
      const reorderedProcessingIds = taskIds.filter(id => processingTasks.some(t => t.id === id));
      
      if (reorderedProcessingIds.length > 0) {
        console.log(`Updated display order for ${reorderedProcessingIds.length} processing tasks (not interrupting active processing)`);
      }
      
      console.log(`Updated display order for ${updatedTasks.length} total tasks`);
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