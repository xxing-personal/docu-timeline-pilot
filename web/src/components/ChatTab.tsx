
import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Send, Bot, User } from 'lucide-react';
import { ScrollArea } from "@/components/ui/scroll-area";

interface ChatTabProps {
  uploadedFiles: File[];
}

interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
}

const ChatTab = ({ uploadedFiles }: ChatTabProps) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      content: 'Hello! I can help you analyze your PDF documents. Upload some PDFs and ask me questions about their content, summaries, or key insights.',
      isUser: false,
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');

  const handleSendMessage = () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputValue,
      isUser: true,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);

    // Simulate AI response
    setTimeout(() => {
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        content: uploadedFiles.length > 0 
          ? `I can see you have ${uploadedFiles.length} PDF(s) uploaded. I'm analyzing your question about "${inputValue}". This is a demo response - in a real implementation, I would process your documents and provide insights.`
          : "I notice you haven't uploaded any PDFs yet. Please upload some documents first so I can help you analyze them.",
        isUser: false,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiResponse]);
    }, 1000);

    setInputValue('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const suggestedQueries = [
    "Summarize all documents",
    "What are the key dates?",
    "Extract action items",
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
      <div className="pt-3 border-t border-slate-200">
        <div className="flex space-x-2">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask about your documents..."
            className="flex-1"
          />
          <Button onClick={handleSendMessage} size="sm">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ChatTab;
