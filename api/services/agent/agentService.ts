import express from 'express';
import { AgentQueue, AgentTask } from './agentQueue';
import { ComparisonWorker, ResearchWorker, WritingWorker } from './Worker';
import { MemoryDatabaseService } from './memoryDatabaseService';
import { Memory } from './memory';
import { IndicesAgentQueue } from './IndicesAgentQueue';
import { ChangeOfStatementAgentQueue } from './ChangeOfStatementAgentQueue';
import { IndicesDatabaseService } from '../indicesDatabaseService';
import { AgentQueueDatabaseService } from './agentQueueDatabaseService';

const router = express.Router();

// In-memory map of queues by key (agentType:userQuery)
const agentQueues: Record<string, AgentQueue> = {};
const memoryDb = new MemoryDatabaseService();
const indicesDb = new IndicesDatabaseService();
const queueDb = new AgentQueueDatabaseService();

// Helper function to load existing queues from database on startup
async function loadExistingQueues() {
  try {
    const allQueues = await queueDb.getAllQueues();
    console.log(`[AGENT SERVICE] Found ${allQueues.length} existing queues in database`);
    
    for (const queueMetadata of allQueues) {
      // Only load active queues - skip completed/failed ones unless needed
      if (queueMetadata.status === 'active') {
        try {
          // Reconstruct the memory and queue objects
          const memory = new Memory(`agent-${queueMetadata.type}-${Date.now()}`);
          let agentQueue: AgentQueue;
          
          if (queueMetadata.type === 'indices') {
            agentQueue = new IndicesAgentQueue(memory);
          } else if (queueMetadata.type === 'change_statement') {
            agentQueue = new ChangeOfStatementAgentQueue(memory);
          } else {
            agentQueue = new AgentQueue(memory, queueMetadata.id);
          }
          
          // Generate a queue key (we'll use the queue ID as the key)
          const queueKey = queueMetadata.id;
          agentQueues[queueKey] = agentQueue;
          
          console.log(`[AGENT SERVICE] Loaded queue: ${queueKey} (${queueMetadata.name})`);
        } catch (error) {
          console.error(`[AGENT SERVICE] Failed to load queue ${queueMetadata.id}:`, error);
        }
      }
    }
  } catch (error) {
    console.error('[AGENT SERVICE] Failed to load existing queues:', error);
  }
}

// Load existing queues on module initialization
loadExistingQueues();

