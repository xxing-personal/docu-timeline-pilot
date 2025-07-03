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
  displayOrder?: number;
  TimeStamp?: string; // Used for sorting in timeline
}

export interface PDFProcessingResult {
  filename: string;
  processedAt: string;
  extractedTextPath: string; // Path to the markdown file containing extracted text
  summary: string;
  pageCount: number;
  fileSize: number;
  metadata?: Record<string, any>;
} 