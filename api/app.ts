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
import { ChatService } from './services/chatService';
import { IndicesDatabaseService } from './services/indicesDatabaseService';
import agentService from './services/agent/agentService';

const app = express();
const port = process.env.PORT || 3000;
app.use(cors({ origin: '*' }));
app.use(express.json());

// Initialize services
const databaseService = new DatabaseService();
const pdfProcessor = new PDFProcessor();
const queueService = new PDFQueueService(pdfProcessor, databaseService);
const chatService = new ChatService(databaseService);
const indicesDatabaseService = new IndicesDatabaseService();

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
    
    console.log(`[UPLOAD] Starting upload of ${files.length} files`);
    
    // Sort files by upload timestamp (creation time)
    const sortedFiles = files.sort((a, b) => {
      const statsA = fs.statSync(a.path);
      const statsB = fs.statSync(b.path);
      return statsA.birthtime.getTime() - statsB.birthtime.getTime();
    });
    
    console.log(`[UPLOAD] Processing ${sortedFiles.length} files in upload timestamp order`);
    
    // Add each file to queue in sorted order
    for (const file of sortedFiles) {
      console.log(`[UPLOAD] Adding file to queue: ${file.filename} (${file.path})`);
      try {
        const taskId = await queueService.addTask(file.filename, file.path);
        console.log(`[UPLOAD] Successfully created task ${taskId} for ${file.filename}`);
        results.push({
          taskId,
          filename: file.filename,
          status: 'pending'
        });
      } catch (taskError) {
        console.error(`[UPLOAD] Failed to create task for ${file.filename}:`, taskError);
        throw taskError; // This will trigger the cleanup
      }
    }
    
    const queueStats = await queueService.getQueueStats();
    console.log(`[UPLOAD] Upload completed successfully. Created ${results.length} tasks. Queue length: ${queueStats.queue.length}`);
    
    res.json({
      message: `${files.length} PDF(s) uploaded successfully and queued for processing in upload timestamp order!`,
      files: results,
      queueLength: queueStats.queue.length
    });
  } catch (error) {
    console.error('[UPLOAD] Upload error:', error);
    
    // Clean up uploaded files if task creation failed
    if (req.files) {
      const files = req.files as Express.Multer.File[];
      console.log(`[UPLOAD] Cleaning up ${files.length} uploaded files due to error`);
      files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
          console.log(`[UPLOAD] Deleted file: ${file.path}`);
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
    let allTasks = (await queueService.getAllTasks()).map((task: any) => ({
      id: task.id,
      filename: task.filename,
      status: task.status,
      createdAt: task.createdAt,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      error: task.error,
      result: task.result,
      hasResult: !!task.result,
      sortingTimestamp: task.sortingTimestamp
    }));
    
    // Sort by sortingTimestamp (ascending)
    allTasks = allTasks.sort((a, b) => {
      if (!a.sortingTimestamp && !b.sortingTimestamp) return 0;
      if (!a.sortingTimestamp) return 1;
      if (!b.sortingTimestamp) return -1;
      return new Date(a.sortingTimestamp).getTime() - new Date(b.sortingTimestamp).getTime();
    });
    
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

// Task action endpoints (only for completed tasks)
app.post('/tasks/:taskId/change-timestamp', async (req, res) => {
  try {
    const taskId = req.params.taskId;
    const { newTimestamp } = req.body as { newTimestamp: string };
    
    if (!newTimestamp) {
      res.status(400).json({ error: 'newTimestamp is required' });
      return;
    }
    
    // Validate timestamp format
    const timestamp = new Date(newTimestamp);
    if (isNaN(timestamp.getTime())) {
      res.status(400).json({ error: 'Invalid timestamp format. Use ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)' });
      return;
    }
    
    const task = await queueService.getTask(taskId);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    
    if (task.status !== 'completed') {
      res.status(400).json({ error: 'Can only change timestamp for completed tasks' });
      return;
    }
    
    // Update the inferred timestamp in the task result
    if (!task.result) {
      res.status(400).json({ error: 'Task has no result to update' });
      return;
    }
    
    const updatedResult = {
      ...task.result,
      metadata: {
        ...task.result.metadata,
        inferredTimestamp: newTimestamp
      }
    };
    
    const success = await queueService.updateTaskResult(taskId, updatedResult);
    
    if (success) {
      res.json({ 
        message: 'Timestamp updated successfully',
        taskId: taskId,
        newTimestamp: newTimestamp
      });
    } else {
      res.status(500).json({ error: 'Failed to update timestamp' });
    }
  } catch (error) {
    console.error('Change timestamp error:', error);
    res.status(500).json({ error: 'Failed to change timestamp' });
  }
});

app.post('/tasks/:taskId/regenerate', async (req, res) => {
  try {
    const taskId = req.params.taskId;
    
    const task = await queueService.getTask(taskId);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    
    if (task.status !== 'completed') {
      res.status(400).json({ error: 'Can only regenerate summary for completed tasks' });
      return;
    }
    
    // Reset task to pending status and add back to queue
    const success = await queueService.regenerateTask(taskId);
    
    if (success) {
      res.json({ 
        message: 'Task queued for regeneration',
        taskId: taskId,
        status: 'pending'
      });
    } else {
      res.status(500).json({ error: 'Failed to regenerate task' });
    }
  } catch (error) {
    console.error('Regenerate task error:', error);
    res.status(500).json({ error: 'Failed to regenerate task' });
  }
});

app.post('/tasks/:taskId/edit-score', async (req, res) => {
  try {
    const taskId = req.params.taskId;
    const { scores } = req.body as { scores: Record<string, number> };
    
    if (!scores || typeof scores !== 'object') {
      res.status(400).json({ error: 'scores object is required' });
      return;
    }
    
    // Validate scores (should be between 0 and 1)
    for (const [key, value] of Object.entries(scores)) {
      if (typeof value !== 'number' || value < 0 || value > 1) {
        res.status(400).json({ error: `Score for ${key} must be a number between 0 and 1` });
        return;
      }
    }
    
    const task = await queueService.getTask(taskId);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    
    if (task.status !== 'completed') {
      res.status(400).json({ error: 'Can only edit scores for completed tasks' });
      return;
    }
    
    // Update the analysis scores in the task result
    if (!task.result) {
      res.status(400).json({ error: 'Task has no result to update' });
      return;
    }
    
    const updatedResult = {
      ...task.result,
      metadata: {
        ...task.result.metadata,
        analysisScores: {
          ...(task.result.metadata?.analysisScores || {}),
          ...scores
        }
      }
    };
    
    const success = await queueService.updateTaskResult(taskId, updatedResult);
    
    if (success) {
      res.json({ 
        message: 'Scores updated successfully',
        taskId: taskId,
        updatedScores: scores
      });
    } else {
      res.status(500).json({ error: 'Failed to update scores' });
    }
  } catch (error) {
    console.error('Edit score error:', error);
    res.status(500).json({ error: 'Failed to edit score' });
  }
});

// Chat endpoint
app.post('/chat', async (req, res) => {
  try {
    const { message, mentions, sessionId } = req.body as { message: string; mentions: string[]; sessionId?: string };
    
    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'message is required and must be a string' });
      return;
    }
    
    if (!mentions || !Array.isArray(mentions)) {
      res.status(400).json({ error: 'mentions is required and must be an array' });
      return;
    }
    
    const response = await chatService.processChat({ message, mentions, sessionId });
    
    res.json(response);
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to process chat request' });
  }
});

