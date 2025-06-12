// Shared types for the PDF processing system

export interface PDFTask {
  id: string;
  filename: string;
  path: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  result?: PDFProcessingResult;
}

export interface PDFProcessingResult {
  filename: string;
  processedAt: string;
  extractedText: string;
  pageCount: number;
  fileSize: number;
  metadata?: Record<string, any>;
}

export interface TaskStats {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

export interface QueueStats {
  length: number;
  working: number;
  concurrency: number;
}

export interface DatabaseSchema {
  documents: PDFTask[];
  settings: {
    concurrency: number;
    lastCleanup: string;
  };
} 