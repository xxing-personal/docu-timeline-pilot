
import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, MessageCircle, Eye } from 'lucide-react';
import PdfsTab from './PdfsTab';
import ChatTab from './ChatTab';
import PdfViewerTab from './PdfViewerTab';

interface LeftPaneProps {
  selectedPdf: string | null;
  setSelectedPdf: (pdf: string | null) => void;
  uploadedFiles: File[];
  setUploadedFiles: (files: File[]) => void;
}

const LeftPane = ({ selectedPdf, setSelectedPdf, uploadedFiles, setUploadedFiles }: LeftPaneProps) => {
  const [activeTab, setActiveTab] = useState('pdfs');

  return (
    <div className="h-full bg-white border-r border-slate-200 shadow-sm">
      <div className="p-6 border-b border-slate-200">
        <h1 className="text-2xl font-bold text-slate-800 mb-2">PDF Processor</h1>
        <p className="text-sm text-slate-600">Sequential document analysis</p>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="h-[calc(100%-120px)]">
        <TabsList className="grid w-full grid-cols-3 m-4 mb-0">
          <TabsTrigger value="pdfs" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            PDFs
          </TabsTrigger>
          <TabsTrigger value="chat" className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4" />
            Chat
          </TabsTrigger>
          <TabsTrigger value="viewer" className="flex items-center gap-2">
            <Eye className="w-4 h-4" />
            Viewer
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="pdfs" className="h-full m-0">
          <PdfsTab 
            uploadedFiles={uploadedFiles}
            setUploadedFiles={setUploadedFiles}
            selectedPdf={selectedPdf}
            setSelectedPdf={setSelectedPdf}
          />
        </TabsContent>
        
        <TabsContent value="chat" className="h-full m-0">
          <ChatTab uploadedFiles={uploadedFiles} />
        </TabsContent>
        
        <TabsContent value="viewer" className="h-full m-0">
          <PdfViewerTab selectedPdf={selectedPdf} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default LeftPane;
