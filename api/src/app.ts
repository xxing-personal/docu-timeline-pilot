import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import { Container } from './container';

const app = express();
const port = process.env.PORT || 3000;
app.use(cors({ origin: '*' }));
app.use(express.json());

// Initialize container and get services
const container = Container.getInstance();
const pdfQueueService = container.getPDFQueueService();

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer setup for PDF uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed!'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  }
});

// Enhanced upload endpoint with queue integration
app.post('/upload', upload.array('pdf', 10), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    res.status(400).json({ error: 'No files uploaded or files are not PDFs.' });
    return;
  }

  try {
    const files = req.files as Express.Multer.File[];
    const results = [];
    
    // Add each file to queue
    for (const file of files) {
      const taskId = await pdfQueueService.addTask(file.filename, file.path);
      results.push({
        taskId,
        filename: file.filename,
        status: 'pending'
      });
    }
    
    const queueStats = await pdfQueueService.getQueueStats();
    
    res.json({
      message: `${files.length} PDF(s) uploaded successfully and queued for processing!`,
      files: results,
      queueLength: queueStats.queue.length
    });
  } catch (error) {
    console.error('Upload error:', error);
    
    // Clean up uploaded files if task creation failed
    if (req.files) {
      const files = req.files as Express.Multer.File[];
      files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }
    
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to process upload' 
    });
  }
});

// Get processing status for a specific task
app.get('/status/:taskId', async (req, res) => {
  try {
    const taskId = req.params.taskId;
    const task = await pdfQueueService.getTask(taskId);
    
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    
    const queueStats = await pdfQueueService.getQueueStats();
    
    res.json({
      id: task.id,
      filename: task.filename,
      status: task.status,
      createdAt: task.createdAt,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      error: task.error,
      result: task.result,
      queueLength: queueStats.queue.length,
      queueWorking: queueStats.queue.working
    });
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ error: 'Failed to get task status' });
  }
});

// Get all tasks status
app.get('/status', async (req, res) => {
  try {
    const allTasks = (await pdfQueueService.getAllTasks()).map(task => ({
      id: task.id,
      filename: task.filename,
      status: task.status,
      createdAt: task.createdAt,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      error: task.error,
      // Don't include full result in list view for performance
      hasResult: !!task.result
    }));
    
    const queueStats = await pdfQueueService.getQueueStats();
    
    res.json({
      tasks: allTasks,
      queueStats: queueStats.queue,
      taskStats: queueStats.tasks
    });
  } catch (error) {
    console.error('Get all tasks error:', error);
    res.status(500).json({ error: 'Failed to get tasks' });
  }
});

// Get all uploaded files in uploads folder
app.get('/files', async (req, res) => {
  try {
    const files = fs.readdirSync(uploadDir).filter(file => file.endsWith('.pdf'));
    const fileDetails = files.map(filename => {
      const filePath = path.join(uploadDir, filename);
      const stats = fs.statSync(filePath);
      
      return {
        filename,
        size: stats.size,
        uploadedAt: stats.birthtime.toISOString(),
        modifiedAt: stats.mtime.toISOString()
      };
    });
    
    // Sort by upload date (newest first)
    fileDetails.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
    
    res.json({
      files: fileDetails,
      total: fileDetails.length
    });
  } catch (error) {
    console.error('List files error:', error);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// Serve individual PDF files
app.get('/files/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(uploadDir, filename);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'File not found' });
      return;
    }
    
    // Check if file is a PDF
    if (!filename.toLowerCase().endsWith('.pdf')) {
      res.status(400).json({ error: 'Only PDF files are supported' });
      return;
    }
    
    // Set appropriate headers for PDF with CORS
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    
    // Stream the PDF file
    const fileStream = fs.createReadStream(filePath);
    fileStream.on('error', (error) => {
      console.error('File stream error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to read file' });
      }
    });
    fileStream.pipe(res);
    
  } catch (error) {
    console.error('Serve file error:', error);
    res.status(500).json({ error: 'Failed to serve file' });
  }
});

// Delete a specific file from uploads folder
app.delete('/files/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(uploadDir, filename);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'File not found' });
      return;
    }
    
    // Delete the file
    fs.unlinkSync(filePath);
    
    res.json({ 
      message: 'File deleted successfully',
      filename: filename
    });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// Get queue statistics
app.get('/queue/stats', async (req, res) => {
  try {
    const stats = await pdfQueueService.getQueueStats();
    const queueStatus = pdfQueueService.getQueueStatus();
    
    res.json({
      ...stats,
      status: queueStatus
    });
  } catch (error) {
    console.error('Queue stats error:', error);
    res.status(500).json({ error: 'Failed to get queue stats' });
  }
});

// Queue management endpoints
app.post('/queue/pause', (req, res) => {
  try {
    pdfQueueService.pauseQueue();
    res.json({ message: 'Queue paused successfully' });
  } catch (error) {
    console.error('Pause queue error:', error);
    res.status(500).json({ error: 'Failed to pause queue' });
  }
});

