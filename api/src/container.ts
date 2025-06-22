// Simple dependency injection container
import { PDFProcessor } from './services/pdfProcessor';
import { PDFQueueService } from './services/pdfQueueService';

export class Container {
  private static instance: Container;
  private pdfProcessor: PDFProcessor;
  private pdfQueueService: PDFQueueService;

  private constructor() {
    // Initialize dependencies
    this.pdfProcessor = new PDFProcessor();
    this.pdfQueueService = new PDFQueueService(
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
    pdfProcessor?: PDFProcessor,
    concurrency: number = 1
  ): Container {
    const container = new Container();
    
    if (pdfProcessor) {
      container.pdfProcessor = pdfProcessor;
    }
    
    container.pdfQueueService = new PDFQueueService(
      container.pdfProcessor,
      concurrency
    );
    
    return container;
  }
} 