// Chat session management endpoints
app.get('/chat/sessions', async (req, res) => {
  try {
    const sessions = await chatService.getAllSessions();
    res.json(sessions);
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ error: 'Failed to get chat sessions' });
  }
});

app.post('/chat/sessions', async (req, res) => {
  try {
    const { name } = req.body as { name: string };
    
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'name is required and must be a string' });
      return;
    }
    
    const session = await chatService.createSession(name);
    res.json(session);
  } catch (error) {
    console.error('Create session error:', error);
    res.status(500).json({ error: 'Failed to create chat session' });
  }
});

app.get('/chat/sessions/:sessionId', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const session = await chatService.getSession(sessionId);
    
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    
    res.json(session);
  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({ error: 'Failed to get chat session' });
  }
});

app.get('/chat/sessions/:sessionId/messages', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const limit = parseInt(req.query.limit as string) || 50;
    
    const messages = await chatService.getChatHistory(sessionId, limit);
    res.json(messages);
  } catch (error) {
    console.error('Get session messages error:', error);
    res.status(500).json({ error: 'Failed to get session messages' });
  }
});

app.delete('/chat/sessions/:sessionId', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const success = await chatService.deleteSession(sessionId);
    
    if (success) {
      res.json({ message: 'Session deleted successfully' });
    } else {
      res.status(404).json({ error: 'Session not found' });
    }
  } catch (error) {
    console.error('Delete session error:', error);
    res.status(500).json({ error: 'Failed to delete chat session' });
  }
});

