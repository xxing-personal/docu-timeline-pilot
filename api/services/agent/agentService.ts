import express from 'express';
import { AgentQueue, AgentTask } from './agentQueue';
import { ComparisonWorker, ResearchWorker, WritingWorker } from './Worker';
import { MemoryDatabaseService } from './memoryDatabaseService';
import { Memory } from './memory';
import { IndicesAgentQueue } from './IndicesAgentQueue';
import { DeepResearchAgentQueue } from './DeepResearchAgentQueue';
import { IndicesDatabaseService } from '../indicesDatabaseService';

const router = express.Router();

// In-memory map of queues by key (agentType:userQuery)
const agentQueues: Record<string, AgentQueue> = {};
const memoryDb = new MemoryDatabaseService();
const indicesDb = new IndicesDatabaseService();

// POST /api/agent/start
// Start an agent run (indices or deep research)
router.post('/start', async (req, res) => {
  const { agentType, userQuery } = req.body;
  if (!agentType || !userQuery) {
    return res.status(400).json({ error: 'Missing agentType or userQuery' });
  }

  try {
    const queueKey = `${agentType}:${userQuery}`;
    
    // Create the appropriate agent queue based on type
    let agentQueue: AgentQueue;
    if (agentType === 'indices') {
      const memory = new Memory(`agent-indices-${Date.now()}`);
      agentQueue = new IndicesAgentQueue(memory);
      await agentQueue.initializeQueue(`Indices Agent - ${userQuery}`, 'indices');
    } else if (agentType === 'deep_research') {
      const memory = new Memory(`agent-deep-research-${Date.now()}`);
      agentQueue = new DeepResearchAgentQueue(memory);
      await agentQueue.initializeQueue(`Deep Research Agent - ${userQuery}`, 'deep_research');
    } else {
      return res.status(400).json({ error: 'Invalid agentType. Must be "indices" or "deep_research"' });
    }

    // Store the queue
    agentQueues[queueKey] = agentQueue;

    // Initialize the agent
    if (agentType === 'indices') {
      await (agentQueue as IndicesAgentQueue).initiate(userQuery);
      await (agentQueue as IndicesAgentQueue).addTasks(userQuery);
    } else {
      await (agentQueue as DeepResearchAgentQueue).initiate(userQuery);
      await (agentQueue as DeepResearchAgentQueue).addTasks(userQuery);
    }

    // Start processing
    await agentQueue.process();

    res.json({ 
      taskId: queueKey, 
      queueKey,
      message: `Started ${agentType} agent with query: "${userQuery}"`
    });
  } catch (error) {
    console.error('Error starting agent:', error);
    res.status(500).json({ 
      error: 'Failed to start agent', 
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// GET /api/agent/queue
// Visualize the agent queue (for all queues for now)
router.get('/queue', async (_req, res) => {
  const allQueues = await Promise.all(
    Object.entries(agentQueues).map(async ([key, queue]) => {
      const queueInfo = await queue.getQueueInfo();
      const tasks = await queue.getTasks();
      return { 
        queueKey: key, 
        queueInfo,
        tasks,
        taskCount: tasks.length,
        pendingTasks: tasks.filter(t => t.status === 'pending').length,
        completedTasks: tasks.filter(t => t.status === 'completed').length,
        failedTasks: tasks.filter(t => t.status === 'failed').length
      };
    })
  );
  res.json({ queues: allQueues });
});

// GET /api/agent/result/:queueKey/:taskId
// Retrieve agent result by queueKey and taskId
router.get('/result/:queueKey/:taskId', async (req, res) => {
  const { queueKey, taskId } = req.params;
  const queue = agentQueues[queueKey];
  if (!queue) {
    return res.status(404).json({ error: 'Queue not found' });
  }
  const task = await queue.getTask(taskId);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }
  res.json({ result: task.result, task });
});

// GET /api/agent/memory/:snapshotId
// Retrieve a memory snapshot by ID (version)
router.get('/memory/:snapshotId/:version', async (req, res) => {
  const { snapshotId, version } = req.params;
  const snapshot = await memoryDb.getSnapshot(snapshotId, Number(version));
  if (!snapshot) {
    return res.status(404).json({ error: 'Snapshot not found' });
  }
  res.json({ snapshot });
});

// POST /api/agent/check-finish/:queueKey
// Check if agent processing has finished
router.post('/check-finish/:queueKey', async (req, res) => {
  const { queueKey } = req.params;
  const queue = agentQueues[queueKey];
  
  if (!queue) {
    return res.status(404).json({ error: 'Queue not found' });
  }

  try {
    let isFinished = false;
    if (queue instanceof IndicesAgentQueue) {
      isFinished = await queue.ensuringFinish();
    } else if (queue instanceof DeepResearchAgentQueue) {
      isFinished = await queue.ensuringFinish();
    } else {
      return res.status(400).json({ error: 'Unknown queue type' });
    }

    res.json({ 
      queueKey, 
      isFinished,
      message: isFinished ? 'Agent processing completed' : 'Agent still processing'
    });
  } catch (error) {
    console.error('Error checking agent finish:', error);
    res.status(500).json({ 
      error: 'Failed to check agent status', 
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// DELETE /api/agent/queue/:queueKey
// Delete an agent queue and clean up related data
router.delete('/queue/:queueKey', async (req, res) => {
  const { queueKey } = req.params;
  const queue = agentQueues[queueKey];
  
  if (!queue) {
    return res.status(404).json({ error: 'Queue not found' });
  }

  try {
    // Get queue info and tasks
    const queueInfo = await queue.getQueueInfo();
    const tasks = await queue.getTasks();
    
    // Delete indices created by this agent queue
    let deletedIndicesCount = 0;
    try {
      deletedIndicesCount = await indicesDb.deleteIndicesByQueueKey(queueKey);
    } catch (error) {
      console.error(`[AGENT SERVICE] Error deleting indices for queue ${queueKey}:`, error);
    }
    
    // Delete memory snapshots for this queue
    let deletedMemoryCount = 0;
    try {
      const snapshots = await memoryDb.getSnapshots(queue['memory']['id']);
      // Note: We could add a delete method to MemoryDatabaseService if needed
      console.log(`[AGENT SERVICE] Found ${snapshots.length} memory snapshots for queue ${queueKey}`);
    } catch (error) {
      console.error(`[AGENT SERVICE] Error accessing memory for queue ${queueKey}:`, error);
    }
    
    // Delete the queue from database (this will also delete tasks and payloads)
    if (queueInfo) {
      await (queue as any).db.deleteQueue(queueInfo.id);
    }
    
    // Remove the queue from memory
    delete agentQueues[queueKey];
    
    console.log(`[AGENT SERVICE] Deleted queue ${queueKey} with ${tasks.length} tasks, ${deletedIndicesCount} indices`);
    
    res.json({ 
      queueKey,
      deletedTasks: tasks.length,
      deletedIndices: deletedIndicesCount,
      deletedMemorySnapshots: deletedMemoryCount,
      message: `Successfully deleted agent queue and cleaned up related data`
    });
  } catch (error) {
    console.error('Error deleting agent queue:', error);
    res.status(500).json({ 
      error: 'Failed to delete agent queue', 
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router; 
