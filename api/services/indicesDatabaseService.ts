import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import path from 'path';
import fs from 'fs/promises';

export interface IndexEntry {
  id: string;
  indexName: string;
  scoreValue: number;
  articleId: string;
  filename: string;
  source: 'pdf_processing' | 'indices_creation';
  evidence: string[];
  rational: string;
  createdAt: string;
  timestamp?: string; // Inferred timestamp from document
  taskId?: string; // ID of the task that created this index
}

interface IndicesDatabaseSchema {
  indices: IndexEntry[];
  settings: {
    lastBackup: string;
    version: string;
  };
  statistics: {
    totalIndices: number;
    pdfProcessingIndices: number;
    indicesCreationIndices: number;
    lastIndexDate: string;
  };
}

// Simple mutex implementation for database locking
class Mutex {
  private locked = false;
  private waitQueue: Array<() => void> = [];

  async acquire(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.locked) {
        this.locked = true;
        resolve();
      } else {
        this.waitQueue.push(resolve);
      }
    });
  }

  release(): void {
    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift()!;
      next();
    } else {
      this.locked = false;
    }
  }
}

export class IndicesDatabaseService {
  private db: Low<IndicesDatabaseSchema>;
  private dbPath: string;
  private mutex = new Mutex();

  constructor() {
    this.dbPath = path.join(process.cwd(), 'data', 'indices-database.json');
    const adapter = new JSONFile<IndicesDatabaseSchema>(this.dbPath);
    this.db = new Low(adapter, {
      indices: [],
      settings: {
        lastBackup: new Date().toISOString(),
        version: '1.0.0'
      },
      statistics: {
        totalIndices: 0,
        pdfProcessingIndices: 0,
        indicesCreationIndices: 0,
        lastIndexDate: new Date().toISOString()
      }
    });
    
    this.initializeDatabase();
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.db.data) {
      await this.initializeDatabase();
    }
  }

  private async initializeDatabase(): Promise<void> {
    try {
      const dataDir = path.dirname(this.dbPath);
      await fs.mkdir(dataDir, { recursive: true });

      await this.db.read();
      
      if (!this.db.data) {
        this.db.data = {
          indices: [],
          settings: {
            lastBackup: new Date().toISOString(),
            version: '1.0.0'
          },
          statistics: {
            totalIndices: 0,
            pdfProcessingIndices: 0,
            indicesCreationIndices: 0,
            lastIndexDate: new Date().toISOString()
          }
        };
        await this.db.write();
        console.log('[INDICES DATABASE] Initialized new database');
      } else {
        console.log('[INDICES DATABASE] Loaded existing database');
      }
    } catch (error) {
      console.error('[INDICES DATABASE] Error initializing database:', error);
      throw error;
    }
  }

  // Add index from PDF processing (analysisScores)
  async addPdfProcessingIndex(
    articleId: string,
    filename: string,
    analysisScores: Record<string, number>,
    inferredTimestamp?: string,
    taskId?: string
  ): Promise<void> {
    await this.mutex.acquire();
    
    try {
      await this.ensureInitialized();
      await this.db.read();
      
      console.log(`[INDICES DATABASE] Database data structure:`, {
        hasData: !!this.db.data,
        hasIndices: !!this.db.data?.indices,
        indicesLength: this.db.data?.indices?.length || 0,
        hasStatistics: !!this.db.data?.statistics
      });

      const entries: IndexEntry[] = Object.entries(analysisScores).map(([indexName, scoreValue]) => ({
        id: `index_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        indexName,
        scoreValue,
        articleId,
        filename,
        source: 'pdf_processing' as const,
        evidence: [], // PDF processing doesn't provide evidence
        rational: `Auto-generated index from PDF processing for ${indexName}`,
        createdAt: new Date().toISOString(),
        timestamp: inferredTimestamp,
        taskId
      }));

      // Ensure indices array exists
      if (!this.db.data!.indices) {
        this.db.data!.indices = [];
      }
      this.db.data!.indices.push(...entries);
      
      // Update statistics
      this.db.data!.statistics.totalIndices += entries.length;
      this.db.data!.statistics.pdfProcessingIndices += entries.length;
      this.db.data!.statistics.lastIndexDate = new Date().toISOString();
      
      await this.db.write();
      console.log(`[INDICES DATABASE] Added ${entries.length} PDF processing indices for ${filename}`);
    } finally {
      this.mutex.release();
    }
  }

  // Add index from indices creation agent
  async addIndicesCreationIndex(
    indexName: string,
    scoreValue: number,
    articleId: string,
    filename: string,
    evidence: string[],
    rational: string,
    taskId?: string
  ): Promise<void> {
    await this.mutex.acquire();
    
    try {
      await this.ensureInitialized();
      await this.db.read();

      const entry: IndexEntry = {
        id: `index_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        indexName,
        scoreValue,
        articleId,
        filename,
        source: 'indices_creation' as const,
        evidence,
        rational,
        createdAt: new Date().toISOString(),
        taskId
      };

      // Ensure indices array exists
      if (!this.db.data!.indices) {
        this.db.data!.indices = [];
      }
      this.db.data!.indices.push(entry);
      
      // Update statistics
      this.db.data!.statistics.totalIndices++;
      this.db.data!.statistics.indicesCreationIndices++;
      this.db.data!.statistics.lastIndexDate = new Date().toISOString();
      
      await this.db.write();
      console.log(`[INDICES DATABASE] Added indices creation index: ${indexName} for ${filename}`);
    } finally {
      this.mutex.release();
    }
  }

  // Get all indices
  async getAllIndices(): Promise<IndexEntry[]> {
    await this.ensureInitialized();
    await this.db.read();
    return this.db.data!.indices;
  }

  // Get indices by name
  async getIndicesByName(indexName: string): Promise<IndexEntry[]> {
    await this.ensureInitialized();
    await this.db.read();
    return this.db.data!.indices.filter(index => index.indexName === indexName);
  }

  // Get unique index names
  async getUniqueIndexNames(): Promise<string[]> {
    await this.ensureInitialized();
    await this.db.read();
    const names = this.db.data!.indices.map(index => index.indexName);
    return Array.from(new Set(names));
  }

  // Get indices by source
  async getIndicesBySource(source: 'pdf_processing' | 'indices_creation'): Promise<IndexEntry[]> {
    await this.ensureInitialized();
    await this.db.read();
    return this.db.data!.indices.filter(index => index.source === source);
  }

  // Get indices by article ID
  async getIndicesByArticleId(articleId: string): Promise<IndexEntry[]> {
    await this.ensureInitialized();
    await this.db.read();
    return this.db.data!.indices.filter(index => index.articleId === articleId);
  }

  // Get statistics
  async getStatistics(): Promise<IndicesDatabaseSchema['statistics']> {
    await this.ensureInitialized();
    await this.db.read();
    return this.db.data!.statistics;
  }

  // Get database info
  async getDatabaseInfo(): Promise<{
    totalIndices: number;
    uniqueIndexNames: number;
    pdfProcessingIndices: number;
    indicesCreationIndices: number;
    lastIndexDate: string;
    lastBackup: string;
    version: string;
  }> {
    await this.ensureInitialized();
    await this.db.read();
    const uniqueNames = new Set(this.db.data!.indices.map(index => index.indexName));
    
    return {
      totalIndices: this.db.data!.statistics.totalIndices,
      uniqueIndexNames: uniqueNames.size,
      pdfProcessingIndices: this.db.data!.statistics.pdfProcessingIndices,
      indicesCreationIndices: this.db.data!.statistics.indicesCreationIndices,
      lastIndexDate: this.db.data!.statistics.lastIndexDate,
      lastBackup: this.db.data!.settings.lastBackup,
      version: this.db.data!.settings.version
    };
  }

  // Delete indices by task ID
  async deleteIndicesByTaskId(taskId: string): Promise<number> {
    await this.mutex.acquire();
    
    try {
      await this.ensureInitialized();
      await this.db.read();
      
      const initialCount = this.db.data!.indices.length;
      this.db.data!.indices = this.db.data!.indices.filter(index => index.taskId !== taskId);
      const deletedCount = initialCount - this.db.data!.indices.length;
      
      if (deletedCount > 0) {
        // Update statistics
        this.db.data!.statistics.totalIndices -= deletedCount;
        // Note: We can't easily update pdfProcessingIndices vs indicesCreationIndices without tracking which were deleted
        await this.db.write();
        console.log(`[INDICES DATABASE] Deleted ${deletedCount} indices for task ID: ${taskId}`);
      }
      
      return deletedCount;
    } finally {
      this.mutex.release();
    }
  }

  // Delete indices by queue key (agent queue)
  async deleteIndicesByQueueKey(queueKey: string): Promise<number> {
    await this.mutex.acquire();
    
    try {
      await this.ensureInitialized();
      await this.db.read();
      
      const initialCount = this.db.data!.indices.length;
      // Filter out indices where taskId starts with the queue key pattern
      this.db.data!.indices = this.db.data!.indices.filter(index => {
        if (!index.taskId) return true;
        // Check if taskId matches the queue key pattern (e.g., "indices:query" or "deep_research:query")
        const queueKeyPattern = queueKey.replace(/:/g, '-');
        return !index.taskId.includes(queueKeyPattern);
      });
      
      const deletedCount = initialCount - this.db.data!.indices.length;
      
      if (deletedCount > 0) {
        // Update statistics
        this.db.data!.statistics.totalIndices -= deletedCount;
        await this.db.write();
        console.log(`[INDICES DATABASE] Deleted ${deletedCount} indices for queue key: ${queueKey}`);
      }
      
      return deletedCount;
    } finally {
      this.mutex.release();
    }
  }

  // Reset database
  async resetDatabase(): Promise<void> {
    await this.mutex.acquire();
    
    try {
      await this.ensureInitialized();
      this.db.data = {
        indices: [],
        settings: {
          lastBackup: new Date().toISOString(),
          version: '1.0.0'
        },
        statistics: {
          totalIndices: 0,
          pdfProcessingIndices: 0,
          indicesCreationIndices: 0,
          lastIndexDate: new Date().toISOString()
        }
      };
      await this.db.write();
      console.log('[INDICES DATABASE] Database reset');
    } finally {
      this.mutex.release();
    }
  }
} 