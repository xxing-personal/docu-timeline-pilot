import React, { useState, useEffect } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Copy, Download, Eye, Search, FileText, RefreshCw, Clock, BookOpen } from 'lucide-react';
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";

interface SummarizationTabProps {
  uploadedFiles: File[];
}

interface WritingResult {
  queueKey: string;
  queueName: string;
  userQuery: string;
  article: string;
  status: string;
  timestamp: string;
  documentCount: number;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

const SummarizationTab = ({ uploadedFiles }: SummarizationTabProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [writingResults, setWritingResults] = useState<WritingResult[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Fetch deep research agent writing results
  const fetchWritingResults = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/agent/queue`);
      if (!response.ok) {
        throw new Error('Failed to fetch agent queues');
      }
      
      const data = await response.json();
      const results: WritingResult[] = [];
      
      if (data.queues && Array.isArray(data.queues)) {
        for (const queue of data.queues) {
          // Only process deep research queues
          if (queue.type === 'deep_research' && queue.tasks) {
            // Find the writing task (final task that generates the article)
            const writingTask = queue.tasks.find((task: any) => task.type === 'writing' && task.status === 'completed');
            
            if (writingTask && writingTask.result && writingTask.result.article) {
              const researchTasks = queue.tasks.filter((task: any) => task.type === 'research');
              
              results.push({
                queueKey: queue.queueKey,
                queueName: queue.name || 'Deep Research',
                userQuery: writingTask.payload?.question || 'Research Query',
                article: writingTask.result.article,
                status: queue.status,
                timestamp: queue.createdAt || new Date().toISOString(),
                documentCount: researchTasks.length
              });
            }
          }
        }
      }
      
      setWritingResults(results);
    } catch (error) {
      console.error('Error fetching writing results:', error);
      toast({
        title: "Error",
        description: "Failed to fetch research summaries. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWritingResults();
  }, []);

  const copyToClipboard = (text: string, title: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Article copied",
      description: `Research article "${title}" copied to clipboard.`
    });
  };

  const exportArticle = (article: string, title: string) => {
    const blob = new Blob([article], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Export complete",
      description: `Research article exported as ${a.download}`
    });
  };

  const refreshResults = () => {
    fetchWritingResults();
    toast({
      title: "Refreshed",
      description: "Research summaries have been refreshed."
    });
  };

  // Filter results based on search term
  const filteredResults = writingResults.filter(result =>
    result.queueName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    result.userQuery.toLowerCase().includes(searchTerm.toLowerCase()) ||
    result.article.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading && writingResults.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center">
          <RefreshCw className="w-16 h-16 text-slate-300 mx-auto mb-4 animate-spin" />
          <h3 className="text-lg font-medium text-slate-600 mb-2">Loading Research Summaries</h3>
          <p className="text-slate-500">Fetching results from deep research agents...</p>
        </div>
      </div>
    );
  }

  if (writingResults.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center">
          <BookOpen className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-600 mb-2">No Research Summaries Available</h3>
          <p className="text-slate-500 mb-4">Run a Deep Research agent to generate comprehensive research articles</p>
          <Button onClick={refreshResults} variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh Results
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-slate-800">Research Summaries</h3>
          <Button onClick={refreshResults} variant="outline" size="sm" disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          Comprehensive research articles generated by Deep Research agents ({writingResults.length} available)
        </p>
        
        {/* Global Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
          <Input
            placeholder="Search research articles..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <ScrollArea className="h-[calc(100%-160px)]">
        <Accordion type="multiple" className="space-y-4">
          {filteredResults.map((result, index) => {
            // Create a preview of the article (first 200 characters)
            const preview = result.article.replace(/^#.*?\n/, '').replace(/\*\*/g, '').substring(0, 200);
            const wordCount = result.article.split(/\s+/).length;
            
            return (
              <AccordionItem key={result.queueKey} value={`item-${index}`} className="border-none">
                <Card className="overflow-hidden">
                  <AccordionTrigger className="px-6 py-4 hover:no-underline hover:bg-slate-50 transition-colors">
                    <div className="flex items-center space-x-3 text-left w-full">
                      <BookOpen className="w-5 h-5 text-blue-500 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="font-medium text-slate-900 truncate">{result.userQuery}</h4>
                          <div className="flex items-center space-x-2 text-xs text-slate-500">
                            <Clock className="w-3 h-3" />
                            <span>{new Date(result.timestamp).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <p className="text-sm text-slate-500 truncate">
                          {preview}...
                        </p>
                        <div className="flex items-center space-x-4 mt-1 text-xs text-slate-400">
                          <span>{wordCount} words</span>
                          <span>{result.documentCount} documents analyzed</span>
                          <span className="capitalize">{result.status}</span>
                        </div>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-6 pb-4">
                    <div className="space-y-4">
                      <div className="bg-slate-50 rounded-lg p-4">
                        <h5 className="font-medium text-slate-900 mb-3 flex items-center">
                          <FileText className="w-4 h-4 mr-2" />
                          Research Article
                        </h5>
                        <div className="prose prose-slate max-w-none text-sm">
                          <div className="whitespace-pre-wrap font-mono text-xs bg-white rounded border p-3 max-h-96 overflow-y-auto">
                            {result.article}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(result.article, result.userQuery)}
                        >
                          <Copy className="w-3 h-3 mr-1" />
                          Copy Article
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => exportArticle(result.article, result.userQuery)}
                        >
                          <Download className="w-3 h-3 mr-1" />
                          Export Markdown
                        </Button>
                        <Button variant="outline" size="sm">
                          <Eye className="w-3 h-3 mr-1" />
                          View Details
                        </Button>
                      </div>
                      
                      <div className="text-xs text-slate-500 pt-2 border-t border-slate-200">
                        Queue: {result.queueKey} • 
                        Generated: {new Date(result.timestamp).toLocaleString()} • 
                        Documents: {result.documentCount} • 
                        Status: {result.status}
                      </div>
                    </div>
                  </AccordionContent>
                </Card>
              </AccordionItem>
            );
          })}
        </Accordion>

        {filteredResults.length === 0 && searchTerm && (
          <div className="text-center py-8">
            <Search className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">No research articles found matching "{searchTerm}"</p>
          </div>
        )}
      </ScrollArea>
    </div>
  );
};

export default SummarizationTab;
