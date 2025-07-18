import React, { useState, useEffect, useMemo } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Copy, Download, Eye, Search, FileText, RefreshCw, Clock, BookOpen, File, Trash2, ExternalLink } from 'lucide-react';
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { getApiBaseUrl } from "@/lib/utils";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Components } from 'react-markdown';

// Types
interface SummarizationTabProps {
  uploadedFiles: File[];
  setSelectedPdf: (pdf: string | null) => void;
  switchToViewerTab: () => void;
}

interface ResearchArticle {
  filename: string;
  filepath: string;
  title: string;
  query: string;
  intent: string;
  generated: string;
  documentsAnalyzed: number;
  size: number;
  lastModified: string;
  preview: string;
}

interface ArticleContent {
  filename: string;
  metadata: Record<string, string>;
  content: string;
  rawContent: string;
  processedContent: string;
  citations: Citation[];
}

interface Citation {
  id: string;
  footnoteNumber: number;
  displayName: string;
  timestamp: string;
}

// Utility functions
const extractTimestampFromCitationId = (citationId: string): string | null => {
  if (citationId.startsWith('pdf_')) {
    const match = citationId.match(/pdf_(\d+)_/);
    return match ? match[1] : null;
  }
  
  if (/^\d+$/.test(citationId)) {
    return citationId;
  }
  
  if (/^\d+_[a-zA-Z0-9]+$/.test(citationId)) {
    const match = citationId.match(/^(\d+)_/);
    return match ? match[1] : null;
  }
  
  return null;
};

const generateDisplayName = (citationId: string): string => {
  if (citationId.startsWith('pdf_')) {
    return citationId.replace(/^pdf_\d+_/, '');
  }
  
  if (/^\d+$/.test(citationId)) {
    return `Document ${citationId}`;
  }
  
  if (/^\d+_[a-zA-Z0-9]+$/.test(citationId)) {
    const match = citationId.match(/^\d+_([a-zA-Z0-9]+)$/);
    return match ? match[1] : citationId;
  }
  
  return citationId;
};

