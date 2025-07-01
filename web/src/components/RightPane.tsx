import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, FileText, BarChart2, Sparkles } from 'lucide-react';
import TimelineTab from './TimelineTab';
import SummarizationTab from './SummarizationTab';
import AnalysisTab from './AnalysisTab';
import AgentTab from './AgentTab';

interface RightPaneProps {
  selectedPdf: string | null;
  uploadedFiles: File[];
  setSelectedPdf: (pdf: string | null) => void;
  switchToViewerTab: () => void;
}

const RightPane = ({ selectedPdf, uploadedFiles, setSelectedPdf, switchToViewerTab }: RightPaneProps) => {
  const [activeTab, setActiveTab] = useState('timeline');

  return (
    <div className="h-full bg-gradient-to-br from-slate-50 to-white">
      <div className="p-6 border-b border-slate-200 bg-white/80 backdrop-blur-sm">
        <h2 className="text-xl font-semibold text-slate-800 mb-1">Analysis Dashboard</h2>
        <p className="text-sm text-slate-600">Document insights and timeline</p>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="h-[calc(100%-100px)]">
        <TabsList className="m-4 mb-0">
          <TabsTrigger value="timeline" className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Timeline
          </TabsTrigger>
          <TabsTrigger value="analysis" className="flex items-center gap-2">
            <BarChart2 className="w-4 h-4" />
            Analysis
          </TabsTrigger>
          <TabsTrigger value="agent" className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            Agent
          </TabsTrigger>
          <TabsTrigger value="summaries" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Summaries
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="timeline" className="h-full m-0 overflow-y-auto">
          <TimelineTab uploadedFiles={uploadedFiles} selectedPdf={selectedPdf} setSelectedPdf={setSelectedPdf} switchToViewerTab={switchToViewerTab} />
        </TabsContent>
        
        <TabsContent value="analysis" className="h-full m-0 overflow-y-auto">
          <AnalysisTab />
        </TabsContent>
        
        <TabsContent value="agent" className="h-full m-0 overflow-y-auto">
          <AgentTab uploadedFiles={uploadedFiles} />
        </TabsContent>
        
        <TabsContent value="summaries" className="h-full m-0 overflow-y-auto">
          <SummarizationTab uploadedFiles={uploadedFiles} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default RightPane;
