
import React, { useState } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Copy, Download, Eye, Search, FileText } from 'lucide-react';
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";

interface SummarizationTabProps {
  uploadedFiles: File[];
}

const SummarizationTab = ({ uploadedFiles }: SummarizationTabProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const { toast } = useToast();

  const generateSampleSummary = (fileName: string) => {
    const summaries = [
      "This document outlines a comprehensive project proposal for implementing a new customer management system. Key highlights include budget allocation of $150,000, timeline of 6 months, and expected ROI of 25%. The proposal emphasizes improved customer satisfaction and operational efficiency.",
      "A detailed analysis of market trends in Q3 2024, showing significant growth in digital transformation initiatives. The report identifies three major opportunities for expansion and recommends strategic partnerships to capitalize on emerging technologies.",
      "Technical specifications for the new software architecture, including microservices design patterns, cloud deployment strategies, and security protocols. The document covers scalability requirements and integration with existing systems.",
      "Financial report summarizing quarterly performance with revenue growth of 12% year-over-year. Key metrics include customer acquisition costs, retention rates, and profit margins across different business segments."
    ];
    return summaries[uploadedFiles.findIndex(f => f.name === fileName) % summaries.length];
  };

  const copyToClipboard = (text: string, fileName: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Summary copied",
      description: `Summary for ${fileName} copied to clipboard.`
    });
  };

  const exportSummary = (fileName: string) => {
    toast({
      title: "Export initiated",
      description: `Exporting summary for ${fileName}...`
    });
  };

  const processedFiles = uploadedFiles.filter((_, index) => index % 2 === 0); // Simulate some files being processed

  if (processedFiles.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center">
          <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-600 mb-2">No Summaries Available</h3>
          <p className="text-slate-500">Upload and process some PDFs to see their summaries here</p>
        </div>
      </div>
    );
  }

  const filteredFiles = processedFiles.filter(file =>
    file.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    generateSampleSummary(file.name).toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="h-full p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-2">Document Summaries</h3>
        <p className="text-sm text-slate-600 mb-4">AI-generated summaries of your processed documents</p>
        
        {/* Global Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
          <Input
            placeholder="Search across all summaries..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <ScrollArea className="h-[calc(100%-160px)]">
        <Accordion type="multiple" className="space-y-4">
          {filteredFiles.map((file, index) => {
            const summary = generateSampleSummary(file.name);
            return (
              <AccordionItem key={index} value={`item-${index}`} className="border-none">
                <Card className="overflow-hidden">
                  <AccordionTrigger className="px-6 py-4 hover:no-underline hover:bg-slate-50 transition-colors">
                    <div className="flex items-center space-x-3 text-left">
                      <FileText className="w-5 h-5 text-red-500 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <h4 className="font-medium text-slate-900 truncate">{file.name}</h4>
                        <p className="text-sm text-slate-500 truncate">
                          {summary.substring(0, 80)}...
                        </p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-6 pb-4">
                    <div className="space-y-4">
                      <div className="bg-slate-50 rounded-lg p-4">
                        <h5 className="font-medium text-slate-900 mb-2">Summary</h5>
                        <p className="text-slate-700 leading-relaxed">{summary}</p>
                      </div>
                      
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(summary, file.name)}
                        >
                          <Copy className="w-3 h-3 mr-1" />
                          Copy Summary
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => exportSummary(file.name)}
                        >
                          <Download className="w-3 h-3 mr-1" />
                          Export
                        </Button>
                        <Button variant="outline" size="sm">
                          <Eye className="w-3 h-3 mr-1" />
                          View Original
                        </Button>
                      </div>
                      
                      <div className="text-xs text-slate-500 pt-2 border-t border-slate-200">
                        Generated on {new Date().toLocaleDateString()} • 
                        Processing time: 2.3s • 
                        Confidence: 94%
                      </div>
                    </div>
                  </AccordionContent>
                </Card>
              </AccordionItem>
            );
          })}
        </Accordion>

        {filteredFiles.length === 0 && searchTerm && (
          <div className="text-center py-8">
            <Search className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">No summaries found matching "{searchTerm}"</p>
          </div>
        )}
      </ScrollArea>
    </div>
  );
};

export default SummarizationTab;
