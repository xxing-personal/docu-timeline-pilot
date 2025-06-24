import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import cors from 'cors';
import { PDFQueueService } from './services/pdfQueueService';
import { PDFProcessor } from './services/pdfProcessor';
import { DatabaseService } from './services/databaseService';

const app = express();
const port = process.env.PORT || 3000;
app.use(cors({ origin: '*' }));
app.use(express.json());

// Initialize services
const databaseService = new DatabaseService();
const pdfProcessor = new PDFProcessor();
const queueService = new PDFQueueService(pdfProcessor, databaseService);

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
    
    // Sort files by upload timestamp (creation time)
    const sortedFiles = files.sort((a, b) => {
      const statsA = fs.statSync(a.path);
      const statsB = fs.statSync(b.path);
      return statsA.birthtime.getTime() - statsB.birthtime.getTime();
    });
    
    console.log(`[UPLOAD] Processing ${sortedFiles.length} files in upload timestamp order`);
    
    // Add each file to queue in sorted order
    for (const file of sortedFiles) {
      const taskId = await queueService.addTask(file.filename, file.path);
      results.push({
        taskId,
        filename: file.filename,
        status: 'pending'
      });
    }
    
    const queueStats = await queueService.getQueueStats();
    
    res.json({
      message: `${files.length} PDF(s) uploaded successfully and queued for processing in upload timestamp order!`,
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
    const task = await queueService.getTask(taskId);
    
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    
    const queueStats = await queueService.getQueueStats();
    
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
    const allTasks = (await queueService.getAllTasks()).map((task: any) => ({
      id: task.id,
      filename: task.filename,
      status: task.status,
      createdAt: task.createdAt,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      error: task.error,
      // Include result for completed tasks so frontend can display summaries
      result: task.result,
      hasResult: !!task.result
    }));
    
    const queueStats = await queueService.getQueueStats();
    
    res.json({
      tasks: allTasks,
      queueStats: queueStats.queue,
      taskStats: {
        total: allTasks.length,
        pending: allTasks.filter((t: any) => t.status === 'pending').length,
        processing: allTasks.filter((t: any) => t.status === 'processing').length,
        completed: allTasks.filter((t: any) => t.status === 'completed').length,
        failed: allTasks.filter((t: any) => t.status === 'failed').length
      }
    });
  } catch (error) {
    console.error('Get all tasks error:', error);
    res.status(500).json({ error: 'Failed to get tasks' });
  }
});

// Queue control endpoints
app.post('/queue/pause', (req, res) => {
  try {
    queueService.pauseQueue();
    res.json({ message: 'Queue paused successfully' });
  } catch (error) {
    console.error('Pause queue error:', error);
    res.status(500).json({ error: 'Failed to pause queue' });
  }
});

app.post('/queue/resume', (req, res) => {
  try {
    queueService.resumeQueue();
    res.json({ message: 'Queue resumed successfully' });
  } catch (error) {
    console.error('Resume queue error:', error);
    res.status(500).json({ error: 'Failed to resume queue' });
  }
});

// Task management endpoints
app.delete('/tasks/:taskId', async (req, res) => {
  try {
    const taskId = req.params.taskId;
    const removed = await queueService.removeTask(taskId);
    
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

app.delete('/tasks/completed', async (req, res) => {
  try {
    const clearedCount = await queueService.clearCompletedTasks();
    res.json({ 
      message: `Cleared ${clearedCount} completed tasks`,
      clearedCount: clearedCount
    });
  } catch (error) {
    console.error('Clear completed tasks error:', error);
    res.status(500).json({ error: 'Failed to clear completed tasks' });
  }
});

// Get auto-reorder status
app.get('/tasks/auto-reorder-status', (req, res) => {
  try {
    const status = queueService.getAutoReorderStatus();
    res.json(status);
  } catch (error) {
    console.error('Get auto-reorder status error:', error);
    res.status(500).json({ error: 'Failed to get auto-reorder status' });
  }
});

// Reorder tasks endpoint (safe version for completed tasks only)
app.post('/tasks/reorder', async (req, res) => {
  try {
    const { taskIds } = req.body as { taskIds: string[] };
    
    if (!taskIds || !Array.isArray(taskIds)) {
      res.status(400).json({ error: 'taskIds array is required' });
      return;
    }
    
    // Check if auto-reorder by inferred timestamp has been completed
    const autoReorderStatus = queueService.getAutoReorderStatus();
    if (!autoReorderStatus.completed) {
      res.status(403).json({ 
        error: 'Manual reordering not allowed',
        details: autoReorderStatus.message,
        autoReorderCompleted: false
      });
      return;
    }
    
    const success = await queueService.reorderTasks(taskIds);
    
    if (success) {
      res.json({ 
        message: 'Tasks reordered successfully',
        taskIds: taskIds,
        autoReorderCompleted: true
      });
    } else {
      res.status(400).json({ 
        error: 'Failed to reorder tasks',
        autoReorderCompleted: true
      });
    }
  } catch (error) {
    console.error('Reorder tasks error:', error);
    res.status(500).json({ error: 'Failed to reorder tasks' });
  }
});

// Serve individual PDF files
app.get('/files/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, '../uploads', filename);
    
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'File not found' });
      return;
    }
    
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error serving file:', error);
    res.status(500).json({ error: 'Failed to serve file' });
  }
});

