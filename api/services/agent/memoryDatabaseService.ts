import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import path from 'path';
import fs from 'fs/promises';

export type ShrinkMode = 'truncate' | 'compress';

export interface MemorySnapshot {
  id: string;
  version: number; // timestamp
  context: string;
  maxLength: number;
  shrinkMode: ShrinkMode;
  createdAt: string;
}

interface MemoryDatabaseSchema {
  snapshots: MemorySnapshot[];
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

export class MemoryDatabaseService {
  private db: Low<MemoryDatabaseSchema>;
  private dbPath: string;
  private mutex = new Mutex(); // Add mutex for database locking

  constructor() {
    this.dbPath = path.join(process.cwd(), 'data', 'memory-history.json');
    const adapter = new JSONFile<MemoryDatabaseSchema>(this.dbPath);
    this.db = new Low(adapter, { snapshots: [] });
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
        this.db.data = { snapshots: [] };
        await this.db.write();
      }
    } catch (error) {
      console.error('[MEMORY DB] Error initializing database:', error);
      throw error;
    }
  }

  async addSnapshot(snapshot: Omit<MemorySnapshot, 'version' | 'createdAt'>) {
    // Acquire mutex lock before database operations
    await this.mutex.acquire();
    
    try {
      await this.ensureInitialized();
      await this.db.read();
      const version = Date.now();
      const createdAt = new Date().toISOString();
      const fullSnapshot: MemorySnapshot = { ...snapshot, version, createdAt };
      this.db.data!.snapshots.push(fullSnapshot);
      await this.db.write();
      return fullSnapshot;
    } finally {
      // Always release the mutex lock
      this.mutex.release();
    }
  }

  async getSnapshots(id: string): Promise<MemorySnapshot[]> {
    await this.ensureInitialized();
    await this.db.read();
    return this.db.data!.snapshots.filter(s => s.id === id).sort((a, b) => a.version - b.version);
  }

  async getSnapshot(id: string, version: number): Promise<MemorySnapshot | undefined> {
    await this.ensureInitialized();
    await this.db.read();
    return this.db.data!.snapshots.find(s => s.id === id && s.version === version);
  }
} 