app.get('/chat/statistics', async (req, res) => {
  try {
    const statistics = await chatService.getChatStatistics();
    res.json(statistics);
  } catch (error) {
    console.error('Get chat statistics error:', error);
    res.status(500).json({ error: 'Failed to get chat statistics' });
  }
});

// Diagnostic endpoint to help debug missing tasks
app.get('/debug/state', async (req, res) => {
  try {
    const allTasks = await queueService.getAllTasks();
    const queueStats = await queueService.getQueueStats();
    const databaseInfo = await queueService.getDatabaseService().getDatabaseInfo();
    
    // Check file system state
    const uploadDir = path.join(__dirname, '../uploads');
    const uploadFiles = fs.existsSync(uploadDir) 
      ? fs.readdirSync(uploadDir).filter(f => f.endsWith('.pdf'))
      : [];
    
    const extractedTextsDir = path.join(__dirname, 'extracted-texts');
    const extractedFiles = fs.existsSync(extractedTextsDir)
      ? fs.readdirSync(extractedTextsDir).filter(f => f.endsWith('.md'))
      : [];
    
    res.json({
      timestamp: new Date().toISOString(),
      database: {
        totalTasks: allTasks.length,
        taskIds: allTasks.map(t => ({ id: t.id, filename: t.filename, status: t.status })),
        databaseInfo
      },
      queue: {
        length: queueStats.queue.length,
        working: queueStats.queue.working,
        taskOrder: queueService.getTaskOrder ? queueService.getTaskOrder() : 'Not available'
      },
      filesystem: {
        uploadFiles: uploadFiles.map(f => ({
          filename: f,
          path: path.join(uploadDir, f),
          exists: fs.existsSync(path.join(uploadDir, f))
        })),
        extractedFiles: extractedFiles.map(f => ({
          filename: f,
          path: path.join(extractedTextsDir, f),
          exists: fs.existsSync(path.join(extractedTextsDir, f))
        }))
      },
      analysis: {
        tasksWithoutFiles: allTasks.filter(t => !fs.existsSync(t.path)),
        filesWithoutTasks: uploadFiles.filter(f => 
          !allTasks.some(t => t.filename === f)
        ),
        completedTasksWithoutExtractedText: allTasks.filter(t => 
          t.status === 'completed' && 
          !extractedFiles.some(ef => ef === `${t.filename}_extracted.md`)
        )
      }
    });
  } catch (error) {
    console.error('Debug state error:', error);
    res.status(500).json({ error: 'Failed to get debug state' });
  }
});

// Indices endpoints
app.get('/indices', async (req, res) => {
  try {
    const indices = await indicesDatabaseService.getAllIndices();
    res.json(indices);
  } catch (error) {
    console.error('Get indices error:', error);
    res.status(500).json({ error: 'Failed to get indices' });
  }
});

app.get('/indices/names', async (req, res) => {
  try {
    const indexNames = await indicesDatabaseService.getUniqueIndexNames();
    res.json(indexNames);
  } catch (error) {
    console.error('Get index names error:', error);
    res.status(500).json({ error: 'Failed to get index names' });
  }
});

app.get('/indices/:indexName', async (req, res) => {
  try {
    const indexName = req.params.indexName;
    const indices = await indicesDatabaseService.getIndicesByName(indexName);
    res.json(indices);
  } catch (error) {
    console.error('Get indices by name error:', error);
    res.status(500).json({ error: 'Failed to get indices by name' });
  }
});

app.get('/indices/statistics', async (req, res) => {
  try {
    const statistics = await indicesDatabaseService.getStatistics();
    res.json(statistics);
  } catch (error) {
    console.error('Get indices statistics error:', error);
    res.status(500).json({ error: 'Failed to get indices statistics' });
  }
});

app.get('/indices/info', async (req, res) => {
  try {
    const info = await indicesDatabaseService.getDatabaseInfo();
    res.json(info);
  } catch (error) {
    console.error('Get indices info error:', error);
    res.status(500).json({ error: 'Failed to get indices info' });
  }
});

