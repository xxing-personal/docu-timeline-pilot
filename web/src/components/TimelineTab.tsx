import React, { useState, useEffect } from 'react';
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Clock, CheckCircle2, AlertCircle, Eye, Loader2, RefreshCw, GripVertical } from 'lucide-react';
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getApiBaseUrl } from "@/lib/utils";

interface PdfTask {
  id: string;
  filename: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  hasResult?: boolean;
  summary?: string;
  pageCount?: number;
  fileSize?: number;
  displayOrder?: number;
  result?: {
    summary: string;
    extractedTextPath: string;
    pageCount: number;
    fileSize: number;
    metadata: any;
  };
}

interface TasksResponse {
  tasks: PdfTask[];
  queueStats: any;
  taskStats: any;
}

interface TimelineTabProps {
  uploadedFiles: File[];
  selectedPdf: string | null;
  setSelectedPdf: (pdf: string | null) => void;
  switchToViewerTab: () => void;
}

const API_BASE_URL = getApiBaseUrl();

// Sortable task item component
interface SortableTaskItemProps {
  task: PdfTask;
  isSelected: boolean;
  onSelect: (filename: string) => void;
  formatDate: (dateString: string) => string;
  getStatusIcon: (status: string) => JSX.Element;
  getStatusColor: (status: string) => string;
  getProcessingEvents: (task: PdfTask) => any[];
  switchToViewerTab: () => void;
}

