import React, { useState, useEffect } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Download, Eye, Search, FileText, RefreshCw, Clock, BookOpen, File, Trash2 } from 'lucide-react';
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { getApiBaseUrl } from "@/lib/utils";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
}

const SummarizationTab = ({ uploadedFiles, setSelectedPdf, switchToViewerTab }: SummarizationTabProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [articles, setArticles] = useState<ResearchArticle[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<ArticleContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingArticle, setLoadingArticle] = useState(false);
  const { toast } = useToast();

  const processCitations = (markdownContent: string | undefined | null): string => {
    if (!markdownContent) return '';

    // Regex to find custom citations - handles multiple formats:
    // [^article_id(some_id_123)], [^article_id_map["some_id_123"]], and [^article_id_1752774703894]
    const citationRegex = /\[\^article_id(?:_map\["([^"]+)"\]|\(([^)]+)\)|_(\d+))\]/g;
    
    // A map to store unique citation IDs and their assigned footnote number
    const citations = new Map<string, number>();
    let citationCounter = 1;

    // First pass to find all unique citations.
    // This ensures that repeated citations get the same number.
    const contentToScan = markdownContent;
    let match;
    while ((match = citationRegex.exec(contentToScan)) !== null) {
      // Extract citation ID from any format (group 1 for _map[""], group 2 for (), group 3 for _timestamp)
      const citationId = match[1] || match[2] || match[3];
      if (!citations.has(citationId)) {
        citations.set(citationId, citationCounter++);
      }
    }

    // If there are no citations, we don't need to do anything.
    if (citations.size === 0) {
      return markdownContent;
    }

    // Replace each custom citation with a standard footnote reference
    let processedContent = markdownContent.replace(citationRegex, (_match, citationId1, citationId2, citationId3) => {
      const citationId = citationId1 || citationId2 || citationId3;
      const footnoteNumber = citations.get(citationId);
      // Keep standard footnote format for proper markdown rendering
      return `[^${footnoteNumber}]`;
    });

    // Remove duplicate citation markers from references section
    // This removes patterns like [^article_id_map["..."]] that appear after web links
    processedContent = processedContent.replace(/\[Link to document\]\([^)]+\)\s*\[\^article_id(?:_map\["([^"]+)"\]|\(([^)]+)\)|_(\d+))\]/g, (match, citationId1, citationId2, citationId3) => {
      const citationId = citationId1 || citationId2 || citationId3;
      const footnoteNumber = citations.get(citationId);
      // Replace the entire "Link to document + citation" with just a clickable reference
      return `[📄 View Document](pdf-link:${citationId})`;
    });

    // Append the footnote definitions at the end of the article.
    processedContent += '\n\n---\n\n## Footnotes\n\n';
    
    for (const [citationId, footnoteNumber] of citations.entries()) {
      // Create clickable footnote with a more descriptive name
      let displayName: string;
      if (citationId.startsWith('pdf_')) {
        displayName = citationId.replace(/^pdf_\d+_/, ''); // Remove pdf_ prefix and timestamp
      } else if (/^\d+$/.test(citationId)) {
        displayName = `Document ${citationId}`;
      } else {
        displayName = citationId;
      }
      processedContent += `[^${footnoteNumber}]: [📄 ${displayName}](pdf-link:${citationId})\n\n`;
    }

    return processedContent;
  };

  // Handle PDF link clicks
  const handlePdfLinkClick = async (citationId: string) => {
    try {
      // Extract the timestamp from citation ID 
      // Handles formats: pdf_1752774703896_xir2ydzhs -> 1752774703896, or just 1752774703896
      let timestamp: string;
      
      if (citationId.startsWith('pdf_')) {
        const timestampMatch = citationId.match(/pdf_(\d+)_/);
        if (!timestampMatch) {
          toast({
            title: "Error",
            description: "Could not extract timestamp from citation ID",
            variant: "destructive"
          });
          return;
        }
        timestamp = timestampMatch[1];
      } else if (/^\d+$/.test(citationId)) {
        // Citation ID is just the timestamp
        timestamp = citationId;
      } else {
        toast({
          title: "Error",
          description: "Unrecognized citation ID format",
          variant: "destructive"
        });
        return;
      }
      
      // Get list of uploaded files to find the matching PDF
      const response = await fetch(`${getApiBaseUrl()}/files`);
      if (!response.ok) {
        throw new Error('Failed to fetch file list');
      }
      
      const data = await response.json();
      const files = data.files || [];
      
      // Find the PDF file that starts with the timestamp
      const matchingFile = files.find((file: any) => 
        file.filename.startsWith(timestamp) && file.filename.endsWith('.pdf')
      );
      
      if (!matchingFile) {
        console.error('PDF file not found:', {
          citationId,
          timestamp,
          availableFiles: files.map((f: any) => f.filename)
        });
        toast({
          title: "PDF Not Found",
          description: `No PDF file found for citation ${citationId}. Available files: ${files.length}`,
          variant: "destructive"
        });
        return;
      }
      
      console.log('Opening PDF:', {
        citationId,
        timestamp,
        matchingFile: matchingFile.filename
      });
      
      // Set the selected PDF and switch to viewer tab (keep right panel on summaries)
      setSelectedPdf(matchingFile.filename);
      switchToViewerTab();
      
      toast({
        title: "Opening PDF",
        description: `Switching to viewer for ${matchingFile.filename}. Right panel stays on Summary tab.`,
      });
      
    } catch (error) {
      console.error('Error handling PDF link click:', error);
      toast({
        title: "Error",
        description: "Failed to open PDF. Please try again.",
        variant: "destructive"
      });
    }
  };

  // Custom renderer for ReactMarkdown to handle PDF links
  const customComponents = {
    a: ({ href, children, ...props }: any) => {
      // Check if this is a PDF link
      if (href && href.startsWith('pdf-link:')) {
        const citationId = href.replace('pdf-link:', '');
        return (
          <button
            onClick={() => handlePdfLinkClick(citationId)}
            className="text-blue-600 hover:text-blue-800 underline cursor-pointer bg-transparent border-none p-0 font-inherit inline"
            {...props}
          >
            {children}
          </button>
        );
      }
      // Regular links
      return <a href={href} {...props}>{children}</a>;
    },
  };

  // Fetch research articles from local folder
  const fetchArticles = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/research-articles`);
      if (!response.ok) {
        throw new Error('Failed to fetch research articles');
      }
      
      const data = await response.json();
      setArticles(data.articles || []);
    } catch (error) {
      console.error('Error fetching research articles:', error);
      toast({
        title: "Error",
        description: "Failed to fetch research articles. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Fetch specific article content
  const fetchArticleContent = async (filename: string) => {
    setLoadingArticle(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/research-articles/${filename}`);
      if (!response.ok) {
        throw new Error('Failed to fetch article content');
      }
      
      const data = await response.json();
      data.content = processCitations(data.content);
      setSelectedArticle(data);
    } catch (error) {
      console.error('Error fetching article content:', error);
      toast({
        title: "Error",
        description: "Failed to load article content.",
        variant: "destructive"
      });
    } finally {
      setLoadingArticle(false);
    }
  };

  useEffect(() => {
    fetchArticles();
  }, []);

  const copyToClipboard = (text: string, title: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Article copied",
      description: `Research article "${title}" copied to clipboard.`
    });
  };

  const exportArticle = (content: string, title: string) => {
    const blob = new Blob([content], { type: 'text/markdown' });
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

  const deleteArticle = async (filename: string, title: string) => {
    const confirmed = window.confirm(`Are you sure you want to delete the article "${title}"? This action cannot be undone.`);
    
    if (!confirmed) return;
    
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/research-articles/${filename}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete article');
      }
      
      toast({
        title: "Article deleted",
        description: `Research article "${title}" has been deleted successfully.`
      });
      
      // Clear selected article if it was the one being deleted
      if (selectedArticle?.filename === filename) {
        setSelectedArticle(null);
      }
      
      // Refresh the articles list
      fetchArticles();
    } catch (error) {
      console.error('Error deleting article:', error);
      toast({
        title: "Error",
        description: "Failed to delete the article. Please try again.",
        variant: "destructive"
      });
    }
  };

  const refreshResults = () => {
    fetchArticles();
    toast({
      title: "Refreshed",
      description: "Research articles have been refreshed."
    });
  };

  // Filter articles based on search term
  const filteredArticles = articles.filter(article =>
    article.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    article.query.toLowerCase().includes(searchTerm.toLowerCase()) ||
    article.preview.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading && articles.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center">
          <RefreshCw className="w-16 h-16 text-slate-300 mx-auto mb-4 animate-spin" />
          <h3 className="text-lg font-medium text-slate-600 mb-2">Loading Research Articles</h3>
          <p className="text-slate-500">Fetching articles from local storage...</p>
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
    <div className="h-full">
      <ResizablePanelGroup direction="horizontal" className="h-full">
        {/* Left Panel - File Browser */}
        <ResizablePanel defaultSize={35} minSize={25}>
          <div className="h-full p-4 border-r border-slate-200">
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold text-slate-800">Research Articles</h3>
                <Button onClick={refreshResults} variant="outline" size="sm" disabled={loading}>
                  <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
              <p className="text-sm text-slate-600 mb-4">
                Local markdown files ({articles.length} available)
              </p>
              
              {/* Search */}
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
                      selectedArticle?.filename === article.filename ? 'ring-2 ring-blue-500 bg-blue-50' : ''
                    }`}
                    onClick={() => fetchArticleContent(article.filename)}
                  >
                    <div className="flex items-start space-x-3">
                      <File className="w-4 h-4 text-slate-400 mt-1 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <h4 className="font-medium text-slate-900 text-sm truncate">{article.title}</h4>
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
                  <p className="text-slate-500">Choose a research article from the left panel to view its content</p>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col">
                {/* Minimal Article Header */}
                <div className="mb-4 pb-3 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center space-x-4 text-sm text-slate-500">
                    <span>{new Date(selectedArticle.metadata.generated).toLocaleDateString()}</span>
                    <span>{selectedArticle.metadata.documents_analyzed} documents</span>
                  </div>
                  
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(selectedArticle.content, selectedArticle.metadata.title)}
                    >
                      <Copy className="w-3 h-3 mr-1" />
                      Copy
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => exportArticle(selectedArticle.rawContent, selectedArticle.metadata.title)}
                    >
                      <Download className="w-3 h-3 mr-1" />
                      Export
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deleteArticle(selectedArticle.filename, selectedArticle.metadata.title)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-300"
                    >
                      <Trash2 className="w-3 h-3 mr-1" />
                      Delete
                    </Button>
                  </div>
                </div>

                {/* Article Content */}
                {loadingArticle ? (
                  <div className="flex-1 flex items-center justify-center">
                    <RefreshCw className="w-8 h-8 text-slate-300 animate-spin" />
                  </div>
                ) : (
                  <ScrollArea className="flex-1">
                    <div className="max-w-none">
                      <article className="prose prose-lg prose-gray max-w-none prose-headings:text-gray-900 prose-h1:text-3xl prose-h1:font-bold prose-h1:mb-6 prose-h1:mt-0 prose-h1:pb-3 prose-h1:border-b prose-h1:border-gray-200">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={customComponents}>{selectedArticle.content}</ReactMarkdown>
                      </article>
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
