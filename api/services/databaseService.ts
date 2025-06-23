import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import path from 'path';
import fs from 'fs/promises';
import { PDFTask } from '../types';

interface DatabaseSchema {
  tasks: PDFTask[];
  settings: {
    lastBackup: string;
    version: string;
  };
  statistics: {
    totalProcessed: number;
    totalFailed: number;
    lastProcessedDate: string;
  };
}

export class DatabaseService {
  private db: Low<DatabaseSchema>;
  private dbPath: string;

  constructor() {
    this.dbPath = path.join(process.cwd(), 'data', 'database.json');
    const adapter = new JSONFile<DatabaseSchema>(this.dbPath);
    this.db = new Low(adapter, {
      tasks: [],
      settings: {
        lastBackup: new Date().toISOString(),
        version: '1.0.0'
      },
      statistics: {
        totalProcessed: 0,
        totalFailed: 0,
        lastProcessedDate: new Date().toISOString()
      }
    });
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.db.data) {
      await this.initializeDatabase();
    }
  }

  private async initializeDatabase(): Promise<void> {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.dbPath);
      await fs.mkdir(dataDir, { recursive: true });

      // Set default data if database is empty
      await this.db.read();
      
      if (!this.db.data) {
        this.db.data = {
          tasks: [],
          settings: {
            lastBackup: new Date().toISOString(),
            version: '1.0.0'
          },
          statistics: {
            totalProcessed: 0,
            totalFailed: 0,
            lastProcessedDate: new Date().toISOString()
          }
        };
        await this.db.write();
        console.log('[DATABASE] Initialized new database');
      } else {
        console.log('[DATABASE] Loaded existing database');
      }
    } catch (error) {
      console.error('[DATABASE] Error initializing database:', error);
      throw error;
    }
  }

  // Task management methods
  async addTask(task: PDFTask): Promise<void> {
    await this.db.read();
    this.db.data!.tasks.push(task);
    await this.db.write();
  }

  async updateTask(taskId: string, updates: Partial<PDFTask>): Promise<boolean> {
    await this.db.read();
    const taskIndex = this.db.data!.tasks.findIndex(task => task.id === taskId);
    
    if (taskIndex === -1) {
      return false;
    }

    this.db.data!.tasks[taskIndex] = {
      ...this.db.data!.tasks[taskIndex],
      ...updates
    };

    await this.db.write();
    return true;
  }

  async getTask(taskId: string): Promise<PDFTask | undefined> {
    await this.db.read();
    return this.db.data!.tasks.find(task => task.id === taskId);
  }

  async getAllTasks(): Promise<PDFTask[]> {
    await this.db.read();
    return this.db.data!.tasks;
  }

  async removeTask(taskId: string): Promise<boolean> {
    await this.db.read();
    const initialLength = this.db.data!.tasks.length;
    this.db.data!.tasks = this.db.data!.tasks.filter(task => task.id !== taskId);
    
    if (this.db.data!.tasks.length < initialLength) {
      await this.db.write();
      return true;
    }
    return false;
  }

  async clearCompletedTasks(): Promise<number> {
    await this.db.read();
    const initialLength = this.db.data!.tasks.length;
    this.db.data!.tasks = this.db.data!.tasks.filter(task => task.status !== 'completed');
    const removedCount = initialLength - this.db.data!.tasks.length;
    
    if (removedCount > 0) {
      await this.db.write();
    }
    
    return removedCount;
  }

  // Statistics methods
  async updateStatistics(processed: boolean, failed: boolean = false): Promise<void> {
    await this.db.read();
    
    if (processed) {
      this.db.data!.statistics.totalProcessed++;
      this.db.data!.statistics.lastProcessedDate = new Date().toISOString();
    }
    
    if (failed) {
      this.db.data!.statistics.totalFailed++;
    }
    
    await this.db.write();
  }

  async getStatistics(): Promise<DatabaseSchema['statistics']> {
    await this.db.read();
    return this.db.data!.statistics;
  }

  // Database maintenance methods
  async backup(): Promise<string> {
    await this.db.read();
    const backupPath = path.join(process.cwd(), 'data', `backup-${Date.now()}.json`);
    await fs.writeFile(backupPath, JSON.stringify(this.db.data, null, 2));
    
    this.db.data!.settings.lastBackup = new Date().toISOString();
    await this.db.write();
    
    return backupPath;
  }

  async getDatabaseInfo(): Promise<{
    taskCount: number;
    completedCount: number;
    pendingCount: number;
    failedCount: number;
    lastBackup: string;
    version: string;
  }> {
    await this.db.read();
    const tasks = this.db.data!.tasks;
    
    return {
      taskCount: tasks.length,
      completedCount: tasks.filter(t => t.status === 'completed').length,
      pendingCount: tasks.filter(t => t.status === 'pending').length,
      failedCount: tasks.filter(t => t.status === 'failed').length,
      lastBackup: this.db.data!.settings.lastBackup,
      version: this.db.data!.settings.version
    };
  }

  // Utility methods
  async resetDatabase(): Promise<void> {
    this.db.data = {
      tasks: [],
      settings: {
        lastBackup: new Date().toISOString(),
        version: '1.0.0'
      },
      statistics: {
        totalProcessed: 0,
        totalFailed: 0,
        lastProcessedDate: new Date().toISOString()
      }
    };
    await this.db.write();
    console.log('[DATABASE] Database reset');
  }
} 