# PDF Queue Management System

This project implements a robust queue management system for PDF processing using the `async` library in Node.js/TypeScript.

## Features

- **Sequential Processing**: Ensures PDFs are processed one at a time (configurable concurrency)
- **Task Tracking**: Full lifecycle tracking of PDF processing tasks
- **Status Monitoring**: Real-time status updates for each task
- **Queue Management**: Pause, resume, and configure queue settings
- **Error Handling**: Comprehensive error handling and reporting
- **RESTful API**: Clean REST endpoints for all operations

## Installation

```bash
cd api
npm install async @types/async
```

## Basic Usage

### 1. Upload a PDF for Processing

```bash
POST /upload
Content-Type: multipart/form-data

# Response
{
  "message": "PDF uploaded successfully and queued for processing!",
  "taskId": "pdf_1234567890_abc123def",
  "filename": "document.pdf",
  "queueLength": 1,
  "status": "pending"
}
```

### 2. Check Task Status

```bash
GET /status/:taskId

# Response
{
  "id": "pdf_1234567890_abc123def",
  "filename": "document.pdf",
  "status": "completed",
  "createdAt": "2024-01-01T12:00:00.000Z",
  "startedAt": "2024-01-01T12:00:01.000Z",
  "completedAt": "2024-01-01T12:00:03.000Z",
  "result": {
    "filename": "document.pdf",
    "processedAt": "2024-01-01T12:00:03.000Z",
    "extractedText": "Sample extracted text...",
    "pageCount": 25,
    "fileSize": 1048576
  },
  "queueLength": 0,
  "queueWorking": 0
}
```

## API Endpoints

### Task Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/upload` | Upload PDF and add to queue |
| GET | `/status/:taskId` | Get specific task status |
| GET | `/status` | Get all tasks status |

### Queue Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/queue/stats` | Get comprehensive queue statistics |
| POST | `/queue/pause` | Pause the processing queue |
| POST | `/queue/resume` | Resume the processing queue |
| POST | `/queue/concurrency` | Set queue concurrency level |
| DELETE | `/tasks/completed` | Clear completed/failed tasks |

### Queue Statistics Response

```json
{
  "queue": {
    "length": 2,
    "working": 1,
    "concurrency": 1
  },
  "tasks": {
    "total": 10,
    "pending": 2,
    "processing": 1,
    "completed": 6,
    "failed": 1
  }
}
```

## Task Status States

- **`pending`**: Task is queued but not yet started
- **`processing`**: Task is currently being processed
- **`completed`**: Task completed successfully
- **`failed`**: Task failed with error

## Configuration

### Changing Concurrency

```bash
POST /queue/concurrency
Content-Type: application/json

{
  "concurrency": 3
}
```

**Note**: Concurrency must be between 1 and 10. Setting it to 1 ensures sequential processing.

## Code Integration

### Using the PDFQueueService Class

```typescript
import { PDFQueueService } from './pdfQueueService';

// Initialize with concurrency of 1 for sequential processing
const pdfQueueService = new PDFQueueService(1);

// Add a task
const taskId = pdfQueueService.addTask('document.pdf', '/path/to/document.pdf');

// Check status
const task = pdfQueueService.getTask(taskId);

// Get statistics
const stats = pdfQueueService.getQueueStats();

// Pause/Resume
pdfQueueService.pauseQueue();
pdfQueueService.resumeQueue();
```

### Simple async.queue Usage

```javascript
const async = require('async');

const pdfQueue = async.queue(async (pdf, callback) => {
    await processPdf(pdf);
    callback();
}, 1); // concurrency = 1 ensures sequential processing

// Add to queue
pdfQueue.push(pdfData);

// Monitor events
pdfQueue.drain(() => {
    console.log('All tasks completed');
});
```

## Error Handling

The system provides comprehensive error handling:

- **Upload Errors**: Invalid file types, missing files
- **Processing Errors**: PDF parsing failures, file access issues
- **Queue Errors**: System-level queue failures
- **API Errors**: Malformed requests, missing resources

## Production Considerations

### 1. Persistence
- Current implementation uses in-memory storage
- For production, consider using Redis, MongoDB, or PostgreSQL
- Implement task persistence to survive server restarts

### 2. Scalability
- Consider using Redis Bull for distributed queues
- Implement horizontal scaling with multiple workers
- Add load balancing for high-volume scenarios

### 3. Monitoring
- Add logging with structured formats (Winston, Pino)
- Implement metrics collection (Prometheus)
- Set up health checks and alerting

### 4. Security
- Add authentication/authorization
- Implement rate limiting
- Validate file sizes and types more strictly

## Example Integration

See `examples/queueUsage.js` for complete usage examples including:
- File upload with monitoring
- Task status polling
- Queue management operations
- Error handling patterns

## Advanced PDF Processing

Replace the mock processing function with real PDF processing:

```typescript
// Example with pdf-parse library
import pdfParse from 'pdf-parse';

private async processPdf(task: PDFTask): Promise<void> {
  try {
    const pdfBuffer = fs.readFileSync(task.path);
    const pdfData = await pdfParse(pdfBuffer);
    
    const result = {
      filename: task.filename,
      processedAt: new Date().toISOString(),
      extractedText: pdfData.text,
      pageCount: pdfData.numpages,
      fileSize: fs.statSync(task.path).size,
      metadata: pdfData.metadata
    };
    
    task.result = result;
    task.status = 'completed';
  } catch (error) {
    task.status = 'failed';
    task.error = error.message;
  }
}
```

## Testing

```bash
# Start the server
npm run dev

# Test upload (requires a PDF file)
curl -X POST -F "pdf=@sample.pdf" http://localhost:3000/upload

# Check queue stats
curl http://localhost:3000/queue/stats
``` 