// File management endpoints
app.get('/files', async (req, res) => {
  try {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      res.json({ files: [], total: 0 });
      return;
    }

    const files = fs.readdirSync(uploadDir)
      .filter(file => file.endsWith('.pdf'))
      .map(filename => {
        const filePath = path.join(uploadDir, filename);
        const stats = fs.statSync(filePath);
        return {
          filename,
          size: stats.size,
          uploadedAt: stats.birthtime.toISOString(),
          modifiedAt: stats.mtime.toISOString()
        };
      });

    res.json({
      files,
      total: files.length
    });
  } catch (error) {
    console.error('Get files error:', error);
    res.status(500).json({ error: 'Failed to get files' });
  }
});

app.delete('/files/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, '../uploads', filename);
    
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    // Remove the file
    fs.unlinkSync(filePath);
    
    // Also remove associated extracted text file if it exists
    const extractedTextPath = path.join(__dirname, '../extracted-texts', `${filename}_extracted.md`);
    if (fs.existsSync(extractedTextPath)) {
      fs.unlinkSync(extractedTextPath);
    }

    // Remove associated tasks
    const allTasks = await queueService.getAllTasks();
    const tasksToRemove = allTasks.filter((task: any) => task.filename === filename);
    for (const task of tasksToRemove) {
      await queueService.removeTask(task.id);
    }

    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

app.delete('/files', async (req, res) => {
  try {
    const uploadDir = path.join(__dirname, '../uploads');
    const extractedTextsDir = path.join(__dirname, '../extracted-texts');
    
    if (fs.existsSync(uploadDir)) {
      const files = fs.readdirSync(uploadDir).filter(file => file.endsWith('.pdf'));
      files.forEach(file => {
        const filePath = path.join(uploadDir, file);
        fs.unlinkSync(filePath);
      });
    }

    if (fs.existsSync(extractedTextsDir)) {
      const extractedFiles = fs.readdirSync(extractedTextsDir).filter(file => file.endsWith('.md'));
      extractedFiles.forEach(file => {
        const filePath = path.join(extractedTextsDir, file);
        fs.unlinkSync(filePath);
      });
    }

    // Clear all tasks
    const allTasks = await queueService.getAllTasks();
    for (const task of allTasks) {
      await queueService.removeTask(task.id);
    }

    res.json({ message: 'All files deleted successfully' });
  } catch (error) {
    console.error('Delete all files error:', error);
    res.status(500).json({ error: 'Failed to delete all files' });
  }
});

// Database information endpoints
app.get('/database/info', async (req, res) => {
  try {
    const info = await databaseService.getDatabaseInfo();
    res.json(info);
  } catch (error) {
    console.error('Database info error:', error);
    res.status(500).json({ error: 'Failed to get database info' });
  }
});

app.get('/database/statistics', async (req, res) => {
  try {
    const stats = await databaseService.getStatistics();
    res.json(stats);
  } catch (error) {
    console.error('Database statistics error:', error);
    res.status(500).json({ error: 'Failed to get database statistics' });
  }
});

app.post('/database/backup', async (req, res) => {
  try {
    const backupPath = await databaseService.backup();
    res.json({ 
      message: 'Database backed up successfully',
      backupPath: backupPath
    });
  } catch (error) {
    console.error('Database backup error:', error);
    res.status(500).json({ error: 'Failed to backup database' });
  }
});

app.post('/database/reset', async (req, res) => {
  try {
    await databaseService.resetDatabase();
    res.json({ message: 'Database reset successfully' });
  } catch (error) {
    console.error('Database reset error:', error);
    res.status(500).json({ error: 'Failed to reset database' });
  }
});

// Error handling middleware
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: error.message 
  });
});

app.listen(port, () => {
  console.log(`PDF Queue Server is running on http://localhost:${port}`);
  console.log('Use POST /upload with multipart/form-data to upload PDF files.');
  console.log('Files will be processed in the background queue.');
}); 