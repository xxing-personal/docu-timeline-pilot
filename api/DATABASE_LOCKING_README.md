# Database Locking Mechanism

## Overview

This document describes the mutex-based locking mechanism implemented to prevent race conditions during concurrent database operations in the Node.js application using LowDB.

## Problem

The original implementation had a critical issue where multiple concurrent uploads could cause database writes to overwrite each other:

```typescript
// ❌ Problematic code (race condition)
async addTask(task: PDFTask): Promise<void> {
  await this.db.read();  // Read current state
  this.db.data.tasks.push(task);  // Modify in memory
  await this.db.write();  // Write back to disk
}

async updateTask(taskId: string, updates: Partial<PDFTask>): Promise<boolean> {
  await this.db.read();  // Read current state (might be stale!)
  // ... modify task
  await this.db.write();  // Overwrites previous changes!
}
```

When multiple operations happen simultaneously:
1. Operation A reads the database
2. Operation B reads the database (same state as A)
3. Operation A modifies data and writes
4. Operation B modifies data and writes (overwrites A's changes!)

## Solution: Mutex-Based Locking

We implemented a simple mutex (mutual exclusion) mechanism to ensure database writes happen sequentially:

### Mutex Implementation

```typescript
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
```

### Usage in Database Operations

```typescript
// ✅ Fixed code with locking
async addTask(task: PDFTask): Promise<void> {
  await this.mutex.acquire();  // Acquire lock
  
  try {
    await this.db.read();
    this.db.data.tasks.push(task);
    await this.db.write();
  } finally {
    this.mutex.release();  // Always release lock
  }
}
```

## How It Works

1. **Lock Acquisition**: When a database write operation starts, it calls `mutex.acquire()`
2. **Sequential Processing**: If the lock is already held, the operation waits in a queue
3. **Exclusive Access**: Only one operation can read/write the database at a time
4. **Lock Release**: The lock is released in the `finally` block, allowing the next operation to proceed

## Benefits

- ✅ **Data Integrity**: No more lost or overwritten data
- ✅ **Race Condition Prevention**: Database writes happen sequentially
- ✅ **Simple Implementation**: Lightweight mutex without external dependencies
- ✅ **Automatic Cleanup**: Locks are always released via try/finally blocks

## Performance Considerations

- **Sequential Processing**: Database writes are now sequential, not parallel
- **Minimal Overhead**: The mutex adds negligible performance overhead
- **Fair Queue**: Operations are processed in FIFO order
- **Read Operations**: Read-only operations don't need locking (they don't modify data)

## Affected Services

The locking mechanism has been implemented in all database services:

1. **DatabaseService** (`api/services/databaseService.ts`)
   - `addTask()`, `updateTask()`, `removeTask()`, `clearCompletedTasks()`
   - `updateStatistics()`, `backup()`, `resetDatabase()`

2. **AgentQueueDatabaseService** (`api/services/agent/agentQueueDatabaseService.ts`)
   - `addTask()`, `updateTask()`, `setTaskOrder()`

3. **MemoryDatabaseService** (`api/services/agent/memoryDatabaseService.ts`)
   - `addSnapshot()`

4. **ChatDatabaseService** (`api/services/chatDatabaseService.ts`)
   - `addMessage()`, `deleteMessage()`, `createSession()`, `updateSession()`, `deleteSession()`
   - `backup()`, `resetDatabase()`, `cleanupOldMessages()`

## Testing

Run the test script to verify the locking mechanism works correctly:

```bash
cd api
node test-database-locking.js
```

The test will:
1. Perform concurrent `addTask()` operations
2. Perform concurrent `updateTask()` operations
3. Verify data integrity (no lost/duplicated tasks)
4. Compare performance between sequential and concurrent operations

## Alternative Solutions Considered

1. **File System Locks**: More complex, platform-dependent
2. **External Locking Service**: Adds dependencies and complexity
3. **Database Migration**: Switching to a proper database with built-in concurrency control
4. **Queue-Based Processing**: More complex but could provide better performance

The mutex approach was chosen for its simplicity, effectiveness, and lack of external dependencies.

## Future Improvements

If performance becomes a bottleneck, consider:

1. **Read/Write Locks**: Allow multiple reads but exclusive writes
2. **Database Migration**: Move to PostgreSQL, SQLite, or similar
3. **Connection Pooling**: For better concurrent read performance
4. **Caching Layer**: Reduce database access frequency

## Monitoring

Monitor for:
- Lock contention (operations waiting in queue)
- Database write performance
- Memory usage (ensure locks are properly released)

The current implementation includes logging to help track database operations and identify potential issues. 