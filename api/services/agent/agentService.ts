import express from 'express';
import { AgentQueue, AgentTask } from './agentQueue';
import { ComparisonWorker, ResearchWorker, WritingWorker } from './Worker';
import { MemoryDatabaseService } from './memoryDatabaseService';
import { Memory } from './memory';
import { IndicesAgentQueue } from './IndicesAgentQueue';
import { DeepResearchAgentQueue } from './DeepResearchAgentQueue';

const router = express.Router();

// In-memory map of queues by key (agentType:userQuery)
const agentQueues: Record<string, AgentQueue> = {};
const memoryDb = new MemoryDatabaseService();

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
    } else if (agentType === 'deep_research') {
      const memory = new Memory(`agent-deep-research-${Date.now()}`);
      agentQueue = new DeepResearchAgentQueue(memory);
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
      const tasks = await queue.getTasks();
      return { queueKey: key, tasks };
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
  res.json({ result: task.result });
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

export default router; 
