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

interface PdfTask {
  id: string;
  filename: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  hasResult?: boolean;
  displayOrder?: number;
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
}

const API_BASE_URL = 'http://localhost:3000';

// Sortable task item component
interface SortableTaskItemProps {
  task: PdfTask;
  isSelected: boolean;
  onSelect: (filename: string) => void;
  formatDate: (dateString: string) => string;
  getStatusIcon: (status: string) => JSX.Element;
  getStatusColor: (status: string) => string;
  getProcessingEvents: (task: PdfTask) => any[];
}

const SortableTaskItem = ({ 
  task, 
  isSelected, 
  onSelect, 
  formatDate, 
  getStatusIcon, 
  getStatusColor, 
  getProcessingEvents 
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
  const canReorder = task.status === 'pending' || task.status === 'completed' || task.status === 'processing'; // Allow reordering of pending, completed, and processing tasks

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
        
        {/* Processing Events */}
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
        
        <div className="flex space-x-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => onSelect(task.filename)}
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

const TimelineTab = ({ uploadedFiles, selectedPdf, setSelectedPdf }: TimelineTabProps) => {
  const [tasks, setTasks] = useState<PdfTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [reordering, setReordering] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Fetch all tasks on component mount and periodically refresh
  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/status`);
      if (response.ok) {
        const data: TasksResponse = await response.json();
        setTasks(data.tasks);
      } else {
        console.error('Failed to fetch tasks');
      }
    } catch (error) {
      console.error('Error fetching tasks:', error);
    } finally {
      setLoading(false);
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

    // Only allow reordering of pending, completed, and processing tasks (not failed)
    const activeTask = tasks[oldIndex];
    if (activeTask.status !== 'pending' && activeTask.status !== 'completed' && activeTask.status !== 'processing') {
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

  if (tasks.length === 0 && !loading) {
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
            Track the processing status of your uploaded documents. Drag tasks to reorder them (except failed tasks).
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={fetchTasks}
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
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </ScrollArea>

      {loading && tasks.length === 0 && (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      )}
    </div>
  );
};

export default TimelineTab;
