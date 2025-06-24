import React, { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Send, Bot, User, AtSign, FileText } from 'lucide-react';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
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
  mentions?: string[]; // Array of mentioned document filenames
}

interface MentionSuggestion {
  type: 'all' | 'document';
  display: string;
  value: string;
  filename?: string;
}

const API_BASE_URL = getApiBaseUrl();

const ChatTab = ({ uploadedFiles }: ChatTabProps) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      content: 'Hello! I can help you analyze your PDF documents. Use @ to mention specific documents or @all for all documents. Upload some PDFs and ask me questions about their content, summaries, or key insights.',
      isUser: false,
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [tasks, setTasks] = useState<PdfTask[]>([]);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSuggestions, setMentionSuggestions] = useState<MentionSuggestion[]>([]);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const [cursorPosition, setCursorPosition] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch completed tasks on component mount
  useEffect(() => {
    fetchTasks();
  }, []);

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

  const handleSendMessage = () => {
    if (!inputValue.trim()) return;

    const mentions = extractMentions(inputValue);
    
    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputValue,
      isUser: true,
      timestamp: new Date(),
      mentions
    };

    setMessages(prev => [...prev, userMessage]);

    // Simulate AI response based on mentions
    setTimeout(() => {
      let aiResponse = '';
      
      if (mentions.includes('@all')) {
        aiResponse = `I'll analyze all ${tasks.length} documents for you. Your question: "${inputValue.replace(/@all/g, '').trim()}". This is a demo response - in a real implementation, I would process all documents and provide comprehensive insights.`;
      } else if (mentions.length > 0) {
        const mentionedDocs = mentions.join(', ');
        aiResponse = `I'll focus on the mentioned documents: ${mentionedDocs}. Your question: "${inputValue.replace(/@\w+/g, '').trim()}". This is a demo response - in a real implementation, I would analyze the specific documents you mentioned.`;
      } else {
        aiResponse = uploadedFiles.length > 0 
          ? `I can see you have ${uploadedFiles.length} PDF(s) uploaded. I'm analyzing your question about "${inputValue}". This is a demo response - in a real implementation, I would process your documents and provide insights.`
          : "I notice you haven't uploaded any PDFs yet. Please upload some documents first so I can help you analyze them.";
      }

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: aiResponse,
        isUser: false,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiMessage]);
    }, 1000);

    setInputValue('');
    setShowMentions(false);
  };

  const suggestedQueries = [
    "@all Summarize all documents",
    "@all What are the key dates?",
    "@all Extract action items",
    "Compare documents"
  ];

  return (
    <div className="h-[calc(100vh-200px)] flex flex-col p-4">
      {/* Chat Messages - takes most of the space */}
      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full">
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
                  <Card
                    className={`p-3 ${
                      message.isUser
                        ? 'bg-blue-500 text-white'
                        : 'bg-white border border-slate-200'
                    }`}
                  >
                    <p className="text-sm">{message.content}</p>
                    {message.mentions && message.mentions.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {message.mentions.map((mention, index) => (
                          <Badge 
                            key={index} 
                            variant="secondary" 
                            className={`text-xs ${message.isUser ? 'bg-blue-400 text-white' : 'bg-slate-100'}`}
                          >
                            <AtSign className="w-3 h-3 mr-1" />
                            {mention === '@all' ? 'all' : mention}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <p
                      className={`text-xs mt-1 ${
                        message.isUser ? 'text-blue-100' : 'text-slate-500'
                      }`}
                    >
                      {message.timestamp.toLocaleTimeString()}
                    </p>
                  </Card>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Available Documents */}
      {tasks.length > 0 && (
        <div className="py-2 border-t border-slate-200">
          <p className="text-xs text-slate-600 mb-2">Available documents:</p>
          <div className="flex flex-wrap gap-1">
            <Badge variant="outline" className="text-xs">
              <AtSign className="w-3 h-3 mr-1" />
              all
            </Badge>
            {tasks.map((task) => (
              <Badge key={task.id} variant="outline" className="text-xs">
                <FileText className="w-3 h-3 mr-1" />
                {task.filename}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Suggested Queries - compact */}
      {uploadedFiles.length > 0 && (
        <div className="py-3">
          <p className="text-xs text-slate-600 mb-2">Suggested queries:</p>
          <div className="flex flex-wrap gap-2">
            {suggestedQueries.map((query, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                onClick={() => setInputValue(query)}
                className="text-xs"
              >
                {query}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Input Area - fixed at bottom with proper spacing */}
      <div className="pt-3 border-t border-slate-200 relative">
        <div className="flex space-x-2">
          <div className="flex-1 relative">
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your documents... Use @ to mention specific docs"
              className="flex-1"
            />
            {showMentions && (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-slate-200 rounded-md shadow-lg z-10 max-h-48 overflow-y-auto">
                {mentionSuggestions.map((suggestion, index) => (
                  <div
                    key={index}
                    className={`px-3 py-2 cursor-pointer hover:bg-slate-50 ${
                      index === selectedMentionIndex ? 'bg-slate-100' : ''
                    }`}
                    onClick={() => insertMention(suggestion)}
                  >
                    <div className="flex items-center space-x-2">
                      <AtSign className="w-4 h-4 text-slate-500" />
                      <span className="text-sm">{suggestion.display}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <Button onClick={handleSendMessage} size="sm">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ChatTab;
