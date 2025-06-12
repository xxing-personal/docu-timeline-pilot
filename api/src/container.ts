// Simple dependency injection container
import { TaskRepository } from './repositories/taskRepository';
import { PDFProcessor } from './services/pdfProcessor';
import { PDFQueueService } from './services/pdfQueueService';

export class Container {
  private static instance: Container;
  private taskRepository: TaskRepository;
  private pdfProcessor: PDFProcessor;
  private pdfQueueService: PDFQueueService;

  private constructor() {
    // Initialize dependencies
    this.taskRepository = new TaskRepository();
    this.pdfProcessor = new PDFProcessor();
    this.pdfQueueService = new PDFQueueService(
      this.taskRepository,
      this.pdfProcessor,
      1 // default concurrency
    );
  }

  static getInstance(): Container {
    if (!Container.instance) {
      Container.instance = new Container();
    }
    return Container.instance;
  }

  getTaskRepository(): TaskRepository {
    return this.taskRepository;
  }

  getPDFProcessor(): PDFProcessor {
    return this.pdfProcessor;
  }

  getPDFQueueService(): PDFQueueService {
    return this.pdfQueueService;
  }

  // Initialize all services
  async init(): Promise<void> {
    await this.pdfQueueService.init();
  }

  // For testing - create a new container with custom dependencies
  static createTestContainer(
    taskRepository?: TaskRepository,
    pdfProcessor?: PDFProcessor,
    concurrency: number = 1
  ): Container {
    const container = new Container();
    
    if (taskRepository) {
      container.taskRepository = taskRepository;
    }
    if (pdfProcessor) {
      container.pdfProcessor = pdfProcessor;
    }
    
    container.pdfQueueService = new PDFQueueService(
      container.taskRepository,
      container.pdfProcessor,
      concurrency
    );
    
    return container;
  }
} 