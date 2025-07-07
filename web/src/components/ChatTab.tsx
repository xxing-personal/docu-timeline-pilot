import React, { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Bot, User, AtSign, FileText, Plus, Sparkles, ChevronDown, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getApiBaseUrl } from "@/lib/utils";

interface ChatTabProps {
  uploadedFiles: File[];
}

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

interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
  mentions?: string[];
}

interface ChatSession {
  id: string;
  name: string;
  createdAt: Date;
  lastActivity: Date;
  messageCount: number;
  documents?: string[];
}

interface MentionSuggestion {
  type: 'all' | 'document';
  display: string;
  value: string;
  filename?: string;
}

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
}

const API_BASE_URL = getApiBaseUrl();

const ChatTab = ({ uploadedFiles }: ChatTabProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [tasks, setTasks] = useState<PdfTask[]>([]);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSuggestions, setMentionSuggestions] = useState<MentionSuggestion[]>([]);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  
  // Agent states
  const [selectedAgentType, setSelectedAgentType] = useState<'indices' | 'deep_research' | 'change_statement' | null>(null);
  const [agentQueues, setAgentQueues] = useState<AgentQueue[]>([]);
  const [currentAgentQueue, setCurrentAgentQueue] = useState<AgentQueue | null>(null);
  const [agentLoading, setAgentLoading] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Fetch completed tasks and load existing messages on component mount
  useEffect(() => {
    fetchTasks();
    loadExistingMessages();
    fetchAgentQueues();
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollElement = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
  }, [messages]);

  const fetchTasks = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/status`);
      if (response.ok) {
        const data = await response.json();
        const completedTasks = data.tasks.filter((task: PdfTask) => task.status === 'completed');
        setTasks(completedTasks);
      }
    } catch (error) {
      console.error('Error fetching tasks:', error);
    }
  };

  const fetchAgentQueues = async () => {
    try {
      // For now, we'll store queues in localStorage since they're in-memory on backend
      const storedQueues = localStorage.getItem('agentQueues');
      if (storedQueues) {
        setAgentQueues(JSON.parse(storedQueues));
      }
    } catch (error) {
      console.error('Error fetching agent queues:', error);
    }
  };

  const fetchSessions = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/chat/sessions`);
      if (response.ok) {
        const sessionsData = await response.json();
        setSessions(sessionsData);
      }
    } catch (error) {
      console.error('Error fetching sessions:', error);
    }
  };

  const loadExistingMessages = async () => {
    try {
      await fetchSessions();
      // Get the most recent session or create a new one
      if (sessions.length > 0) {
        // Load messages from the most recent session
        const latestSession = sessions[0];
        setCurrentSessionId(latestSession.id);
        const messagesResponse = await fetch(`${API_BASE_URL}/chat/sessions/${latestSession.id}/messages`);
        if (messagesResponse.ok) {
          const messagesData = await messagesResponse.json();
          const messagesWithDates = messagesData.map((msg: any) => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          }));
          setMessages(messagesWithDates);
        }
      } else {
        // No existing sessions, add welcome message
        setMessages([{
          id: 'welcome',
          content: 'Hello! I can help you analyze your PDF documents. Use @ to mention specific documents or @all for all documents. Upload some PDFs and ask me questions about their content, summaries, or key insights.',
          isUser: false,
          timestamp: new Date()
        }]);
      }
    } catch (error) {
      console.error('Error loading existing messages:', error);
      // Fallback welcome message
      setMessages([{
        id: 'welcome',
        content: 'Hello! I can help you analyze your PDF documents. Use @ to mention specific documents or @all for all documents. Upload some PDFs and ask me questions about their content, summaries, or key insights.',
        isUser: false,
        timestamp: new Date()
      }]);
    }
  };

  const createNewSession = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/chat/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'New Chat' }),
      });
      
      if (response.ok) {
        const session = await response.json();
        setCurrentSessionId(session.id);
        setSessions(prev => [session, ...prev]);
        
        // Clear messages and add welcome message
        setMessages([{
          id: 'welcome',
          content: 'Hello! I can help you analyze your PDF documents. Use @ to mention specific documents or @all for all documents. Upload some PDFs and ask me questions about their content, summaries, or key insights.',
          isUser: false,
          timestamp: new Date()
        }]);
      }
    } catch (error) {
      console.error('Error creating new session:', error);
    }
  };

  const loadSession = async (sessionId: string) => {
    try {
      setCurrentSessionId(sessionId);
      const messagesResponse = await fetch(`${API_BASE_URL}/chat/sessions/${sessionId}/messages`);
      if (messagesResponse.ok) {
        const messagesData = await messagesResponse.json();
        const messagesWithDates = messagesData.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }));
        setMessages(messagesWithDates);
      }
    } catch (error) {
      console.error('Error loading session:', error);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    
    // Check for @ mentions
    const cursorPos = e.target.selectionStart || 0;
    setCursorPosition(cursorPos);
    
    const beforeCursor = value.substring(0, cursorPos);
    const atMatch = beforeCursor.match(/@(\w*)$/);
    
    if (atMatch) {
      const query = atMatch[1].toLowerCase();
      const suggestions: MentionSuggestion[] = [];
      
      // Add @all option
      if ('all'.includes(query)) {
        suggestions.push({
          type: 'all',
          display: '@all - All documents',
          value: '@all'
        });
      }
      
      // Add document suggestions
      tasks.forEach(task => {
        const filename = task.filename.toLowerCase();
        if (filename.includes(query)) {
          suggestions.push({
            type: 'document',
            display: `@${task.filename}`,
            value: `@${task.filename}`,
            filename: task.filename
          });
        }
      });
      
      setMentionSuggestions(suggestions);
      setShowMentions(suggestions.length > 0);
      setSelectedMentionIndex(0);
    } else {
      setShowMentions(false);
    }
  };

  const insertMention = (suggestion: MentionSuggestion) => {
    const beforeCursor = inputValue.substring(0, cursorPosition);
    const afterCursor = inputValue.substring(cursorPosition);
    
    // Find the @ symbol and replace everything from there
    const atIndex = beforeCursor.lastIndexOf('@');
    const newValue = beforeCursor.substring(0, atIndex) + suggestion.value + ' ' + afterCursor;
    
    setInputValue(newValue);
    setShowMentions(false);
    
    // Focus back to input and position cursor after the mention
    setTimeout(() => {
      if (inputRef.current) {
        const newCursorPos = atIndex + suggestion.value.length + 1;
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showMentions) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedMentionIndex(prev => 
          prev < mentionSuggestions.length - 1 ? prev + 1 : 0
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedMentionIndex(prev => 
          prev > 0 ? prev - 1 : mentionSuggestions.length - 1
        );
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (mentionSuggestions[selectedMentionIndex]) {
          insertMention(mentionSuggestions[selectedMentionIndex]);
        }
      } else if (e.key === 'Escape') {
        setShowMentions(false);
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const extractMentions = (content: string): string[] => {
    const mentions: string[] = [];
    const mentionRegex = /@(\w+)/g;
    let match;
    
    while ((match = mentionRegex.exec(content)) !== null) {
      if (match[1] === 'all') {
        mentions.push('@all');
      } else {
        // Check if it matches a document filename
        const filename = tasks.find(task => 
          task.filename.toLowerCase() === match[1].toLowerCase()
        )?.filename;
        if (filename) {
          mentions.push(filename);
        }
      }
    }
    
    return mentions;
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    // Check if an agent is selected and handle agent request
    if (selectedAgentType) {
      await initiateAgent(inputValue);
      setInputValue('');
      setShowMentions(false);
      return;
    }

    setIsLoading(true);
    const mentions = extractMentions(inputValue);
    
    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputValue,
      isUser: true,
      timestamp: new Date(),
      mentions
    };

    setMessages(prev => [...prev, userMessage]);

    // Add a loading message
    const loadingMessage: Message = {
      id: (Date.now() + 1).toString(),
      content: 'Thinking...',
      isUser: false,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, loadingMessage]);

    try {
      // Call the backend chat API
      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: inputValue,
          mentions: mentions,
          sessionId: currentSessionId
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response from chat API');
      }

      const data = await response.json();
      
      // Replace loading message with actual response
      const aiMessage: Message = {
        id: loadingMessage.id,
        content: data.content,
        isUser: false,
        timestamp: new Date(data.timestamp)
      };
      
      setMessages(prev => prev.map(msg => 
        msg.id === loadingMessage.id ? aiMessage : msg
      ));

      // Refresh sessions to update message count
      fetchSessions();
    } catch (error) {
      console.error('Chat API error:', error);
      
      // Replace loading message with error
      const errorMessage: Message = {
        id: loadingMessage.id,
        content: 'Sorry, I encountered an error while processing your request. Please try again.',
        isUser: false,
        timestamp: new Date()
      };
      
      setMessages(prev => prev.map(msg => 
        msg.id === loadingMessage.id ? errorMessage : msg
      ));
    } finally {
      setIsLoading(false);
    }

    setInputValue('');
    setShowMentions(false);
  };

  // Agent functions
  const initiateAgent = async (query: string) => {
    if (!selectedAgentType || !query.trim()) return;
    
    setAgentLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/agent/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          agentType: selectedAgentType,
          userQuery: query
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to initiate agent');
      }

      const data = await response.json();
      
      // Add agent message to chat
      const agentMessage: Message = {
        id: Date.now().toString(),
        content: `🤖 Started ${
          selectedAgentType === 'indices' ? 'Indices Creation' : 
          selectedAgentType === 'deep_research' ? 'Deep Research' : 
          selectedAgentType === 'change_statement' ? 'Change of Statement' : 'Unknown'
        } agent with query: "${query}". Processing documents...`,
        isUser: false,
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, agentMessage]);
      
      // Store queue info
      const newQueue: AgentQueue = {
        queueKey: data.queueKey,
        tasks: []
      };
      
      setAgentQueues(prev => [newQueue, ...prev]);
      setCurrentAgentQueue(newQueue);
      localStorage.setItem('agentQueues', JSON.stringify([newQueue, ...agentQueues]));
      
      // Reset agent type
      setSelectedAgentType(null);
      
      // Start monitoring the queue
      monitorAgentQueue(data.queueKey);
      
    } catch (error) {
      console.error('Agent initiation error:', error);
      alert('Failed to start agent. Please try again.');
    } finally {
      setAgentLoading(false);
    }
  };

  const monitorAgentQueue = async (queueKey: string) => {
    // Poll the queue every 2 seconds
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/agent/queue/${queueKey}`);
        if (response.ok) {
          const data = await response.json();
          
          // Update queue in state
          setAgentQueues(prev => prev.map(q => 
            q.queueKey === queueKey ? { ...q, tasks: data.tasks } : q
          ));
          
          // Check if all tasks are completed
          const allCompleted = data.tasks.every((t: AgentTask) => t.status === 'completed');
          const anyFailed = data.tasks.some((t: AgentTask) => t.status === 'failed');
          
          if (allCompleted || anyFailed) {
            clearInterval(interval);
            
            // Add completion message
            const completionMessage: Message = {
              id: Date.now().toString(),
              content: anyFailed 
                ? `❌ Agent processing completed with some failures. Check the queue for details.`
                : `✅ Agent processing completed successfully! ${
                    selectedAgentType === 'indices' ? 'Check the Analysis tab for new indices.' : 
                    selectedAgentType === 'change_statement' ? 'Check the Analysis tab for change analysis results.' :
                    'Check the results below.'
                  }`,
              isUser: false,
              timestamp: new Date()
            };
            
            setMessages(prev => [...prev, completionMessage]);
            
            // If indices agent, refresh tasks to trigger AnalysisTab update
            if (selectedAgentType === 'indices') {
              fetchTasks();
            }
          }
        }
      } catch (error) {
        console.error('Error monitoring agent queue:', error);
      }
    }, 2000);
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
        const queueResponse = await fetch(`${API_BASE_URL}/agent/queue/${queueKey}`);
        if (queueResponse.ok) {
          const queueData = await queueResponse.json();
          setAgentQueues(prev => prev.map(q => 
            q.queueKey === queueKey ? { ...q, tasks: queueData.tasks } : q
          ));
        }
      }
    } catch (error) {
      console.error('Error processing next task:', error);
    }
  };

  const getAgentStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'processing':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'pending':
        return <div className="w-4 h-4 bg-yellow-500 rounded-full" />;
      default:
        return <div className="w-4 h-4 bg-gray-400 rounded-full" />;
    }
  };

  return (
    <div className="h-[calc(100vh-200px)] flex flex-col p-4">
      {/* Chat Messages */}
      <div className="flex-1 min-h-0 mb-4">
        <ScrollArea ref={scrollAreaRef} className="h-full">
          <div className="space-y-4 pr-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.isUser ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`flex max-w-[80%] ${
                    message.isUser ? 'flex-row-reverse' : 'flex-row'
                  } items-start space-x-2`}
                >
                  <div
                    className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                      message.isUser ? 'bg-blue-500 ml-2' : 'bg-slate-200 mr-2'
                    }`}
                  >
                    {message.isUser ? (
                      <User className="w-4 h-4 text-white" />
                    ) : (
                      <Bot className="w-4 h-4 text-slate-600" />
                    )}
                  </div>
                  <div
                    className={`rounded-lg px-4 py-2 ${
                      message.isUser
                        ? 'bg-blue-500 text-white'
                        : 'bg-slate-100 text-slate-900'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    {message.mentions && message.mentions.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {message.mentions.map((mention, index) => (
                          <Badge
                            key={index}
                            variant="secondary"
                            className="text-xs"
                          >
                            <AtSign className="w-3 h-3 mr-1" />
                            {mention}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <p className={`text-xs mt-1 ${
                      message.isUser ? 'text-blue-100' : 'text-slate-500'
                    }`}>
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Menu Bar - now two lines, more compact and wider */}
      <div className="p-2 bg-white rounded-2xl border border-slate-200 shadow-sm" style={{minHeight: 48, maxWidth: 1000, margin: '0 auto', width: '100%'}}>
        {/* Top line: Input */}
        <div className="flex items-center mb-1 w-full">
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={selectedAgentType ? `Enter your query for ${
              selectedAgentType === 'indices' ? 'Indices Creation' : 
              selectedAgentType === 'deep_research' ? 'Deep Research' :
              selectedAgentType === 'change_statement' ? 'Change of Statement' : 'Unknown'
            } agent...` : "Type your message..."}
            className="border-0 shadow-none focus:ring-0 focus-visible:ring-0 bg-transparent px-0 text-sm h-8 flex-1"
            style={{fontSize: '0.98rem', width: '100%'}}
            disabled={isLoading || agentLoading}
          />
          {/* Mention Suggestions */}
          {showMentions && (
            <div className="absolute bottom-full left-0 mb-2 w-64 bg-white border border-slate-200 rounded-lg shadow-lg z-10">
              {mentionSuggestions.map((suggestion, index) => (
                <div
                  key={index}
                  className={`px-3 py-2 cursor-pointer flex items-center gap-2 ${
                    index === selectedMentionIndex ? 'bg-blue-50' : 'hover:bg-slate-50'
                  }`}
                  onClick={() => insertMention(suggestion)}
                >
                  {suggestion.type === 'all' ? (
                    <AtSign className="w-4 h-4 text-blue-500" />
                  ) : (
                    <FileText className="w-4 h-4 text-green-500" />
                  )}
                  <span className="text-sm">{suggestion.display}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        {/* Second line: Buttons */}
        <div className="flex items-center gap-2 justify-between w-full">
          <div className="flex items-center gap-1">
            {/* + Button */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full">
                  <Plus className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={createNewSession}>
                  <Plus className="w-4 h-4 mr-2" />
                  New Chat
                </DropdownMenuItem>
                {sessions.length > 0 && (
                  <>
                    <DropdownMenuItem disabled className="text-xs text-slate-500">
                      Recent Sessions
                    </DropdownMenuItem>
                    {sessions.slice(0, 5).map((session) => (
                      <DropdownMenuItem 
                        key={session.id}
                        onClick={() => loadSession(session.id)}
                        className="text-sm"
                      >
                        <FileText className="w-4 h-4 mr-2" />
                        {session.name} ({session.messageCount} messages)
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {/* Agent Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-1 px-2 h-7 rounded-full text-xs font-normal">
                  <Sparkles className="w-3 h-3" />
                  {(() => {
                    if (!selectedAgentType) return 'Agent';
                    if (selectedAgentType === 'indices') return 'Indices';
                    if (selectedAgentType === 'deep_research') return 'Research';
                    if (selectedAgentType === 'change_statement') return 'Change';
                    return 'Agent';
                  })()}
                  <ChevronDown className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => setSelectedAgentType('indices')}>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Indices Creation
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSelectedAgentType('deep_research')}>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Deep Research
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSelectedAgentType('change_statement')}>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Change of Statement
                </DropdownMenuItem>
                {selectedAgentType && (
                  <DropdownMenuItem onClick={() => setSelectedAgentType(null)}>
                    <FileText className="w-4 h-4 mr-2" />
                    Clear Selection
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {/* Send Button */}
          <Button 
            onClick={handleSendMessage} 
            size="icon"
            disabled={isLoading || agentLoading || !inputValue.trim()}
            className="h-8 w-8 rounded-full bg-black hover:bg-black/80 text-white flex items-center justify-center shadow-none"
            style={{marginLeft: 4}}
          >
            {agentLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Agent Queue Monitor */}
      {currentAgentQueue && (
        <div className="fixed bottom-20 right-4 w-80 bg-white border border-slate-200 rounded-lg shadow-lg p-4 max-h-96 overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium text-sm">Agent Queue: {currentAgentQueue.queueKey}</h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentAgentQueue(null)}
              className="h-6 w-6 p-0"
            >
              ×
            </Button>
          </div>
          <div className="space-y-2">
            {currentAgentQueue.tasks.map((task) => (
              <div key={task.id} className="flex items-center gap-2 text-xs">
                {getAgentStatusIcon(task.status)}
                <span className="flex-1 truncate">{task.type}: {task.payload.filename || task.id}</span>
                {task.status === 'pending' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => processNextTask(currentAgentQueue.queueKey)}
                    className="h-5 px-2 text-xs"
                  >
                    Process
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatTab;
