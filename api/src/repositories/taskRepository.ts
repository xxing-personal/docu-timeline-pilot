import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import path from 'path';
import { PDFTask, DatabaseSchema, TaskStats } from '../types';

export class TaskRepository {
  private db: Low<DatabaseSchema>;
  private adapter: JSONFile<DatabaseSchema>;
  private dbPath: string;
  private isInitialized = false;

  constructor(dbFilePath: string = 'documents.json') {
    this.dbPath = path.resolve(__dirname, '../..', dbFilePath);
    this.adapter = new JSONFile<DatabaseSchema>(this.dbPath);
    this.db = new Low<DatabaseSchema>(this.adapter, this.getDefaultData());
  }

  private getDefaultData(): DatabaseSchema {
    return {
      documents: [],
      settings: {
        concurrency: 1,
        lastCleanup: new Date().toISOString()
      }
    };
  }

  async init(): Promise<void> {
    if (this.isInitialized) return;
    
    await this.db.read();
    this.db.data ||= this.getDefaultData();
    await this.db.write();
    
    this.isInitialized = true;
    console.log(`Task repository initialized at: ${this.dbPath}`);
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.init();
    }
  }

  // Task CRUD operations
  async create(task: PDFTask): Promise<void> {
    await this.ensureInitialized();
    await this.db.read();
    this.db.data.documents.push(task);
    await this.db.write();
  }

  async findById(taskId: string): Promise<PDFTask | undefined> {
    await this.ensureInitialized();
    await this.db.read();
    return this.db.data.documents.find(doc => doc.id === taskId);
  }

  async findAll(): Promise<PDFTask[]> {
    await this.ensureInitialized();
    await this.db.read();
    return [...this.db.data.documents];
  }

  async findByStatus(status: PDFTask['status']): Promise<PDFTask[]> {
    await this.ensureInitialized();
    await this.db.read();
    return this.db.data.documents.filter(doc => doc.status === status);
  }

  async update(taskId: string, updates: Partial<PDFTask>): Promise<boolean> {
    await this.ensureInitialized();
    await this.db.read();
    
    const taskIndex = this.db.data.documents.findIndex(doc => doc.id === taskId);
    if (taskIndex === -1) return false;
    
    this.db.data.documents[taskIndex] = {
      ...this.db.data.documents[taskIndex],
      ...updates
    };
    
    await this.db.write();
    return true;
  }

  async delete(taskId: string): Promise<boolean> {
    await this.ensureInitialized();
    await this.db.read();
    
    const initialLength = this.db.data.documents.length;
    this.db.data.documents = this.db.data.documents.filter(doc => doc.id !== taskId);
    
    if (this.db.data.documents.length < initialLength) {
      await this.db.write();
      return true;
    }
    return false;
  }

  async deleteByStatus(statuses: PDFTask['status'][]): Promise<number> {
    await this.ensureInitialized();
    await this.db.read();
    
    const initialLength = this.db.data.documents.length;
    this.db.data.documents = this.db.data.documents.filter(
      doc => !statuses.includes(doc.status)
    );
    
    const deletedCount = initialLength - this.db.data.documents.length;
    if (deletedCount > 0) {
      await this.db.write();
    }
    return deletedCount;
  }

  // Statistics
  async getStats(): Promise<TaskStats> {
    await this.ensureInitialized();
    await this.db.read();
    
    const tasks = this.db.data.documents;
    return {
      total: tasks.length,
      pending: tasks.filter(t => t.status === 'pending').length,
      processing: tasks.filter(t => t.status === 'processing').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      failed: tasks.filter(t => t.status === 'failed').length
    };
  }

  // Settings management
  async getConcurrency(): Promise<number> {
    await this.ensureInitialized();
    await this.db.read();
    return this.db.data.settings.concurrency;
  }

  async setConcurrency(concurrency: number): Promise<void> {
    await this.ensureInitialized();
    await this.db.read();
    this.db.data.settings.concurrency = concurrency;
    await this.db.write();
  }

  // Utility methods
  async backup(backupPath: string): Promise<void> {
    await this.ensureInitialized();
    await this.db.read();
    
    const backupAdapter = new JSONFile<DatabaseSchema>(backupPath);
    const backupDb = new Low<DatabaseSchema>(backupAdapter, this.db.data);
    await backupDb.write();
  }

  async reset(): Promise<void> {
    await this.ensureInitialized();
    this.db.data = this.getDefaultData();
    await this.db.write();
  }

  getDbPath(): string {
    return this.dbPath;
  }
} 