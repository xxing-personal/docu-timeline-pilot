import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import path from 'path';
import fs from 'fs/promises';

// Individual index entry (now nested under task)
export interface IndexEntry {
  id: string;
  indexName: string;
  scoreValue: number;
  source: 'pdf_processing' | 'indices_creation';
  quotes: string[];
  rational: string;
}

// Task information
export interface TaskInfo {
  id: string;
  type: string;
  filename: string;
  articleId: string;
  status: string;
  createdAt: string;
  timestamp?: string; // Inferred timestamp from document
}

// Task with its indices
export interface TaskWithIndices {
  taskInfo: TaskInfo;
  indices: IndexEntry[];
}

// Agent information
export interface AgentInfo {
  name: string;
  type: string;
  queueKey: string;
  createdAt: string;
  status: string;
}

// Agent with its tasks
export interface AgentWithTasks {
  agentInfo: AgentInfo;
  tasks: { [taskId: string]: TaskWithIndices };
}

// New nested database schema
interface IndicesDatabaseSchema {
  agents: { [queueKey: string]: AgentWithTasks };
  settings: {
    lastBackup: string | null;
    version: string;
  };
  statistics: {
    totalAgents: number;
    totalTasks: number;
    totalIndices: number;
    lastIndexDate: string;
  };
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

export class IndicesDatabaseService {
  private db: Low<IndicesDatabaseSchema>;
  private dbPath: string;
  private mutex = new Mutex();

