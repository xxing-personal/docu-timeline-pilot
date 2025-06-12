# LowDB Integration for PDF Queue Management

This document explains how lowdb is integrated into the PDF processing queue system for persistent state management.

## Overview

The system uses lowdb to store PDF processing tasks in a JSON file, providing:
- **Persistent Storage**: Tasks survive server restarts
- **Simple JSON Format**: Easy to read and debug
- **Zero Configuration**: No database setup required
- **Automatic Recovery**: Restores pending tasks on startup

## Basic lowdb Usage

### Simple Example (matching your request)

```javascript
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');

const adapter = new JSONFile('documents.json');
const db = new Low(adapter, { documents: [] });

await db.read();
db.data ||= { documents: [] };
db.data.documents.push({ id, filename, status: 'pending' });
await db.write();
```

### Complete Integration Example

```javascript
// Initialize database
const adapter = new JSONFile('documents.json');
const db = new Low(adapter, { 
  documents: [],
  settings: { concurrency: 1 }
});

await db.read();
db.data ||= { 
  documents: [],
  settings: { concurrency: 1 }
};

// Add a PDF task
const task = {
  id: `pdf_${Date.now()}`,
  filename: 'document.pdf',
  status: 'pending',
  createdAt: new Date().toISOString()
};

db.data.documents.push(task);
await db.write();

// Update task status
const document = db.data.documents.find(doc => doc.id === taskId);
if (document) {
  document.status = 'processing';
  document.startedAt = new Date().toISOString();
  await db.write();
}

// Complete processing
document.status = 'completed';
document.completedAt = new Date().toISOString();
document.result = {
  extractedText: 'Sample extracted text',
  pageCount: 10
};
await db.write();
```

## Database Schema

The JSON database structure:

```json
{
  "documents": [
    {
      "id": "pdf_1234567890_abc123",
      "filename": "document.pdf",
      "path": "/uploads/document.pdf",
      "status": "completed",
      "createdAt": "2024-01-01T12:00:00.000Z",
      "startedAt": "2024-01-01T12:00:01.000Z",
      "completedAt": "2024-01-01T12:00:05.000Z",
      "result": {
        "extractedText": "Sample text...",
        "pageCount": 25,
        "fileSize": 1048576
      }
    }
  ],
  "settings": {
    "concurrency": 1,
    "lastCleanup": "2024-01-01T12:00:00.000Z"
  }
}
```

## Implementation Details

### Database Service (`database.ts`)

```typescript
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';

class DatabaseService {
  private db: Low<DatabaseSchema>;
  private adapter: JSONFile<DatabaseSchema>;

  constructor(dbFilePath: string = 'documents.json') {
    this.adapter = new JSONFile<DatabaseSchema>(dbFilePath);
    this.db = new Low<DatabaseSchema>(this.adapter, defaultData);
  }

  async addTask(task: PDFTask): Promise<void> {
    await this.db.read();
    this.db.data.documents.push(task);
    await this.db.write();
  }

  async updateTask(taskId: string, updates: Partial<PDFTask>): Promise<boolean> {
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
}
```

### Queue Service Integration

The PDFQueueService now uses the database for persistence:

```typescript
export class PDFQueueService {
  async init(): Promise<void> {
    await database.init();
    
    // Restore pending tasks from database
    const pendingTasks = await database.getTasksByStatus('pending');
    for (const task of pendingTasks) {
      this.pdfQueue.push(task);
    }
    
    // Reset processing tasks to pending (server restart recovery)
    const processingTasks = await database.getTasksByStatus('processing');
    for (const task of processingTasks) {
      await database.updateTask(task.id, { status: 'pending' });
      this.pdfQueue.push({ ...task, status: 'pending' });
    }
  }

  async addTask(filename: string, path: string): Promise<string> {
    const task = {
      id: `pdf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      filename,
      path,
      status: 'pending' as const,
      createdAt: new Date()
    };
    
    await database.addTask(task);
    this.pdfQueue.push(task);
    return task.id;
  }
}
```

## Key Features

### 1. Automatic Recovery
- Restores pending tasks on server restart
- Resets "processing" tasks to "pending" (handles unexpected shutdowns)
- Maintains queue state across restarts

### 2. Persistent State
- All task states saved to JSON file
- Task results preserved
- Settings persistence (concurrency, etc.)

### 3. Simple Operations
```javascript
// Read data
await db.read();

// Modify data
db.data.documents.push(newTask);

// Save changes
await db.write();
```

### 4. Built-in Methods
- `addTask()` - Add new PDF task
- `updateTask()` - Update task status/data
- `getTask()` - Get specific task
- `getAllTasks()` - Get all tasks
- `getTasksByStatus()` - Filter by status
- `clearCompletedTasks()` - Cleanup completed tasks

## File Locations

- **Database File**: `api/documents.json` (auto-created)
- **Database Service**: `api/src/database.ts`
- **Queue Service**: `api/src/pdfQueueService.ts`
- **Examples**: `api/examples/lowdbExample.js`

## Testing the Integration

### 1. Run the example
```bash
cd api
node examples/lowdbExample.js
```

### 2. Start the server
```bash
npm run dev
```

### 3. Upload a PDF
```bash
curl -X POST -F "pdf=@sample.pdf" http://localhost:3000/upload
```

### 4. Check the database file
```bash
cat documents.json | jq
```

## Benefits

- ✅ **No Database Setup**: Just a JSON file
- ✅ **Human Readable**: Easy to inspect and debug
- ✅ **Persistent Storage**: Survives server restarts
- ✅ **Automatic Recovery**: Restores queue state
- ✅ **Simple Backup**: Just copy the JSON file
- ✅ **Zero Dependencies**: No external database required

## Production Considerations

For high-volume production use, consider:
- **Redis**: For distributed systems
- **PostgreSQL**: For complex queries
- **MongoDB**: For document-based storage
- **File Rotation**: Archive old completed tasks

But for local development and simple deployments, lowdb provides an excellent balance of simplicity and functionality. 