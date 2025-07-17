import React, { useState, useEffect } from 'react';
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Clock, CheckCircle2, AlertCircle, Eye, Loader2, RefreshCw, Sparkles, Play, Trash2, Plus, ChevronDown, ChevronRight } from 'lucide-react';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getApiBaseUrl } from "@/lib/utils";
import { cn } from '@/lib/utils';

interface AgentTask {
  id: string;
  type: string;
  payload?: any;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  metadata?: Record<string, any>;
  resultPath?: string;
  result?: any;
  error?: string;
}

interface QueueInfo {
  id: string;
  name: string;
  type: string;
  status: 'active' | 'paused' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
}

interface AgentQueue {
  queueKey: string;
  queueInfo: QueueInfo;
  tasks: AgentTask[];
  taskCount: number;
  pendingTasks: number;
  completedTasks: number;
  failedTasks: number;
}

interface AgentTabProps {
  uploadedFiles: File[];
}

const API_BASE_URL = getApiBaseUrl();

const AgentTab = ({ uploadedFiles }: AgentTabProps) => {
  const [agentQueues, setAgentQueues] = useState<AgentQueue[]>([]);
  const [loading, setLoading] = useState(false);
  const [agentDialogOpen, setAgentDialogOpen] = useState(false);
  const [selectedAgentType, setSelectedAgentType] = useState<'indices' | 'change_statement' | null>(null);
  const [agentQuery, setAgentQuery] = useState('');
  const [agentLoading, setAgentLoading] = useState(false);
  const [selectedQueue, setSelectedQueue] = useState<AgentQueue | null>(null);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Record<string, boolean>>({});

  // Fetch agent queues on component mount and auto-refresh every 3 seconds
  useEffect(() => {
    fetchAgentQueues();
    const interval = setInterval(() => {
      fetchAgentQueues(false);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const fetchAgentQueues = async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      
      const response = await fetch(`${API_BASE_URL}/agent/queue`);
      if (!response.ok) {
        throw new Error('Failed to fetch agent queues');
      }
      
      const data = await response.json();
      
      // Handle both the success case and error case with fallback
      if (data.queues && Array.isArray(data.queues)) {
        setAgentQueues(data.queues);
      } else {
        console.warn('Invalid queue data structure:', data);
        setAgentQueues([]);
      }
      
    } catch (error) {
      console.error('Error fetching agent queues:', error);
      setAgentQueues([]);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  const startAgent = async () => {
    if (!selectedAgentType || !agentQuery.trim()) return;
    
    setAgentLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/agent/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          agentType: selectedAgentType,
          userQuery: agentQuery
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to start agent');
      }

      const data = await response.json();
      console.log('Agent started:', data);
      
      // Refresh queues to show the new one
      await fetchAgentQueues(false);
      
      // Close dialog
      setAgentDialogOpen(false);
      setSelectedAgentType(null);
      setAgentQuery('');
      
    } catch (error) {
      console.error('Agent start error:', error);
      alert(`Failed to start agent: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setAgentLoading(false);
    }
  };



  const deleteQueue = async (queueKey: string) => {
    if (!confirm('Are you sure you want to delete this agent queue? This will remove all tasks, data, and related indices from the system.')) {
      return;
    }

    try {
      console.log(`[AGENT TAB] Starting deletion of queue: ${queueKey}`);
      
      const response = await fetch(`${API_BASE_URL}/agent/queue/${queueKey}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('Queue deleted successfully:', data);
        
        // Show success message with details
        const message = `Successfully deleted agent queue!\n\n` +
          `- Queue: ${queueKey}\n` +
          `- Tasks deleted: ${data.deletedTasks}\n` +
          `- Indices deleted: ${data.deletedIndices}\n` +
          `- Memory snapshots deleted: ${data.deletedMemorySnapshots}\n` +
          `- Queue removed from database: ${data.queueDeletedFromDatabase ? 'Yes' : 'No'}`;
        
        alert(message);
        
        // Refresh queues
        await fetchAgentQueues(false);
      } else {
        const errorData = await response.json();
        console.error('Failed to delete queue:', errorData);
        alert(`Failed to delete agent queue: ${errorData.error || 'Unknown error'}\n\nDetails: ${errorData.details || 'No additional details'}`);
      }
    } catch (error) {
      console.error('Error deleting queue:', error);
      alert('Failed to delete agent queue. Please check your connection and try again.');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'processing':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'active':
        return <Play className="w-4 h-4 text-blue-500" />;
      default:
        return <Clock className="w-4 h-4 text-slate-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'processing':
      case 'active':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'failed':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'pending':
      case 'paused':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  const getAgentTypeDisplay = (agentType: string) => {
    switch (agentType) {
      case 'indices':
        return 'Indices Creation';
      case 'change_statement':
        return 'Change of Statement';
      default:
        return agentType;
    }
  };

  const getTaskTypeDisplay = (taskType: string) => {
    switch (taskType) {
      case 'quantify':
        return 'Quantify Analysis';
      case 'research':
        return 'Research Summary';
      case 'writing':
        return 'Article Writing';
      default:
        return taskType;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getQueueStatus = (queue: AgentQueue) => {
    // Use queue info status if available, otherwise derive from tasks
    if (queue.queueInfo?.status) {
      return queue.queueInfo.status;
    }

    if (queue.failedTasks > 0 && queue.completedTasks + queue.failedTasks === queue.taskCount) {
      return 'failed';
    } else if (queue.completedTasks === queue.taskCount && queue.taskCount > 0) {
      return 'completed';
    } else if (queue.completedTasks + queue.failedTasks < queue.taskCount) {
      return 'processing';
    } else {
      return 'pending';
    }
  };

  // Add a simple stepper component for workflow visualization
  const WorkflowStepper = ({ tasks }: { tasks: AgentTask[] }) => {
    if (!tasks || tasks.length === 0) return null;
    return (
      <div className="flex items-center justify-start mb-4 overflow-x-auto">
        {tasks.map((task, idx) => {
          const isLast = idx === tasks.length - 1;
          const statusIcon = (() => {
            switch (task.status) {
              case 'completed':
                return <CheckCircle2 className="w-5 h-5 text-green-500" />;
              case 'processing':
                return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
              case 'failed':
                return <AlertCircle className="w-5 h-5 text-red-500" />;
              case 'pending':
              default:
                return <Clock className="w-5 h-5 text-yellow-500" />;
            }
          })();
          return (
            <div key={task.id} className="flex items-center">
              <div className="flex flex-col items-center">
                <div className={
                  cn(
                    "rounded-full border-2 flex items-center justify-center",
                    task.status === 'completed' ? 'border-green-500 bg-green-50' :
                    task.status === 'processing' ? 'border-blue-500 bg-blue-50' :
                    task.status === 'failed' ? 'border-red-500 bg-red-50' :
                    'border-yellow-500 bg-yellow-50',
                    'w-8 h-8 mb-1'
                  )
                }>
                  {statusIcon}
                </div>
                <span className="text-xs text-slate-700 whitespace-nowrap">
                  {task.type.charAt(0).toUpperCase() + task.type.slice(1)}
                </span>
              </div>
              {!isLast && (
                <div className="w-8 h-1 bg-slate-300 mx-1 rounded-full" />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // Helper to toggle expanded state
  const toggleTaskExpand = (taskId: string) => {
    setExpandedTaskIds(prev => ({ ...prev, [taskId]: !prev[taskId] }));
  };

  // Helper to render task details
  const renderTaskDetails = (task: AgentTask) => {
    const result = task.result || {};
    // Determine what to show based on task type
    let mainValue = null;
    let mainLabel = '';
    if (task.type === 'quantify') {
      mainValue = result.score_value ?? result.scoreValue ?? result.score ?? result.score_name ?? result.scoreName ?? null;
      mainLabel = 'Score';
    } else if (task.type === 'research') {
      mainValue = result.answer ?? result.summary ?? null;
      mainLabel = 'Statement';
    }
    const quotes = result.quotes || [];
    const rational = result.rational || result.rationale || null;
    const differences = result.differences || result.key_differences || [];
    return (
      <div className="mt-2 p-2 bg-slate-50 rounded text-xs text-slate-700">
        {mainValue && (
          <div className="mb-1"><span className="font-semibold">{mainLabel}:</span> {mainValue}</div>
        )}
        {quotes && quotes.length > 0 && (
          <div className="mb-1">
            <span className="font-semibold">Quotes:</span>
            <ul className="list-disc ml-5 mt-1">
              {quotes.map((ev: string, idx: number) => (
                <li key={idx}>{ev}</li>
              ))}
            </ul>
          </div>
        )}
        {differences && differences.length > 0 && (
          <div className="mb-1">
            <span className="font-semibold">Differences:</span>
            {differences.every((diff: any) => typeof diff === 'object' && diff.last !== undefined && diff.current !== undefined) ? (
              <div className="mt-1 overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-slate-300 px-2 py-1 text-left font-medium">Last</th>
                      <th className="border border-slate-300 px-2 py-1 text-left font-medium">Current</th>
                    </tr>
                  </thead>
                  <tbody>
                    {differences.map((diff: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="border border-slate-300 px-2 py-1 bg-red-50 text-red-800">{diff.last}</td>
                        <td className="border border-slate-300 px-2 py-1 bg-green-50 text-green-800">{diff.current}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <ul className="list-disc ml-5 mt-1">
                {differences.map((diff: any, idx: number) => (
                  <li key={idx}>
                    {typeof diff === 'string' ? diff : JSON.stringify(diff)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {rational && (
          <div><span className="font-semibold">Rational:</span> {rational}</div>
        )}
      </div>
    );
  };

  // Add this function to handle restart
  const handleRestartFromTask = async (queueKey: string, taskId: string) => {
    if (!window.confirm('Are you sure you want to restart the queue from this task? All subsequent tasks will be reset.')) return;
    try {
      const response = await fetch(`${API_BASE_URL}/agent/queue/${queueKey}/restart/${taskId}`, {
        method: 'POST',
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to restart queue');
      }
      alert('Queue restarted from this task.');
      await fetchAgentQueues(false);
    } catch (error) {
      alert('Failed to restart queue: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  // Show empty state when there are no agent queues
  const showEmptyState = agentQueues.length === 0 && !loading;

  return (
    <div className="h-full p-6">
      {showEmptyState ? (
        <div className="h-full flex items-center justify-center p-8">
          <div className="text-center">
            <Sparkles className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-600 mb-2">No Agent Queues</h3>
            <p className="text-slate-500 mb-4">Start an agent to analyze your documents</p>
            <Button onClick={() => setAgentDialogOpen(true)} className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Start Agent
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-6 flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">Agent Task Queues</h3>
              <p className="text-sm text-slate-600">
                Monitor and manage your AI agent processing queues
              </p>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => fetchAgentQueues(true)}
                disabled={loading}
              >
                <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button 
                size="sm" 
                onClick={() => setAgentDialogOpen(true)}
                className="flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                New Agent
              </Button>
            </div>
          </div>

          <ScrollArea className="h-[calc(100%-120px)]">
            <div className="space-y-4">
              {agentQueues.map((queue) => {
            const queueStatus = getQueueStatus(queue);
            
            return (
              <Card key={queue.queueKey} className="p-4 hover:shadow-md transition-all">
                {/* Queue Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <Sparkles className="w-5 h-5 text-purple-500" />
                    <div>
                      <h4 className="font-medium text-slate-900">
                        {queue.queueInfo?.name || getAgentTypeDisplay(queue.queueInfo?.type || 'unknown')}
                      </h4>
                      <p className="text-sm text-slate-500">
                        Queue: {queue.queueKey}
                      </p>
                      <p className="text-xs text-slate-400">
                        Created {queue.queueInfo?.createdAt ? formatDate(queue.queueInfo.createdAt) : 'Unknown'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={getStatusColor(queueStatus)}>
                      {getStatusIcon(queueStatus)}
                      <span className="ml-1 capitalize">{queueStatus}</span>
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteQueue(queue.queueKey)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Workflow Stepper */}
                <WorkflowStepper tasks={queue.tasks} />

                {/* Progress Bar (only if there are tasks) */}
                {queue.taskCount > 0 && (
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-slate-600 mb-1">
                      <span>Progress: {queue.completedTasks}/{queue.taskCount} completed</span>
                      <span>{Math.round((queue.completedTasks / queue.taskCount) * 100)}%</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2">
                      <div 
                        className="bg-green-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(queue.completedTasks / queue.taskCount) * 100}%` }}
                      ></div>
                    </div>
                    {queue.failedTasks > 0 && (
                      <div className="flex justify-between text-xs text-red-600 mt-1">
                        <span>{queue.failedTasks} failed</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Task List */}
                <div className="space-y-2">
                  {queue.tasks.map((task) => {
                    const expanded = !!expandedTaskIds[task.id];
                    return (
                      <div key={task.id} className="flex flex-col bg-slate-50 rounded">
                        <div className="flex items-center justify-between p-2">
                          <div className="flex items-center space-x-2">
                            <button
                              className="focus:outline-none"
                              onClick={() => toggleTaskExpand(task.id)}
                              aria-label={expanded ? 'Collapse details' : 'Expand details'}
                            >
                              {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </button>
                            {getStatusIcon(task.status)}
                            <span className="text-sm font-medium">
                              {getTaskTypeDisplay(task.type)}
                            </span>
                            {task.payload?.filename && (
                              <span className="text-xs text-slate-500">
                                ({task.payload.filename})
                              </span>
                            )}
                            {task.metadata?.filename && (
                              <span className="text-xs text-slate-500">
                                ({task.metadata.filename})
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={getStatusColor(task.status)}>
                              <span className="capitalize">{task.status}</span>
                            </Badge>

                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRestartFromTask(queue.queueKey, task.id)}
                              className="h-6 px-2 text-xs text-blue-600 border-blue-300 hover:bg-blue-50"
                              title="Restart the queue from this task"
                            >
                              Restart from here
                            </Button>
                          </div>
                        </div>
                        {expanded && renderTaskDetails(task)}
                      </div>
                    );
                  })}
                </div>

                {/* Queue Actions */}
                <div className="mt-3 pt-3 border-t border-slate-200">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">
                      Tasks: {queue.taskCount} total, {queue.pendingTasks} pending
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedQueue(queue)}
                      className="text-xs"
                    >
                      <Eye className="w-3 h-3 mr-1" />
                      View Details
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
            </div>
          </ScrollArea>
        </>
      )}

      {/* Agent Creation Dialog */}
      <Dialog open={agentDialogOpen} onOpenChange={setAgentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start New Agent</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Agent Type</Label>
              <div className="flex gap-2 mt-2">
                <Button
                  variant={selectedAgentType === 'indices' ? 'default' : 'outline'}
                  onClick={() => setSelectedAgentType('indices')}
                  className="flex-1"
                >
                  Indices Creation
                </Button>
                <Button
                  variant={selectedAgentType === 'change_statement' ? 'default' : 'outline'}
                  onClick={() => setSelectedAgentType('change_statement')}
                  className="flex-1"
                >
                  Change of Statement
                </Button>
              </div>
            </div>
            <div>
              <Label htmlFor="agent-query">Query/Question</Label>
              <Textarea
                id="agent-query"
                value={agentQuery}
                onChange={(e) => setAgentQuery(e.target.value)}
                placeholder="Enter your question or query for the agent..."
                className="mt-1"
                rows={3}
              />
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setAgentDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={startAgent} 
                disabled={!selectedAgentType || !agentQuery.trim() || agentLoading}
              >
                {agentLoading ? 'Starting...' : 'Start Agent'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Queue Details Dialog */}
      {selectedQueue && (
        <Dialog open={!!selectedQueue} onOpenChange={() => setSelectedQueue(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Queue Details: {selectedQueue.queueInfo?.name || 'Unknown Queue'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Queue Information</Label>
                <div className="mt-2 p-3 bg-slate-50 rounded">
                  <p className="text-sm"><strong>ID:</strong> {selectedQueue.queueInfo?.id}</p>
                  <p className="text-sm"><strong>Type:</strong> {selectedQueue.queueInfo?.type}</p>
                  <p className="text-sm"><strong>Status:</strong> {selectedQueue.queueInfo?.status}</p>
                  <p className="text-sm"><strong>Created:</strong> {selectedQueue.queueInfo?.createdAt ? formatDate(selectedQueue.queueInfo.createdAt) : 'Unknown'}</p>
                  <p className="text-sm"><strong>Updated:</strong> {selectedQueue.queueInfo?.updatedAt ? formatDate(selectedQueue.queueInfo.updatedAt) : 'Unknown'}</p>
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium">Tasks ({selectedQueue.taskCount})</Label>
                <div className="space-y-2 mt-2">
                  {selectedQueue.tasks.map((task) => {
                    const expanded = !!expandedTaskIds[task.id];
                    return (
                      <div key={task.id} className="p-3 border border-slate-200 rounded mb-2">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <button
                              className="focus:outline-none"
                              onClick={() => toggleTaskExpand(task.id)}
                              aria-label={expanded ? 'Collapse details' : 'Expand details'}
                            >
                              {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </button>
                            <span className="font-medium">{getTaskTypeDisplay(task.type)}</span>
                          </div>
                          <Badge variant="outline" className={getStatusColor(task.status)}>
                            {getStatusIcon(task.status)}
                            <span className="ml-1 capitalize">{task.status}</span>
                          </Badge>
                        </div>
                        <p className="text-sm text-slate-600">ID: {task.id}</p>
                        {(task.payload?.filename || task.metadata?.filename) && (
                          <p className="text-sm text-slate-600">
                            File: {task.payload?.filename || task.metadata?.filename}
                          </p>
                        )}
                        {task.error && (
                          <p className="text-sm text-red-600 mt-1">Error: {task.error}</p>
                        )}
                        {task.result && (
                          <div className="mt-2 p-2 bg-green-50 rounded">
                            <p className="text-sm text-green-800">Task completed successfully</p>
                          </div>
                        )}
                        {expanded && renderTaskDetails(task)}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default AgentTab; 