app.post('/queue/resume', (req, res) => {
  try {
    pdfQueueService.resumeQueue();
    res.json({ message: 'Queue resumed successfully' });
  } catch (error) {
    console.error('Resume queue error:', error);
    res.status(500).json({ error: 'Failed to resume queue' });
  }
});

app.post('/queue/concurrency', async (req, res) => {
  try {
    const { concurrency } = req.body as { concurrency: number };
    
    if (!concurrency || concurrency < 1 || concurrency > 10) {
      res.status(400).json({ error: 'Concurrency must be between 1 and 10' });
      return;
    }
    
    await pdfQueueService.setConcurrency(concurrency);
    res.json({ 
      message: `Queue concurrency set to ${concurrency}`,
      concurrency: concurrency
    });
  } catch (error) {
    console.error('Set concurrency error:', error);
    res.status(500).json({ error: 'Failed to set concurrency' });
  }
});

// Task management endpoints
app.delete('/tasks/completed', async (req, res) => {
  try {
    const clearedCount = await pdfQueueService.clearCompletedTasks();
    res.json({ 
      message: `Cleared ${clearedCount} completed tasks`,
      clearedCount: clearedCount
    });
  } catch (error) {
    console.error('Clear completed tasks error:', error);
    res.status(500).json({ error: 'Failed to clear completed tasks' });
  }
});

// Clear all tasks regardless of status
app.delete('/tasks/all', async (req, res) => {
  try {
    const allTasks = await pdfQueueService.getAllTasks();
    let clearedCount = 0;
    
    // Remove each task individually
    for (const task of allTasks) {
      const removed = await pdfQueueService.removeTask(task.id);
      if (removed) {
        clearedCount++;
      }
    }
    
    res.json({ 
      message: `Cleared ${clearedCount} tasks (all statuses)`,
      clearedCount: clearedCount
    });
  } catch (error) {
    console.error('Clear all tasks error:', error);
    res.status(500).json({ error: 'Failed to clear all tasks' });
  }
});

app.delete('/tasks/:taskId', async (req, res) => {
  try {
    const taskId = req.params.taskId;
    const removed = await pdfQueueService.removeTask(taskId);
    
    if (removed) {
      res.json({ message: 'Task removed successfully' });
    } else {
      res.status(404).json({ error: 'Task not found' });
    }
  } catch (error) {
    console.error('Remove task error:', error);
    res.status(500).json({ error: 'Failed to remove task' });
  }
});

// Reorder tasks endpoint
app.post('/tasks/reorder', async (req, res) => {
  try {
    const { taskIds } = req.body as { taskIds: string[] };
    
    if (!taskIds || !Array.isArray(taskIds)) {
      res.status(400).json({ error: 'taskIds array is required' });
      return;
    }
    
    const success = await pdfQueueService.reorderTasks(taskIds);
    
    if (success) {
      res.json({ 
        message: 'Tasks reordered successfully',
        taskIds: taskIds
      });
    } else {
      res.status(400).json({ error: 'Failed to reorder tasks' });
    }
  } catch (error) {
    console.error('Reorder tasks error:', error);
    res.status(500).json({ error: 'Failed to reorder tasks' });
  }
});

// Get current task order endpoint
app.get('/tasks/order', async (req, res) => {
  try {
    const orderedTasks = await pdfQueueService.getAllTasks();
    
    res.json({
      tasks: orderedTasks.map(task => ({
        id: task.id,
        filename: task.filename,
        status: task.status,
        displayOrder: task.displayOrder,
        createdAt: task.createdAt
      })),
      totalTasks: orderedTasks.length,
      message: 'Tasks returned in current display order'
    });
  } catch (error) {
    console.error('Get task order error:', error);
    res.status(500).json({ error: 'Failed to get task order' });
  }
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const isHealthy = pdfQueueService.isHealthy();
    const queueStatus = pdfQueueService.getQueueStatus();
    
    res.json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      queue: queueStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({ 
      status: 'unhealthy',
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/', (req, res) => {
  res.json({ 
    message: 'Welcome to the PDF Processing API!',
    version: '2.0.0',
    endpoints: {
      upload: 'POST /upload',
      status: 'GET /status/:taskId',
      allTasks: 'GET /status',
      files: 'GET /files',
      viewFile: 'GET /files/:filename',
      deleteFile: 'DELETE /files/:filename',
      clearCompleted: 'DELETE /tasks/completed',
      clearAllTasks: 'DELETE /tasks/all',
      reorderTasks: 'POST /tasks/reorder',
      taskOrder: 'GET /tasks/order',
      queueStats: 'GET /queue/stats',
      health: 'GET /health'
    }
  });
});

// Error handling middleware
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: error.message 
  });
});

// Initialize and start server
async function startServer() {
  try {
    // Initialize the container and all services
    await container.init();
    
    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
      console.log('PDF Queue Service initialized with improved architecture');
      console.log('- Dependency injection container');
      console.log('- Separated concerns (Repository, Processor, Queue)');
      console.log('- Better error handling and validation');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer(); 