const SortableTaskItem = ({ 
  task, 
  isSelected, 
  onSelect, 
  formatDate, 
  getStatusIcon, 
  getStatusColor, 
  getProcessingEvents,
  switchToViewerTab
}: SortableTaskItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const events = getProcessingEvents(task);
  const canReorder = task.status === 'completed'; // Only allow reordering of completed tasks

  // Parse structured summary for completed tasks
  const parseStructuredSummary = (summary: string) => {
    const lines = summary.split('\n');
    const result: {
      oneSentenceSummary?: string;
      bulletPoints?: string[];
      confidenceIndex?: string;
      sentimentIndex?: string;
    } = {};

    let currentSection = '';
    let bulletPoints: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const trimmedLine = lines[i].trim();
      if (trimmedLine.startsWith('ONE_SENTENCE_SUMMARY:')) {
        let value = trimmedLine.replace('ONE_SENTENCE_SUMMARY:', '').trim();
        if (value) {
          result.oneSentenceSummary = value;
        } else if (i + 1 < lines.length) {
          result.oneSentenceSummary = lines[i + 1].trim();
        }
      } else if (trimmedLine.startsWith('BULLET_POINTS:')) {
        currentSection = 'bulletPoints';
        bulletPoints = [];
      } else if (trimmedLine.startsWith('CONFIDENCE_INDEX:')) {
        result.confidenceIndex = trimmedLine.replace('CONFIDENCE_INDEX:', '').trim();
        currentSection = '';
      } else if (trimmedLine.startsWith('SENTIMENT_INDEX:')) {
        result.sentimentIndex = trimmedLine.replace('SENTIMENT_INDEX:', '').trim();
        currentSection = '';
      } else if (currentSection === 'bulletPoints' && trimmedLine.startsWith('•')) {
        bulletPoints.push(trimmedLine.replace('•', '').trim());
      }
    }

    result.bulletPoints = bulletPoints;
    return result;
  };

  const summaryData = task.status === 'completed' && task.result?.summary 
    ? parseStructuredSummary(task.result.summary)
    : null;

  // Debug logging
  if (task.status === 'completed') {
    console.log(`Task ${task.id} (${task.filename}):`, {
      hasResult: !!task.result,
      hasSummary: !!task.result?.summary,
      summaryLength: task.result?.summary?.length,
      parsedSummary: summaryData,
      inferredTimestamp: task.result?.metadata?.inferredTimestamp
    });
  }

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {/* Timeline Node */}
      <div className={`absolute left-6 w-4 h-4 rounded-full border-2 bg-white ${
        isSelected ? 'border-blue-500' : 'border-slate-300'
      }`}>
        <div className={`absolute inset-1 rounded-full ${
          task.status === 'completed' ? 'bg-green-500' :
          task.status === 'processing' ? 'bg-blue-500' :
          task.status === 'failed' ? 'bg-red-500' :
          'bg-yellow-500'
        }`}></div>
      </div>
      
      {/* Document Card */}
      <Card className={`ml-16 p-4 hover:shadow-md transition-all ${
        isSelected ? 'ring-2 ring-blue-500 bg-blue-50' : ''
      } ${isDragging ? 'shadow-lg' : ''}`}>
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center space-x-3">
            {canReorder && (
              <div 
                className="cursor-grab active:cursor-grabbing p-1 hover:bg-slate-100 rounded"
                {...attributes}
                {...listeners}
              >
                <GripVertical className="w-4 h-4 text-slate-400" />
              </div>
            )}
            <FileText className="w-5 h-5 text-red-500" />
            <div>
              <h4 className="font-medium text-slate-900">{task.filename}</h4>
              <p className="text-sm text-slate-500">
                Uploaded {formatDate(task.createdAt)}
              </p>
            </div>
          </div>
          <Badge variant="outline" className={getStatusColor(task.status)}>
            {getStatusIcon(task.status)}
            <span className="ml-1 capitalize">{task.status}</span>
          </Badge>
        </div>
        
        {/* Processing Events for non-completed tasks */}
        {task.status !== 'completed' && (
          <div className="space-y-2 mb-3">
            {events.map((event, index) => (
              <div key={index} className={`flex items-center space-x-2 text-sm ${
                event.completed ? 'text-slate-600' : 'text-slate-500'
              }`}>
                {event.icon}
                <span>{event.text}</span>
              </div>
            ))}
          </div>
        )}

        {/* Processed and Inferred timestamp in the same line */}
        {(task.completedAt || task.result?.metadata?.inferredTimestamp) && (
          <div className="flex flex-row gap-4 items-center mb-2">
            {task.completedAt && (
              <div className="text-sm text-slate-600 bg-slate-50 p-2 rounded">
                <span className="font-medium">Processed:</span> {formatDate(task.completedAt)}
              </div>
            )}
            {task.result?.metadata?.inferredTimestamp && (
              <div className="text-sm text-slate-600 bg-purple-50 p-2 rounded border-l-4 border-purple-400">
                <span className="font-medium">Document Date:</span> {formatDate(task.result.metadata.inferredTimestamp)}
              </div>
            )}
          </div>
        )}

        {/* Structured Summary for completed tasks */}
        {task.status === 'completed' && summaryData && (
          <div className="space-y-3 mb-3">
            {/* One sentence summary */}
            {summaryData.oneSentenceSummary && (
              <div className="bg-blue-50 p-3 rounded border-l-4 border-blue-400">
                <h5 className="text-sm font-medium text-blue-900 mb-1">Summary</h5>
                <p className="text-sm text-blue-800">{summaryData.oneSentenceSummary}</p>
              </div>
            )}

            {/* Bullet points */}
            {summaryData.bulletPoints && summaryData.bulletPoints.length > 0 && (
              <div className="bg-green-50 p-3 rounded border-l-4 border-green-400">
                <h5 className="text-sm font-medium text-green-900 mb-2">Key Points</h5>
                <ul className="space-y-1">
                  {summaryData.bulletPoints.map((point, index) => (
                    <li key={index} className="text-sm text-green-800 flex items-start">
                      <span className="text-green-600 mr-2">•</span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Confidence and Sentiment indices */}
            {(summaryData.confidenceIndex || summaryData.sentimentIndex) && (
              <div className="flex space-x-4 text-xs">
                {summaryData.confidenceIndex && (
                  <div className="flex items-center space-x-1">
                    <span className="text-slate-600">Confidence:</span>
                    <span className="font-medium text-slate-800">
                      {(Number(summaryData.confidenceIndex) * 100).toFixed(0)}%
                    </span>
                  </div>
                )}
                {summaryData.sentimentIndex && (
                  <div className="flex items-center space-x-1">
                    <span className="text-slate-600">Sentiment:</span>
                    <span className="font-medium text-slate-800">
                      {(Number(summaryData.sentimentIndex) * 100).toFixed(0)}%
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Analysis Scores (dynamic) */}
            {task.result?.metadata?.analysisScores && Object.keys(task.result.metadata.analysisScores).length > 0 && (
              <div className="flex flex-wrap gap-4 text-xs">
                {Object.entries(task.result.metadata.analysisScores).map(([key, value]) => (
                  <div key={key} className="flex items-center space-x-1">
                    <span className="text-slate-600">{key.charAt(0).toUpperCase() + key.slice(1)}:</span>
                    <span className="font-medium text-slate-800">
                      {(Number(value) * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        
        <div className="flex space-x-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => {
              onSelect(task.filename);
              switchToViewerTab();
            }}
          >
            <Eye className="w-3 h-3 mr-1" />
            View PDF
          </Button>
          {task.status === 'completed' && task.hasResult && (
            <Button variant="outline" size="sm">
              View Summary
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
};

const TimelineTab = ({ uploadedFiles, selectedPdf, setSelectedPdf, switchToViewerTab }: TimelineTabProps) => {
  const [tasks, setTasks] = useState<PdfTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [reordering, setReordering] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Fetch all tasks on component mount and auto-refresh every 5 seconds
  useEffect(() => {
    fetchTasks(false); // Initial load without loading state
    const interval = setInterval(() => fetchTasks(false), 5000); // Auto-refresh every 5 seconds silently
    return () => clearInterval(interval);
  }, []);

  const fetchTasks = async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      const response = await fetch(`${API_BASE_URL}/status`);
      if (response.ok) {
        const data: TasksResponse = await response.json();
        console.log('Fetched tasks data:', {
          totalTasks: data.tasks.length,
          completedTasks: data.tasks.filter(t => t.status === 'completed').length,
          tasks: data.tasks.map(t => ({
            id: t.id,
            filename: t.filename,
            status: t.status,
            hasResult: t.hasResult,
            hasSummary: !!t.result?.summary,
            hasInferredTimestamp: !!t.result?.metadata?.inferredTimestamp
          }))
        });
        setTasks(data.tasks);
      } else {
        console.error('Failed to fetch tasks');
      }
    } catch (error) {
      console.error('Error fetching tasks:', error);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  const fetchTaskOrder = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/tasks/order`);
      if (response.ok) {
        const data = await response.json();
        console.log('Current task order:', data);
        return data.tasks;
      } else {
        console.error('Failed to fetch task order');
        return null;
      }
    } catch (error) {
      console.error('Error fetching task order:', error);
      return null;
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    // Find the tasks being moved
    const oldIndex = tasks.findIndex(task => task.id === active.id);
    const newIndex = tasks.findIndex(task => task.id === over.id);

    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    // Only allow reordering of completed tasks
    const activeTask = tasks[oldIndex];
    if (activeTask.status !== 'completed') {
      return;
    }

    // Optimistically update the UI
    const reorderedTasks = arrayMove(tasks, oldIndex, newIndex);
    setTasks(reorderedTasks);

    // Send reorder request to backend
    try {
      setReordering(true);
      const taskIds = reorderedTasks.map(task => task.id);
      
      const response = await fetch(`${API_BASE_URL}/tasks/reorder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ taskIds }),
      });

      if (!response.ok) {
        // Revert the optimistic update on failure
        setTasks(tasks);
        console.error('Failed to reorder tasks');
      }
    } catch (error) {
      // Revert the optimistic update on error
      setTasks(tasks);
      console.error('Error reordering tasks:', error);
    } finally {
      setReordering(false);
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getProcessingEvents = (task: PdfTask) => {
    const events = [];
    
    if (task.createdAt) {
      events.push({
        icon: <CheckCircle2 className="w-3 h-3 text-green-500" />,
        text: `Uploaded at ${formatDate(task.createdAt)}`,
        completed: true
      });
    }
    
    if (task.startedAt) {
      events.push({
        icon: <CheckCircle2 className="w-3 h-3 text-green-500" />,
        text: `Processing started at ${formatDate(task.startedAt)}`,
        completed: true
      });
    }
    
    if (task.status === 'processing') {
      events.push({
        icon: <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />,
        text: 'Analyzing content...',
        completed: false
      });
    }
    
    if (task.status === 'completed' && task.completedAt) {
      events.push({
        icon: <CheckCircle2 className="w-3 h-3 text-green-500" />,
        text: `Processing completed at ${formatDate(task.completedAt)}`,
        completed: true
      });
      
      if (task.hasResult) {
        events.push({
          icon: <CheckCircle2 className="w-3 h-3 text-green-500" />,
          text: 'Summary and analysis ready',
          completed: true
        });
      }
    }
    
    if (task.status === 'failed') {
      events.push({
        icon: <AlertCircle className="w-3 h-3 text-red-500" />,
        text: task.error || 'Processing failed',
        completed: false
      });
    }
    
    if (task.status === 'pending') {
      events.push({
        icon: <Clock className="w-3 h-3 text-yellow-500" />,
        text: 'Waiting to be processed',
        completed: false
      });
    }
    
    return events;
  };

  // Show empty state when there are no tasks (regardless of loading state from auto-polling)
  if (tasks.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center">
          <Clock className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-600 mb-2">No Documents to Display</h3>
          <p className="text-slate-500">Upload some PDFs to see the processing timeline</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full p-6">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-slate-800 mb-2">Document Processing Timeline</h3>
          <p className="text-sm text-slate-600">
            Track the processing status of your uploaded documents. Drag completed tasks to reorder them.
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => fetchTasks(true)}
          disabled={loading || reordering}
        >
          <RefreshCw className={`w-4 h-4 mr-1 ${loading || reordering ? 'animate-spin' : ''}`} />
          {reordering ? 'Reordering...' : 'Refresh'}
        </Button>
      </div>

      <ScrollArea className="h-[calc(100%-120px)]">
        <div className="relative">
          {/* Timeline Line */}
          {tasks.length > 0 && (
            <div className="absolute left-8 top-8 bottom-8 w-0.5 bg-slate-200"></div>
          )}
          
          <DndContext 
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext 
              items={tasks.map(task => task.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-6">
                {tasks.map((task) => {
                  const isSelected = selectedPdf === task.filename;
                  
                  return (
                    <SortableTaskItem
                      key={task.id}
                      task={task}
                      isSelected={isSelected}
                      onSelect={(filename) => setSelectedPdf && setSelectedPdf(filename)}
                      formatDate={formatDate}
                      getStatusIcon={getStatusIcon}
                      getStatusColor={getStatusColor}
                      getProcessingEvents={getProcessingEvents}
                      switchToViewerTab={switchToViewerTab}
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </ScrollArea>


    </div>
  );
};

export default TimelineTab;
