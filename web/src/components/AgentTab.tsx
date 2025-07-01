import React, { useState, useEffect } from 'react';
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Clock, CheckCircle2, AlertCircle, Eye, Loader2, RefreshCw, Sparkles, Play, Trash2, Plus } from 'lucide-react';
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
  payload: any;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  resultPath?: string;
  result?: any;
  error?: string;
}

interface AgentQueue {
  queueKey: string;
  tasks: AgentTask[];
  agentType: string;
  userQuery: string;
  createdAt: string;
}

interface AgentTabProps {
  uploadedFiles: File[];
}

const API_BASE_URL = getApiBaseUrl();

const AgentTab = ({ uploadedFiles }: AgentTabProps) => {
  const [agentQueues, setAgentQueues] = useState<AgentQueue[]>([]);
  const [loading, setLoading] = useState(false);
  const [agentDialogOpen, setAgentDialogOpen] = useState(false);
  const [selectedAgentType, setSelectedAgentType] = useState<'indices' | 'deep_research' | null>(null);
  const [agentQuery, setAgentQuery] = useState('');
  const [agentLoading, setAgentLoading] = useState(false);
  const [selectedQueue, setSelectedQueue] = useState<AgentQueue | null>(null);

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
      
      // For now, we'll use localStorage since queues are in-memory on backend
      // In a real implementation, you'd fetch from an API endpoint
      const storedQueues = localStorage.getItem('agentQueues');
      if (storedQueues) {
        const queues = JSON.parse(storedQueues);
        setAgentQueues(queues);
        
        // Fetch detailed task information for each queue
        for (const queue of queues) {
          try {
            const response = await fetch(`${API_BASE_URL}/agent/queue/${queue.queueKey}`);
            if (response.ok) {
              const data = await response.json();
              setAgentQueues(prev => prev.map(q => 
                q.queueKey === queue.queueKey ? { ...q, tasks: data.tasks } : q
              ));
            }
          } catch (error) {
            console.error(`Error fetching queue ${queue.queueKey}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching agent queues:', error);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  const initiateAgent = async () => {
    if (!selectedAgentType || !agentQuery.trim()) return;
    
    setAgentLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/agent/initiate`, {
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
        throw new Error('Failed to initiate agent');
      }

      const data = await response.json();
      
      // Create new queue
      const newQueue: AgentQueue = {
        queueKey: data.queueKey,
        tasks: [],
        agentType: selectedAgentType,
        userQuery: agentQuery,
        createdAt: new Date().toISOString()
      };
      
      setAgentQueues(prev => [newQueue, ...prev]);
      localStorage.setItem('agentQueues', JSON.stringify([newQueue, ...agentQueues]));
      
      // Close dialog
      setAgentDialogOpen(false);
      setSelectedAgentType(null);
      setAgentQuery('');
      
    } catch (error) {
      console.error('Agent initiation error:', error);
      alert('Failed to start agent. Please try again.');
    } finally {
      setAgentLoading(false);
    }
  };

  const processNextTask = async (queueKey: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/agent/process-next/${queueKey}`, {
        method: 'POST'
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('Task processed:', data);
        
        // Refresh queue
        await fetchAgentQueues(false);
      }
    } catch (error) {
      console.error('Error processing next task:', error);
    }
  };

  const deleteQueue = (queueKey: string) => {
    setAgentQueues(prev => prev.filter(q => q.queueKey !== queueKey));
    localStorage.setItem('agentQueues', JSON.stringify(agentQueues.filter(q => q.queueKey !== queueKey)));
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
      default:
        return <Clock className="w-4 h-4 text-slate-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'processing':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'failed':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  const getAgentTypeDisplay = (agentType: string) => {
    switch (agentType) {
      case 'indices':
        return 'Indices Creation';
      case 'deep_research':
        return 'Deep Research';
      default:
        return agentType;
    }
  };

  const getTaskTypeDisplay = (taskType: string) => {
    switch (taskType) {
      case 'comparison':
        return 'Comparison Analysis';
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

  const getQueueProgress = (queue: AgentQueue) => {
    const total = queue.tasks.length;
    const completed = queue.tasks.filter(t => t.status === 'completed').length;
    const failed = queue.tasks.filter(t => t.status === 'failed').length;
    const processing = queue.tasks.filter(t => t.status === 'processing').length;
    
    return { total, completed, failed, processing };
  };

  const getQueueStatus = (queue: AgentQueue) => {
    const { total, completed, failed } = getQueueProgress(queue);
    
    if (failed > 0 && completed + failed === total) {
      return 'failed';
    } else if (completed === total) {
      return 'completed';
    } else if (completed + failed < total) {
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

  // Show empty state when there are no agent queues
  if (agentQueues.length === 0 && !loading) {
    return (
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
    );
  }

  return (
    <div className="h-full p-6">
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
            const progress = getQueueProgress(queue);
            const queueStatus = getQueueStatus(queue);
            
            return (
              <Card key={queue.queueKey} className="p-4 hover:shadow-md transition-all">
                {/* Queue Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <Sparkles className="w-5 h-5 text-purple-500" />
                    <div>
                      <h4 className="font-medium text-slate-900">
                        {getAgentTypeDisplay(queue.agentType)}
                      </h4>
                      <p className="text-sm text-slate-500">
                        Query: "{queue.userQuery}"
                      </p>
                      <p className="text-xs text-slate-400">
                        Created {formatDate(queue.createdAt)}
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
                {progress.total > 0 && (
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-slate-600 mb-1">
                      <span>Progress: {progress.completed}/{progress.total} completed</span>
                      <span>{Math.round((progress.completed / progress.total) * 100)}%</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2">
                      <div 
                        className="bg-green-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(progress.completed / progress.total) * 100}%` }}
                      ></div>
                    </div>
                    {progress.failed > 0 && (
                      <div className="flex justify-between text-xs text-red-600 mt-1">
                        <span>{progress.failed} failed</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Task List */}
                <div className="space-y-2">
                  {queue.tasks.map((task) => (
                    <div key={task.id} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                      <div className="flex items-center space-x-2">
                        {getStatusIcon(task.status)}
                        <span className="text-sm font-medium">
                          {getTaskTypeDisplay(task.type)}
                        </span>
                        {task.payload.filename && (
                          <span className="text-xs text-slate-500">
                            ({task.payload.filename})
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={getStatusColor(task.status)}>
                          <span className="capitalize">{task.status}</span>
                        </Badge>
                        {task.status === 'pending' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => processNextTask(queue.queueKey)}
                            className="h-6 px-2 text-xs"
                          >
                            <Play className="w-3 h-3 mr-1" />
                            Process
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Queue Actions */}
                <div className="mt-3 pt-3 border-t border-slate-200">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">
                      Queue ID: {queue.queueKey}
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
                  variant={selectedAgentType === 'deep_research' ? 'default' : 'outline'}
                  onClick={() => setSelectedAgentType('deep_research')}
                  className="flex-1"
                >
                  Deep Research
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
                onClick={initiateAgent} 
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
              <DialogTitle>Queue Details: {getAgentTypeDisplay(selectedQueue.agentType)}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Query</Label>
                <p className="text-sm text-slate-600 mt-1">{selectedQueue.userQuery}</p>
              </div>
              <div>
                <Label className="text-sm font-medium">Tasks</Label>
                <div className="space-y-2 mt-2">
                  {selectedQueue.tasks.map((task) => (
                    <div key={task.id} className="p-3 border border-slate-200 rounded">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">{getTaskTypeDisplay(task.type)}</span>
                        <Badge variant="outline" className={getStatusColor(task.status)}>
                          {getStatusIcon(task.status)}
                          <span className="ml-1 capitalize">{task.status}</span>
                        </Badge>
                      </div>
                      {task.payload.filename && (
                        <p className="text-sm text-slate-600">File: {task.payload.filename}</p>
                      )}
                      {task.error && (
                        <p className="text-sm text-red-600 mt-1">Error: {task.error}</p>
                      )}
                      {task.result && (
                        <div className="mt-2 p-2 bg-green-50 rounded">
                          <p className="text-sm text-green-800">Task completed successfully</p>
                        </div>
                      )}
                    </div>
                  ))}
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