// Agent endpoints
app.use('/agent', agentService);

// Research Articles API endpoints
app.get('/api/research-articles', async (req, res) => {
  try {
    const path = require('path');
    const fs = require('fs/promises');
    
    const articlesDir = path.join(__dirname, 'research-articles');
    
    // Check if directory exists
    try {
      await fs.access(articlesDir);
    } catch {
      return res.json({ articles: [] });
    }
    
    // Read directory contents
    const files = await fs.readdir(articlesDir);
    const markdownFiles = files.filter((file: string) => file.endsWith('.md'));
    
    // Get file metadata
    const articles = await Promise.all(
      markdownFiles.map(async (filename: string) => {
        try {
          const filepath = path.join(articlesDir, filename);
          const stats = await fs.stat(filepath);
          const content = await fs.readFile(filepath, 'utf-8');
          
          // Parse frontmatter
          const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
          let metadata = {};
          let articleContent = content;
          
          if (frontmatterMatch) {
            try {
              const frontmatter = frontmatterMatch[1];
              const lines = frontmatter.split('\n');
              metadata = lines.reduce((acc: any, line: string) => {
                const [key, ...valueParts] = line.split(':');
                if (key && valueParts.length > 0) {
                  const value = valueParts.join(':').trim().replace(/^["']|["']$/g, '');
                  acc[key.trim()] = value;
                }
                return acc;
              }, {});
              
              // Remove frontmatter from content
              articleContent = content.replace(/^---\n[\s\S]*?\n---\n/, '');
            } catch (parseError) {
              console.warn(`Failed to parse frontmatter for ${filename}:`, parseError);
            }
          }
          
          return {
            filename,
            filepath: path.relative(__dirname, filepath),
            title: (metadata as any).title || filename.replace('.md', ''),
            query: (metadata as any).query || (metadata as any).title || filename.replace('.md', ''),
            intent: (metadata as any).intent || '',
            generated: (metadata as any).generated || stats.mtime.toISOString(),
            documentsAnalyzed: parseInt((metadata as any).documents_analyzed) || 0,
            size: stats.size,
            lastModified: stats.mtime.toISOString(),
            preview: articleContent.substring(0, 200).replace(/[#*]/g, '').trim()
          };
        } catch (error) {
          console.error(`Error processing file ${filename}:`, error);
          return null;
        }
      })
    );
    
    // Filter out null results and sort by creation date (newest first)
    const validArticles = articles
      .filter(article => article !== null)
      .sort((a, b) => new Date(b.generated).getTime() - new Date(a.generated).getTime());
    
    res.json({ articles: validArticles });
  } catch (error) {
    console.error('Error listing research articles:', error);
    res.status(500).json({ error: 'Failed to list research articles' });
  }
});

app.get('/api/research-articles/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const path = require('path');
    const fs = require('fs/promises');
    
    // Validate filename to prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || !filename.endsWith('.md')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    
    const articlesDir = path.join(__dirname, 'research-articles');
    const filepath = path.join(articlesDir, filename);
    
    try {
      const content = await fs.readFile(filepath, 'utf-8');
      
      // Parse frontmatter and content
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      let metadata = {};
      let articleContent = content;
      
      if (frontmatterMatch) {
        try {
          const frontmatter = frontmatterMatch[1];
          const lines = frontmatter.split('\n');
          metadata = lines.reduce((acc: any, line: string) => {
            const [key, ...valueParts] = line.split(':');
            if (key && valueParts.length > 0) {
              const value = valueParts.join(':').trim().replace(/^["']|["']$/g, '');
              acc[key.trim()] = value;
            }
            return acc;
          }, {});
          
          // Remove frontmatter from content
          articleContent = content.replace(/^---\n[\s\S]*?\n---\n/, '');
        } catch (parseError) {
          console.warn(`Failed to parse frontmatter for ${filename}:`, parseError);
        }
      }
      
      res.json({
        filename,
        metadata,
        content: articleContent,
        rawContent: content
      });
    } catch (readError) {
      res.status(404).json({ error: 'Article not found' });
    }
  } catch (error) {
    console.error('Error serving research article:', error);
    res.status(500).json({ error: 'Failed to serve research article' });
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