// POST /api/agent/start
// Start an agent run (indices or change of statement)
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
    } else if (agentType === 'change_statement') {
      const memory = new Memory(`agent-change-statement-${Date.now()}`);
      agentQueue = new ChangeOfStatementAgentQueue(memory);
      await agentQueue.initializeQueue(`Change of Statement Agent - ${userQuery}`, 'change_statement');
    } else {
      return res.status(400).json({ error: 'Invalid agentType. Must be "indices" or "change_statement"' });
    }

    // Store the queue
    agentQueues[queueKey] = agentQueue;

    // Initialize the agent
    if (agentType === 'indices') {
      await (agentQueue as IndicesAgentQueue).initiate(userQuery);
      await (agentQueue as IndicesAgentQueue).addTasks(userQuery);
    } else if (agentType === 'change_statement') {
      await (agentQueue as ChangeOfStatementAgentQueue).initiate(userQuery);
      await (agentQueue as ChangeOfStatementAgentQueue).addTasks(userQuery);
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
// Get all agent queues from database (not just in-memory ones)
router.get('/queue', async (_req, res) => {
  try {
    // Get all queues from database
    const allQueuesFromDb = await queueDb.getAllQueues();
    
    const queues = await Promise.all(
      allQueuesFromDb.map(async (queueMetadata) => {
        try {
          // Get tasks for this queue
          const tasks = await queueDb.getQueueTasks(queueMetadata.id);
          
          // Convert TaskMetadata to AgentTask format with payloads
          const agentTasks: AgentTask[] = await Promise.all(
            tasks.map(async (taskMeta) => {
              let payload = null;
              
              try {
                payload = await queueDb.getTaskPayload(queueMetadata.id, taskMeta.id);
              } catch (error) {
                console.warn(`[AGENT SERVICE] Failed to load payload for task ${taskMeta.id}:`, error);
              }
              
              return {
                id: taskMeta.id,
                type: taskMeta.type,
                payload,
                status: taskMeta.status,
                metadata: taskMeta.metadata,
                resultPath: taskMeta.resultPath,
                result: taskMeta.result,
                error: taskMeta.error
              };
            })
          );
          
          return {
            queueKey: queueMetadata.id,
            queueInfo: queueMetadata,
            tasks: agentTasks,
            taskCount: agentTasks.length,
            pendingTasks: agentTasks.filter(t => t.status === 'pending').length,
            completedTasks: agentTasks.filter(t => t.status === 'completed').length,
            failedTasks: agentTasks.filter(t => t.status === 'failed').length
          };
        } catch (error) {
          console.error(`[AGENT SERVICE] Error processing queue ${queueMetadata.id}:`, error);
          return {
            queueKey: queueMetadata.id,
            queueInfo: queueMetadata,
            tasks: [],
            taskCount: 0,
            pendingTasks: 0,
            completedTasks: 0,
            failedTasks: 0
          };
        }
      })
    );
    
    res.json({ queues });
  } catch (error) {
    console.error('[AGENT SERVICE] Error fetching queues:', error);
    res.status(500).json({ 
      error: 'Failed to fetch agent queues', 
      details: error instanceof Error ? error.message : String(error),
      queues: []
    });
  }
});

// GET /api/agent/result/:queueKey/:taskId
// Retrieve agent result by queueKey and taskId
router.get('/result/:queueKey/:taskId', async (req, res) => {
  const { queueKey, taskId } = req.params;
  
  try {
    // Try to get from in-memory queue first
    const queue = agentQueues[queueKey];
    if (queue) {
      const task = await queue.getTask(taskId);
      if (task) {
        return res.json({ result: task.result, task });
      }
    }
    
    // Fallback to database lookup
    const taskMeta = await queueDb.getTask(queueKey, taskId);
    if (!taskMeta) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    const payload = await queueDb.getTaskPayload(queueKey, taskId);
    
    const task: AgentTask = {
      id: taskMeta.id,
      type: taskMeta.type,
      payload,
      status: taskMeta.status,
      metadata: taskMeta.metadata,
      resultPath: taskMeta.resultPath,
      result: taskMeta.result,
      error: taskMeta.error
    };
    
    res.json({ result: task.result, task });
  } catch (error) {
    console.error('Error getting task result:', error);
    res.status(500).json({ error: 'Failed to get task result' });
  }
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
  
  try {
    // Try to get from in-memory queue first
    const queue = agentQueues[queueKey];
    if (queue) {
      let isFinished = false;
      if (queue instanceof IndicesAgentQueue) {
        isFinished = await queue.ensuringFinish();
      } else if (queue instanceof ChangeOfStatementAgentQueue) {
        // Generic check for change of statement agent based on task statuses
        const tasks = await queue.getTasks();
        const allCompleted = tasks.every(t => t.status === 'completed');
        const anyFailed = tasks.some(t => t.status === 'failed');
        isFinished = allCompleted || anyFailed;
      } else {
        // Generic check based on task statuses
        const tasks = await queue.getTasks();
        const allCompleted = tasks.every(t => t.status === 'completed');
        const anyFailed = tasks.some(t => t.status === 'failed');
        isFinished = allCompleted || anyFailed;
      }

      return res.json({ 
        queueKey, 
        isFinished,
        message: isFinished ? 'Agent processing completed' : 'Agent still processing'
      });
    }
    
    // Fallback to database check
    const queueInfo = await queueDb.getQueue(queueKey);
    if (!queueInfo) {
      return res.status(404).json({ error: 'Queue not found' });
    }
    
    const tasks = await queueDb.getQueueTasks(queueKey);
    const allCompleted = tasks.every(t => t.status === 'completed');
    const anyFailed = tasks.some(t => t.status === 'failed');
    const isFinished = allCompleted || anyFailed;
    
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
  
  try {
    console.log(`[AGENT SERVICE] Starting deletion of queue: ${queueKey}`);
    
    // Get queue info and tasks from database
    const queueInfo = await queueDb.getQueue(queueKey);
    if (!queueInfo) {
      console.warn(`[AGENT SERVICE] Queue not found: ${queueKey}`);
      return res.status(404).json({ error: 'Queue not found' });
    }
    
    const tasks = await queueDb.getQueueTasks(queueKey);
    console.log(`[AGENT SERVICE] Found ${tasks.length} tasks in queue ${queueKey}`);
    
    // Delete indices created by this agent queue
    let deletedIndicesCount = 0;
    try {
      deletedIndicesCount = await indicesDb.deleteIndicesByQueueKey(queueKey);
      console.log(`[AGENT SERVICE] Deleted ${deletedIndicesCount} indices for queue ${queueKey}`);
    } catch (error) {
      console.error(`[AGENT SERVICE] Error deleting indices for queue ${queueKey}:`, error);
    }
    
    // Delete memory snapshots for this queue
    let deletedMemoryCount = 0;
    try {
      const queue = agentQueues[queueKey];
      if (queue) {
        const snapshots = await memoryDb.getSnapshots(queue['memory']['id']);
        deletedMemoryCount = snapshots.length;
        console.log(`[AGENT SERVICE] Found ${snapshots.length} memory snapshots for queue ${queueKey}`);
      }
    } catch (error) {
      console.error(`[AGENT SERVICE] Error accessing memory for queue ${queueKey}:`, error);
    }
    
    // Delete the queue from database (this will also delete tasks and payloads)
    console.log(`[AGENT SERVICE] Deleting queue ${queueKey} from agent-queues.json database`);
    const queueDeleted = await queueDb.deleteQueue(queueKey);
    
    if (queueDeleted) {
      console.log(`[AGENT SERVICE] Successfully deleted queue ${queueKey} from agent-queues.json`);
    } else {
      console.warn(`[AGENT SERVICE] Queue ${queueKey} was not found in agent-queues.json during deletion`);
    }
    
    // Remove the queue from memory if it exists
    if (agentQueues[queueKey]) {
      delete agentQueues[queueKey];
      console.log(`[AGENT SERVICE] Removed queue ${queueKey} from in-memory storage`);
    }
    
    console.log(`[AGENT SERVICE] Successfully deleted queue ${queueKey} with ${tasks.length} tasks, ${deletedIndicesCount} indices, ${deletedMemoryCount} memory snapshots`);
    
    res.json({ 
      queueKey,
      deletedTasks: tasks.length,
      deletedIndices: deletedIndicesCount,
      deletedMemorySnapshots: deletedMemoryCount,
      queueDeletedFromDatabase: queueDeleted,
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