  constructor() {
    this.dbPath = path.join(process.cwd(), 'data', 'indices-database.json');
    const adapter = new JSONFile<IndicesDatabaseSchema>(this.dbPath);
    this.db = new Low(adapter, {
      agents: {},
      settings: {
        lastBackup: null,
        version: '2.0.0'
      },
      statistics: {
        totalAgents: 0,
        totalTasks: 0,
        totalIndices: 0,
        lastIndexDate: new Date().toISOString()
      }
    });
    
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
        this.db.data = {
          agents: {},
          settings: {
            lastBackup: null,
            version: '2.0.0'
          },
          statistics: {
            totalAgents: 0,
            totalTasks: 0,
            totalIndices: 0,
            lastIndexDate: new Date().toISOString()
          }
        };
        await this.db.write();
        console.log('[INDICES DATABASE] Initialized new nested database structure');
      } else {
        // Check if we need to migrate from old structure
        if (!this.db.data.agents && (this.db.data as any).indices) {
          console.log('[INDICES DATABASE] Migrating from old flat structure to new nested structure');
          await this.migrateFromFlatStructure();
        } else {
          console.log('[INDICES DATABASE] Loaded existing nested database structure');
        }
      }
    } catch (error) {
      console.error('[INDICES DATABASE] Error initializing database:', error);
      throw error;
    }
  }

  // Migration function to convert old flat structure to new nested structure
  private async migrateFromFlatStructure(): Promise<void> {
    try {
      const oldData = this.db.data as any;
      const oldIndices = oldData.indices || [];
      
      console.log(`[INDICES DATABASE] Migrating ${oldIndices.length} indices from flat structure`);
      
      const newData: IndicesDatabaseSchema = {
        agents: {},
        settings: {
          lastBackup: oldData.settings?.lastBackup || null,
          version: '2.0.0'
        },
        statistics: {
          totalAgents: 0,
          totalTasks: 0,
          totalIndices: 0,
          lastIndexDate: oldData.statistics?.lastIndexDate || new Date().toISOString()
        }
      };
      
      // Group indices by taskId (or create default grouping)
      const taskGroups: { [key: string]: any[] } = {};
      
      for (const index of oldIndices) {
        const taskKey = index.taskId || 'unknown_task';
        if (!taskGroups[taskKey]) {
          taskGroups[taskKey] = [];
        }
        taskGroups[taskKey].push(index);
      }
      
      // Create agents and tasks from grouped data
      for (const [taskKey, indices] of Object.entries(taskGroups)) {
        const firstIndex = indices[0];
        const agentKey = this.extractAgentKeyFromTaskId(taskKey);
        
        // Create agent if it doesn't exist
        if (!newData.agents[agentKey]) {
          newData.agents[agentKey] = {
            agentInfo: {
              name: `Migrated Agent (${firstIndex.source})`,
              type: firstIndex.source === 'pdf_processing' ? 'pdf_processing' : 'indices_creation',
              queueKey: agentKey,
              createdAt: firstIndex.createdAt,
              status: 'completed'
            },
            tasks: {}
          };
          newData.statistics.totalAgents++;
        }
        
        // Create task
        const taskInfo: TaskInfo = {
          id: taskKey,
          type: firstIndex.source === 'pdf_processing' ? 'pdf_processing' : 'quantify',
          filename: firstIndex.filename,
          articleId: firstIndex.articleId,
          status: 'completed',
          createdAt: firstIndex.createdAt,
          timestamp: firstIndex.timestamp
        };
        
        // Convert indices to new format
        const convertedIndices: IndexEntry[] = indices.map(index => ({
          id: index.id,
          indexName: index.indexName,
          scoreValue: index.scoreValue,
          source: index.source,
          quotes: index.quotes || [],
          rational: index.rational
        }));
        
        newData.agents[agentKey].tasks[taskKey] = {
          taskInfo,
          indices: convertedIndices
        };
        
        newData.statistics.totalTasks++;
        newData.statistics.totalIndices += convertedIndices.length;
      }
      
      // Update database with new structure
      this.db.data = newData;
      await this.db.write();
      
      console.log(`[INDICES DATABASE] Migration completed: ${newData.statistics.totalAgents} agents, ${newData.statistics.totalTasks} tasks, ${newData.statistics.totalIndices} indices`);
    } catch (error) {
      console.error('[INDICES DATABASE] Error during migration:', error);
      throw error;
    }
  }
  
  private extractAgentKeyFromTaskId(taskId: string): string {
    // Try to extract agent key from task ID patterns
    if (taskId.includes('indices-quantify-')) {
      return 'indices_creation_agent';
    } else if (taskId.includes('research-')) {
      return 'change_statement_agent';
    } else if (taskId === 'unknown_task') {
      return 'legacy_agent';
    }
    return `agent_${taskId.split('_')[0] || 'unknown'}`;
  }

  // Add index from PDF processing (analysisScores)
  async addPdfProcessingIndex(
    articleId: string,
    filename: string,
    analysisScores: Record<string, number>,
    inferredTimestamp?: string,
    taskId?: string
  ): Promise<void> {
    await this.mutex.acquire();
    
    try {
      await this.ensureInitialized();
      await this.db.read();
      
      const agentKey = 'pdf_processing_agent';
      const actualTaskId = taskId || `pdf_task_${Date.now()}`;
      
      // Ensure agent exists
      if (!this.db.data!.agents[agentKey]) {
        this.db.data!.agents[agentKey] = {
          agentInfo: {
            name: 'PDF Processing Agent',
            type: 'pdf_processing',
            queueKey: agentKey,
            createdAt: new Date().toISOString(),
            status: 'active'
          },
          tasks: {}
        };
        this.db.data!.statistics.totalAgents++;
      }
      
      // Create task if it doesn't exist
      if (!this.db.data!.agents[agentKey].tasks[actualTaskId]) {
        this.db.data!.agents[agentKey].tasks[actualTaskId] = {
          taskInfo: {
            id: actualTaskId,
            type: 'pdf_processing',
            filename,
            articleId,
            status: 'completed',
            createdAt: new Date().toISOString(),
            timestamp: inferredTimestamp
          },
          indices: []
        };
        this.db.data!.statistics.totalTasks++;
      }
      
      // Add indices to task
      const newIndices: IndexEntry[] = Object.entries(analysisScores).map(([indexName, scoreValue]) => ({
        id: `index_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        indexName,
        scoreValue,
        source: 'pdf_processing' as const,
        quotes: [], // PDF processing doesn't provide quotes
        rational: `Auto-generated index from PDF processing for ${indexName}`
      }));
      
      this.db.data!.agents[agentKey].tasks[actualTaskId].indices.push(...newIndices);
      
      // Update statistics
      this.db.data!.statistics.totalIndices += newIndices.length;
      this.db.data!.statistics.lastIndexDate = new Date().toISOString();
      
      await this.db.write();
      console.log(`[INDICES DATABASE] Added ${newIndices.length} PDF processing indices for ${filename}`);
    } finally {
      this.mutex.release();
    }
  }

  // Add index from indices creation agent
  async addIndicesCreationIndex(
    indexName: string,
    scoreValue: number,
    articleId: string,
    filename: string,
    quotes: string[],
    rational: string,
    timestamp?: string,
    taskId?: string
  ): Promise<void> {
    await this.mutex.acquire();
    
    try {
      await this.ensureInitialized();
      await this.db.read();

      const agentKey = this.extractAgentKeyFromTaskId(taskId || 'indices_creation');
      const actualTaskId = taskId || `task_${Date.now()}`;
      
      // Ensure agent exists
      if (!this.db.data!.agents[agentKey]) {
        this.db.data!.agents[agentKey] = {
          agentInfo: {
            name: 'Indices Creation Agent',
            type: 'indices_creation',
            queueKey: agentKey,
            createdAt: new Date().toISOString(),
            status: 'active'
          },
          tasks: {}
        };
        this.db.data!.statistics.totalAgents++;
      }
      
      // Create task if it doesn't exist
      if (!this.db.data!.agents[agentKey].tasks[actualTaskId]) {
        this.db.data!.agents[agentKey].tasks[actualTaskId] = {
          taskInfo: {
            id: actualTaskId,
            type: 'quantify',
            filename,
            articleId,
            status: 'completed',
            createdAt: new Date().toISOString(),
            timestamp
          },
          indices: []
        };
        this.db.data!.statistics.totalTasks++;
      }
      
      // Add index to task
      const newIndex: IndexEntry = {
        id: `index_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        indexName,
        scoreValue,
        source: 'indices_creation' as const,
        quotes,
        rational
      };
      
      this.db.data!.agents[agentKey].tasks[actualTaskId].indices.push(newIndex);
      
      // Update statistics
      this.db.data!.statistics.totalIndices++;
      this.db.data!.statistics.lastIndexDate = new Date().toISOString();
      
      await this.db.write();
      console.log(`[INDICES DATABASE] Added indices creation index: ${indexName} for ${filename}`);
    } finally {
      this.mutex.release();
    }
  }

  // Get all indices (flattened from all agents and tasks)
  async getAllIndices(): Promise<(IndexEntry & { taskInfo: TaskInfo; agentInfo: AgentInfo })[]> {
    await this.ensureInitialized();
    await this.db.read();
    
    const allIndices: (IndexEntry & { taskInfo: TaskInfo; agentInfo: AgentInfo })[] = [];
    
    for (const agent of Object.values(this.db.data!.agents)) {
      for (const task of Object.values(agent.tasks)) {
        for (const index of task.indices) {
          allIndices.push({
            ...index,
            taskInfo: task.taskInfo,
            agentInfo: agent.agentInfo
          });
        }
      }
    }
    
    return allIndices;
  }

  // Get indices by name (flattened from all agents and tasks)
  async getIndicesByName(indexName: string): Promise<(IndexEntry & { taskInfo: TaskInfo; agentInfo: AgentInfo })[]> {
    await this.ensureInitialized();
    await this.db.read();
    
    const matchingIndices: (IndexEntry & { taskInfo: TaskInfo; agentInfo: AgentInfo })[] = [];
    
    for (const agent of Object.values(this.db.data!.agents)) {
      for (const task of Object.values(agent.tasks)) {
        for (const index of task.indices) {
          if (index.indexName === indexName) {
            matchingIndices.push({
              ...index,
              taskInfo: task.taskInfo,
              agentInfo: agent.agentInfo
            });
          }
        }
      }
    }
    
    return matchingIndices;
  }

  // Get unique index names
  async getUniqueIndexNames(): Promise<string[]> {
    await this.ensureInitialized();
    await this.db.read();
    
    const indexNames = new Set<string>();
    
    for (const agent of Object.values(this.db.data!.agents)) {
      for (const task of Object.values(agent.tasks)) {
        for (const index of task.indices) {
          indexNames.add(index.indexName);
        }
      }
    }
    
    return Array.from(indexNames);
  }

  // Get indices by source
  async getIndicesBySource(source: 'pdf_processing' | 'indices_creation'): Promise<(IndexEntry & { taskInfo: TaskInfo; agentInfo: AgentInfo })[]> {
    await this.ensureInitialized();
    await this.db.read();
    
    const matchingIndices: (IndexEntry & { taskInfo: TaskInfo; agentInfo: AgentInfo })[] = [];
    
    for (const agent of Object.values(this.db.data!.agents)) {
      for (const task of Object.values(agent.tasks)) {
        for (const index of task.indices) {
          if (index.source === source) {
            matchingIndices.push({
              ...index,
              taskInfo: task.taskInfo,
              agentInfo: agent.agentInfo
            });
          }
        }
      }
    }
    
    return matchingIndices;
  }

  // Get indices by article ID
  async getIndicesByArticleId(articleId: string): Promise<(IndexEntry & { taskInfo: TaskInfo; agentInfo: AgentInfo })[]> {
    await this.ensureInitialized();
    await this.db.read();
    
    const matchingIndices: (IndexEntry & { taskInfo: TaskInfo; agentInfo: AgentInfo })[] = [];
    
    for (const agent of Object.values(this.db.data!.agents)) {
      for (const task of Object.values(agent.tasks)) {
        if (task.taskInfo.articleId === articleId) {
          for (const index of task.indices) {
            matchingIndices.push({
              ...index,
              taskInfo: task.taskInfo,
              agentInfo: agent.agentInfo
            });
          }
        }
      }
    }
    
    return matchingIndices;
  }

  // Get statistics
  async getStatistics(): Promise<IndicesDatabaseSchema['statistics']> {
    await this.ensureInitialized();
    await this.db.read();
    return this.db.data!.statistics;
  }

  // Get database info
  async getDatabaseInfo(): Promise<{
    totalAgents: number;
    totalTasks: number;
    totalIndices: number;
    uniqueIndexNames: number;
    lastIndexDate: string;
    lastBackup: string | null;
    version: string;
  }> {
    await this.ensureInitialized();
    await this.db.read();
    
    const uniqueIndexNames = await this.getUniqueIndexNames();
    
    return {
      totalAgents: this.db.data!.statistics.totalAgents,
      totalTasks: this.db.data!.statistics.totalTasks,
      totalIndices: this.db.data!.statistics.totalIndices,
      uniqueIndexNames: uniqueIndexNames.length,
      lastIndexDate: this.db.data!.statistics.lastIndexDate,
      lastBackup: this.db.data!.settings.lastBackup,
      version: this.db.data!.settings.version
    };
  }

  // Delete indices by task ID
  async deleteIndicesByTaskId(taskId: string): Promise<number> {
    await this.mutex.acquire();
    
    try {
      await this.ensureInitialized();
      await this.db.read();
      
      let deletedCount = 0;
      
      for (const agent of Object.values(this.db.data!.agents)) {
        if (agent.tasks[taskId]) {
          deletedCount += agent.tasks[taskId].indices.length;
          delete agent.tasks[taskId];
          this.db.data!.statistics.totalTasks--;
        }
      }
      
      if (deletedCount > 0) {
        this.db.data!.statistics.totalIndices -= deletedCount;
        await this.db.write();
        console.log(`[INDICES DATABASE] Deleted ${deletedCount} indices for task ID: ${taskId}`);
      }
      
      return deletedCount;
    } finally {
      this.mutex.release();
    }
  }

  // Delete indices by queue key (agent queue)
  async deleteIndicesByQueueKey(queueKey: string): Promise<number> {
    await this.mutex.acquire();
    
    try {
      await this.ensureInitialized();
      await this.db.read();
      
      let deletedCount = 0;
      
      console.log(`[INDICES DATABASE] Looking for agents to delete with queue key: ${queueKey}`);
      
      // Extract agent type from queue key (e.g., "indices:query" -> "indices")
      const agentType = queueKey.split(':')[0];
      
      // Find matching agents by multiple criteria
      const agentsToDelete: string[] = [];
      
      for (const [agentKey, agent] of Object.entries(this.db.data!.agents)) {
        let shouldDelete = false;
        
        // Method 1: Direct queue key match
        if (agent.agentInfo.queueKey === queueKey) {
          shouldDelete = true;
          console.log(`[INDICES DATABASE] Found agent ${agentKey} with exact queueKey match`);
        }
        
        // Method 2: Agent key contains queue key
        if (agentKey.includes(queueKey)) {
          shouldDelete = true;
          console.log(`[INDICES DATABASE] Found agent ${agentKey} with agentKey containing queueKey`);
        }
        
        // Method 3: Match by agent type and agent naming pattern
        if (agentType && (
          (agentType === 'indices' && agentKey.includes('indices')) ||
          (agentType === 'change_statement' && agentKey.includes('research')) ||
          (agentType === 'indices' && agent.agentInfo.type === 'indices_creation') ||
          (agentType === 'change_statement' && agent.agentInfo.type === 'change_statement')
        )) {
          shouldDelete = true;
          console.log(`[INDICES DATABASE] Found agent ${agentKey} with type-based match (${agentType})`);
        }
        
        if (shouldDelete) {
          agentsToDelete.push(agentKey);
        }
      }
      
      console.log(`[INDICES DATABASE] Found ${agentsToDelete.length} agents to delete: ${agentsToDelete.join(', ')}`);
      
      // Delete the found agents
      for (const agentKey of agentsToDelete) {
        const agent = this.db.data!.agents[agentKey];
        
        // Count all indices in this agent
        for (const task of Object.values(agent.tasks)) {
          deletedCount += task.indices.length;
        }
        
        // Delete the entire agent
        delete this.db.data!.agents[agentKey];
        this.db.data!.statistics.totalAgents--;
        this.db.data!.statistics.totalTasks -= Object.keys(agent.tasks).length;
        
        console.log(`[INDICES DATABASE] Deleted agent ${agentKey} with ${Object.keys(agent.tasks).length} tasks`);
      }
      
      if (deletedCount > 0) {
        this.db.data!.statistics.totalIndices -= deletedCount;
        await this.db.write();
        console.log(`[INDICES DATABASE] Successfully deleted ${deletedCount} indices for queue key: ${queueKey}`);
      } else {
        console.warn(`[INDICES DATABASE] No indices found to delete for queue key: ${queueKey}`);
      }
      
      return deletedCount;
    } finally {
      this.mutex.release();
    }
  }

  // Delete index by ID
  async deleteIndexById(id: string): Promise<boolean> {
    await this.mutex.acquire();
    
    try {
      await this.ensureInitialized();
      await this.db.read();
      
      for (const agent of Object.values(this.db.data!.agents)) {
        for (const task of Object.values(agent.tasks)) {
          const indexIndex = task.indices.findIndex(index => index.id === id);
          if (indexIndex !== -1) {
            task.indices.splice(indexIndex, 1);
            this.db.data!.statistics.totalIndices--;
            await this.db.write();
            console.log(`[INDICES DATABASE] Deleted index with ID: ${id}`);
            return true;
          }
        }
      }
      
      return false;
    } finally {
      this.mutex.release();
    }
  }

  // Reset database
  async resetDatabase(): Promise<void> {
    await this.mutex.acquire();
    
    try {
      this.db.data = {
        agents: {},
        settings: {
          lastBackup: null,
          version: '2.0.0'
        },
        statistics: {
          totalAgents: 0,
          totalTasks: 0,
          totalIndices: 0,
          lastIndexDate: new Date().toISOString()
        }
      };
      
      await this.db.write();
      console.log('[INDICES DATABASE] Database reset completed');
    } finally {
      this.mutex.release();
    }
  }

  // New methods for the nested structure

  // Get all agents
  async getAllAgents(): Promise<AgentWithTasks[]> {
    await this.ensureInitialized();
    await this.db.read();
    return Object.values(this.db.data!.agents);
  }

  // Get agent by key
  async getAgentByKey(agentKey: string): Promise<AgentWithTasks | undefined> {
    await this.ensureInitialized();
    await this.db.read();
    return this.db.data!.agents[agentKey];
  }

  // Get task by agent and task ID
  async getTaskByIds(agentKey: string, taskId: string): Promise<TaskWithIndices | undefined> {
    await this.ensureInitialized();
    await this.db.read();
    return this.db.data!.agents[agentKey]?.tasks[taskId];
  }

  // Update agent status
  async updateAgentStatus(agentKey: string, status: string): Promise<boolean> {
    await this.mutex.acquire();
    
    try {
      await this.ensureInitialized();
      await this.db.read();
      
      if (this.db.data!.agents[agentKey]) {
        this.db.data!.agents[agentKey].agentInfo.status = status;
        await this.db.write();
        return true;
      }
      
      return false;
    } finally {
      this.mutex.release();
    }
  }

  // Update task status
  async updateTaskStatus(agentKey: string, taskId: string, status: string): Promise<boolean> {
    await this.mutex.acquire();
    
    try {
      await this.ensureInitialized();
      await this.db.read();
      
      if (this.db.data!.agents[agentKey]?.tasks[taskId]) {
        this.db.data!.agents[agentKey].tasks[taskId].taskInfo.status = status;
        await this.db.write();
        return true;
      }
      
      return false;
    } finally {
      this.mutex.release();
    }
  }

  // Cleanup empty tasks (tasks with no indices)
  async cleanupEmptyTasks(): Promise<{ removedTasks: number; removedAgents: number; message: string }> {
    await this.mutex.acquire();
    
    try {
      await this.ensureInitialized();
      await this.db.read();
      
      let removedTasks = 0;
      let removedAgents = 0;
      const agentsToRemove: string[] = [];
      
      console.log('[INDICES DATABASE] Starting cleanup of empty tasks...');
      
      // Find and remove tasks with empty indices arrays
      for (const [agentKey, agent] of Object.entries(this.db.data!.agents)) {
        const tasksToRemove: string[] = [];
        
        for (const [taskId, task] of Object.entries(agent.tasks)) {
          if (task.indices.length === 0) {
            tasksToRemove.push(taskId);
            console.log(`[INDICES DATABASE] Marking task ${taskId} for removal (empty indices)`);
          }
        }
        
        // Remove empty tasks
        for (const taskId of tasksToRemove) {
          delete agent.tasks[taskId];
          removedTasks++;
          this.db.data!.statistics.totalTasks--;
        }
        
        // If agent has no tasks left, mark it for removal
        if (Object.keys(agent.tasks).length === 0) {
          agentsToRemove.push(agentKey);
          console.log(`[INDICES DATABASE] Marking agent ${agentKey} for removal (no tasks left)`);
        }
      }
      
      // Remove agents with no tasks
      for (const agentKey of agentsToRemove) {
        delete this.db.data!.agents[agentKey];
        removedAgents++;
        this.db.data!.statistics.totalAgents--;
      }
      
      // Save changes
      await this.db.write();
      
      const message = `Cleanup completed: removed ${removedTasks} empty tasks and ${removedAgents} empty agents`;
      console.log(`[INDICES DATABASE] ${message}`);
      
      return {
        removedTasks,
        removedAgents,
        message
      };
      
    } finally {
      this.mutex.release();
    }
  }
} 