const processCitations = (content: string): { processedContent: string; citations: Citation[] } => {
  if (!content) return { processedContent: '', citations: [] };

  // Remove References section first
  let processedContent = content.replace(/## References\s*\n[\s\S]*$/gm, '');
  
  // Citation regex patterns - handles multiple formats:
  // [^article_id:pdf_1752789131912_oyq0u48ng], [^article_id_map["id"]], [^article_id(id)], [^article_id_1752789131912_oyq0u48ng]
  const citationRegex = /\[\^article_id(?::([^[\]]+)|_map\["([^"]+)"\]|\(([^)]+)\)|_(\d+(?:_[a-zA-Z0-9]+)?))\]/g;
  
  // Extract unique citations
  const citationMap = new Map<string, number>();
  const citations: Citation[] = [];
  let footnoteCounter = 1;
  
  let match;
  while ((match = citationRegex.exec(content)) !== null) {
    // Extract citation ID from any format (group 1 for :id, group 2 for _map[""], group 3 for (), group 4 for _timestamp)
    const citationId = match[1] || match[2] || match[3] || match[4];
    
    if (citationId && !citationMap.has(citationId)) {
      const timestamp = extractTimestampFromCitationId(citationId);
      const displayName = generateDisplayName(citationId);
      
      citationMap.set(citationId, footnoteCounter);
      citations.push({
        id: citationId,
        footnoteNumber: footnoteCounter,
        displayName,
        timestamp: timestamp || citationId
      });
      footnoteCounter++;
    }
  }
  
  // Replace citations with standard footnotes
  processedContent = processedContent.replace(citationRegex, (match, citationId1, citationId2, citationId3, citationId4) => {
    const citationId = citationId1 || citationId2 || citationId3 || citationId4;
    const footnoteNumber = citationMap.get(citationId);
    return footnoteNumber ? `[^${footnoteNumber}]` : match;
  });
  
  // Clean up any remaining artifacts
  processedContent = processedContent.replace(/\[pdf_\d+_[a-zA-Z0-9]+\]/g, '');
  
  return { processedContent, citations };
};

// Custom hooks
const useArticles = () => {
  const [articles, setArticles] = useState<ResearchArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchArticles = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/research-articles`);
      if (!response.ok) throw new Error('Failed to fetch articles');
      
      const data = await response.json();
      setArticles(data.articles || []);
    } catch (error) {
      console.error('Error fetching articles:', error);
      toast({
        title: "Error",
        description: "Failed to fetch research articles",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const deleteArticle = async (filename: string, title: string) => {
    const confirmed = window.confirm(`Delete "${title}"?`);
    if (!confirmed) return false;

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/research-articles/${filename}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) throw new Error('Failed to delete article');
      
      toast({
        title: "Article deleted",
        description: `"${title}" has been deleted`
      });
      
      await fetchArticles();
      return true;
    } catch (error) {
      console.error('Error deleting article:', error);
      toast({
        title: "Error",
        description: "Failed to delete article",
        variant: "destructive"
      });
      return false;
    }
  };

  useEffect(() => {
    fetchArticles();
  }, []);

  return { articles, loading, fetchArticles, deleteArticle };
};

const useArticleContent = () => {
  const [selectedArticle, setSelectedArticle] = useState<ArticleContent | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchArticleContent = async (filename: string) => {
    setLoading(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/research-articles/${filename}`);
      if (!response.ok) throw new Error('Failed to fetch article content');
      
      const data = await response.json();
      const { processedContent, citations } = processCitations(data.content);
      
      setSelectedArticle({
        ...data,
        processedContent,
        citations
      });
    } catch (error) {
      console.error('Error fetching article content:', error);
      toast({
        title: "Error",
        description: "Failed to load article content",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const clearSelectedArticle = () => setSelectedArticle(null);

  return { selectedArticle, loading, fetchArticleContent, clearSelectedArticle };
};

// Components
const CitationButton: React.FC<{
  citation: Citation;
  onClick: () => void;
}> = ({ citation, onClick }) => (
  <Button
    variant="link"
    size="sm"
    onClick={onClick}
    className="p-0 h-auto text-blue-600 hover:text-blue-800 underline font-normal align-super text-sm inline-flex items-center gap-1"
    title={`View ${citation.displayName}`}
  >
    {citation.footnoteNumber}
    <ExternalLink className="w-2 h-2" />
  </Button>
);

const ReferencedDocuments: React.FC<{
  citations: Citation[];
  onViewPdf: (citationId: string) => void;
}> = ({ citations, onViewPdf }) => {
  if (citations.length === 0) return null;

  return (
    <div className="mt-8 pt-6 border-t border-slate-200">
      <h3 className="text-lg font-semibold text-slate-800 mb-4">Referenced Documents</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {citations.map((citation) => (
          <Card key={citation.id} className="p-3 hover:bg-slate-50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {citation.footnoteNumber}
                </Badge>
                <span className="text-sm font-medium text-slate-700">
                  {citation.displayName}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onViewPdf(citation.id)}
                className="ml-2"
              >
                <Eye className="w-4 h-4 mr-1" />
                View
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

const ArticleActions: React.FC<{
  article: ArticleContent;
  onCopy: () => void;
  onExport: () => void;
  onDelete: () => void;
}> = ({ article, onCopy, onExport, onDelete }) => (
  <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200">
    <div className="flex items-center space-x-4 text-sm text-slate-500">
      <span>{new Date(article.metadata.generated).toLocaleDateString()}</span>
      <span>{article.metadata.documents_analyzed} documents</span>
    </div>
    
    <div className="flex space-x-2">
      <Button variant="outline" size="sm" onClick={onCopy}>
        <Copy className="w-3 h-3 mr-1" />
        Copy
      </Button>
      <Button variant="outline" size="sm" onClick={onExport}>
        <Download className="w-3 h-3 mr-1" />
        Export
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onDelete}
        className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-300"
      >
        <Trash2 className="w-3 h-3 mr-1" />
        Delete
      </Button>
    </div>
  </div>
);

// Main component
const SummarizationTab: React.FC<SummarizationTabProps> = ({
  uploadedFiles,
  setSelectedPdf,
  switchToViewerTab
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const { toast } = useToast();
  
  const { articles, loading, fetchArticles, deleteArticle } = useArticles();
  const { selectedArticle, loading: loadingArticle, fetchArticleContent, clearSelectedArticle } = useArticleContent();

  // Filter articles based on search term
  const filteredArticles = useMemo(() => 
    articles.filter(article =>
      article.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      article.query.toLowerCase().includes(searchTerm.toLowerCase()) ||
      article.preview.toLowerCase().includes(searchTerm.toLowerCase())
    ), [articles, searchTerm]
  );

  const handleViewPdf = async (citationId: string) => {
    try {
      const timestamp = extractTimestampFromCitationId(citationId);
      if (!timestamp) {
        toast({
          title: "Error",
          description: "Invalid citation format",
          variant: "destructive"
        });
        return;
      }

      // Get list of uploaded files
      const filesResponse = await fetch(`${getApiBaseUrl()}/files`);
      if (!filesResponse.ok) throw new Error('Failed to fetch files');
      
      const filesData = await filesResponse.json();
      const files = filesData.files || [];
      
      // Try direct timestamp match first
      let matchingFile = files.find((file: any) => 
        file.filename.startsWith(timestamp) && file.filename.endsWith('.pdf')
      );

      // If no direct match, try to find via task status data
      if (!matchingFile) {
        try {
          const statusResponse = await fetch(`${getApiBaseUrl()}/status`);
          if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            console.log('🔍 Looking for task with citation ID:', citationId);
            
            // Look for a task with matching citation ID
            const matchingTask = statusData.tasks?.find((task: any) => {
              const taskId = task.id || '';
              console.log('🔍 Checking task:', taskId, 'against citation:', citationId);
              return taskId.includes(citationId) || citationId.includes(taskId);
            });
            
            if (matchingTask) {
              console.log('✅ Found matching task:', matchingTask.id, 'filename:', matchingTask.filename);
              
              // Try to find file by the task's original filename
              if (matchingTask.filename) {
                matchingFile = files.find((file: any) => 
                  file.filename === matchingTask.filename && file.filename.endsWith('.pdf')
                );
                console.log('🎯 File match by filename:', matchingFile?.filename || 'NO MATCH');
              }
              
              // If still no match, try using inferredTimestamp from task result metadata
              if (!matchingFile) {
                const inferredTimestamp = matchingTask.result?.metadata?.inferredTimestamp;
                if (inferredTimestamp) {
                  console.log('🔍 Trying inferredTimestamp:', inferredTimestamp);
                  const inferredDate = new Date(inferredTimestamp);
                  const inferredTimestampMs = inferredDate.getTime().toString();
                  
                  // Try to find file with inferred timestamp
                  matchingFile = files.find((file: any) => 
                    file.filename.startsWith(inferredTimestampMs) && file.filename.endsWith('.pdf')
                  );
                  console.log('🎯 File match by inferredTimestamp:', matchingFile?.filename || 'NO MATCH');
                }
              }
              
              // If still no match, try using the task's TimeStamp
              if (!matchingFile && matchingTask.TimeStamp) {
                console.log('🔍 Trying task TimeStamp:', matchingTask.TimeStamp);
                matchingFile = files.find((file: any) => 
                  file.filename.startsWith(matchingTask.TimeStamp) && file.filename.endsWith('.pdf')
                );
                console.log('🎯 File match by TimeStamp:', matchingFile?.filename || 'NO MATCH');
              }
            } else {
              console.log('❌ No matching task found for citation:', citationId);
            }
          }
        } catch (statusError) {
          console.warn('Failed to fetch status data for PDF matching:', statusError);
        }
      }

      // If still no match, try to find the closest timestamp match
      if (!matchingFile && timestamp.length >= 10) {
        console.log('🔍 Trying closest timestamp match for:', timestamp);
        
        // Extract timestamps from all PDF files and find the closest one
        const timestampNumber = parseInt(timestamp);
        let closestFile = null;
        let closestDiff = Infinity;
        
        files.forEach((file: any) => {
          if (file.filename.endsWith('.pdf')) {
            const match = file.filename.match(/^(\d+)-/);
            if (match) {
              const fileTimestamp = parseInt(match[1]);
              const diff = Math.abs(timestampNumber - fileTimestamp);
              console.log(`📊 File ${file.filename} timestamp: ${fileTimestamp}, diff: ${diff}`);
              
              if (diff < closestDiff) {
                closestDiff = diff;
                closestFile = file;
              }
            }
          }
        });
        
        if (closestFile && closestDiff < 1000) { // Only match if difference is reasonable
          matchingFile = closestFile;
          console.log('🎯 Closest match found:', matchingFile.filename, 'with diff:', closestDiff);
        } else {
          console.log('🔍 No close timestamp match found (min diff:', closestDiff, ')');
        }
      }

      if (!matchingFile) {
        toast({
          title: "PDF Not Found",
          description: `No PDF found for citation ${citationId} (timestamp: ${timestamp})`,
          variant: "destructive"
        });
        return;
      }

      setSelectedPdf(matchingFile.filename);
      switchToViewerTab();
      
      toast({
        title: "Opening PDF",
        description: `Viewing ${matchingFile.filename}`,
      });
    } catch (error) {
      console.error('Error viewing PDF:', error);
      toast({
        title: "Error",
        description: "Failed to open PDF",
        variant: "destructive"
      });
    }
  };

  const handleCopyArticle = () => {
    if (!selectedArticle) return;
    
    navigator.clipboard.writeText(selectedArticle.content);
    toast({
      title: "Article copied",
      description: "Content copied to clipboard"
    });
  };

  const handleExportArticle = () => {
    if (!selectedArticle) return;
    
    const blob = new Blob([selectedArticle.rawContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedArticle.metadata.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Export complete",
      description: `Article exported as ${a.download}`
    });
  };

  const handleDeleteArticle = async () => {
    if (!selectedArticle) return;
    
    const success = await deleteArticle(selectedArticle.filename, selectedArticle.metadata.title);
    if (success) {
      clearSelectedArticle();
    }
  };

  // Create markdown components with citation handling
  const createMarkdownComponents = (citations: Citation[]): Components => {
    const citationMap = new Map(citations.map(c => [c.footnoteNumber, c]));
    
    return {
      p: ({ children, ...props }) => {
        const processedChildren = React.Children.map(children, (child) => {
          if (typeof child === 'string') {
            const footnoteRegex = /\[\^(\d+)\]/g;
            const parts = [];
            let lastIndex = 0;
            let match;
            
            while ((match = footnoteRegex.exec(child)) !== null) {
              if (match.index > lastIndex) {
                parts.push(child.slice(lastIndex, match.index));
              }
              
              const footnoteNumber = parseInt(match[1]);
              const citation = citationMap.get(footnoteNumber);
              
              if (citation) {
                parts.push(
                  <CitationButton
                    key={`citation-${footnoteNumber}`}
                    citation={citation}
                    onClick={() => handleViewPdf(citation.id)}
                  />
                );
              } else {
                parts.push(match[0]);
              }
              
              lastIndex = match.index + match[0].length;
            }
            
            if (lastIndex < child.length) {
              parts.push(child.slice(lastIndex));
            }
            
            return parts.length > 1 ? <>{parts}</> : child;
          }
          return child;
        });
        
        return <p {...props}>{processedChildren}</p>;
      },
      
      sup: ({ children, ...props }) => {
        const textContent = React.Children.toArray(children).join('');
        const footnoteMatch = textContent.match(/^(\d+)$/);
        
        if (footnoteMatch) {
          const footnoteNumber = parseInt(footnoteMatch[1]);
          const citation = citationMap.get(footnoteNumber);
          
          if (citation) {
            return (
              <CitationButton
                citation={citation}
                onClick={() => handleViewPdf(citation.id)}
              />
            );
          }
        }
        
        return <sup {...props}>{children}</sup>;
      }
    };
  };

  if (loading && articles.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center">
          <RefreshCw className="w-16 h-16 text-slate-300 mx-auto mb-4 animate-spin" />
          <h3 className="text-lg font-medium text-slate-600 mb-2">Loading Research Articles</h3>
          <p className="text-slate-500">Fetching articles...</p>
        </div>
      </div>
    );
  }

  if (articles.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center">
          <BookOpen className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-600 mb-2">No Research Articles Found</h3>
          <p className="text-slate-500 mb-4">Run a Deep Research agent to generate articles</p>
          <Button onClick={fetchArticles} variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full">
      <ResizablePanelGroup direction="horizontal" className="h-full">
        {/* Left Panel - Article List */}
        <ResizablePanel defaultSize={35} minSize={25}>
          <div className="h-full p-4 border-r border-slate-200">
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold text-slate-800">Research Articles</h3>
                <Button onClick={fetchArticles} variant="outline" size="sm" disabled={loading}>
                  <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
              <p className="text-sm text-slate-600 mb-4">
                {articles.length} articles available
              </p>
              
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input
                  placeholder="Search articles..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <ScrollArea className="h-[calc(100%-140px)]">
              <div className="space-y-2">
                {filteredArticles.map((article) => (
                  <Card 
                    key={article.filename}
                    className={`p-3 cursor-pointer transition-colors hover:bg-slate-50 ${
                      selectedArticle?.filename === article.filename 
                        ? 'ring-2 ring-blue-500 bg-blue-50' 
                        : ''
                    }`}
                    onClick={() => fetchArticleContent(article.filename)}
                  >
                    <div className="flex items-start space-x-3">
                      <File className="w-4 h-4 text-slate-400 mt-1 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <h4 className="font-medium text-slate-900 text-sm truncate">
                          {article.title}
                        </h4>
                        <p className="text-xs text-slate-500 truncate mt-1">
                          {article.preview}...
                        </p>
                        <div className="flex items-center space-x-3 mt-2 text-xs text-slate-400">
                          <div className="flex items-center">
                            <Clock className="w-3 h-3 mr-1" />
                            <span>{new Date(article.generated).toLocaleDateString()}</span>
                          </div>
                          <span>{article.documentsAnalyzed} docs</span>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              {filteredArticles.length === 0 && searchTerm && (
                <div className="text-center py-8">
                  <Search className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-slate-500 text-sm">No articles found matching "{searchTerm}"</p>
                </div>
              )}
            </ScrollArea>
          </div>
        </ResizablePanel>

        <ResizableHandle />

        {/* Right Panel - Article Content */}
        <ResizablePanel defaultSize={65}>
          <div className="h-full p-6">
            {!selectedArticle ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-slate-600 mb-2">Select an Article</h3>
                  <p className="text-slate-500">Choose a research article to view its content</p>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col">
                <ArticleActions
                  article={selectedArticle}
                  onCopy={handleCopyArticle}
                  onExport={handleExportArticle}
                  onDelete={handleDeleteArticle}
                />

                {loadingArticle ? (
                  <div className="flex-1 flex items-center justify-center">
                    <RefreshCw className="w-8 h-8 text-slate-300 animate-spin" />
                  </div>
                ) : (
                  <ScrollArea className="flex-1">
                    <div className="max-w-none">
                      <article className="prose prose-lg prose-gray max-w-none prose-headings:text-gray-900 prose-h1:text-3xl prose-h1:font-bold prose-h1:mb-6 prose-h1:mt-0 prose-h1:pb-3 prose-h1:border-b prose-h1:border-gray-200">
                        <ReactMarkdown 
                          remarkPlugins={[remarkGfm]}
                          components={createMarkdownComponents(selectedArticle.citations)}
                        >
                          {selectedArticle.processedContent}
                        </ReactMarkdown>
                      </article>
                      
                      <ReferencedDocuments
                        citations={selectedArticle.citations}
                        onViewPdf={handleViewPdf}
                      />
                    </div>
                  </ScrollArea>
                )}
              </div>
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};

export default SummarizationTab;