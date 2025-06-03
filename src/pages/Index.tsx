
import React, { useState } from 'react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import LeftPane from '@/components/LeftPane';
import RightPane from '@/components/RightPane';

const Index = () => {
  const [selectedPdf, setSelectedPdf] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <ResizablePanelGroup direction="horizontal" className="min-h-screen">
        <ResizablePanel defaultSize={38} minSize={30} maxSize={50}>
          <LeftPane 
            selectedPdf={selectedPdf}
            setSelectedPdf={setSelectedPdf}
            uploadedFiles={uploadedFiles}
            setUploadedFiles={setUploadedFiles}
          />
        </ResizablePanel>
        <ResizableHandle className="w-2 bg-slate-200 hover:bg-slate-300 transition-colors" />
        <ResizablePanel defaultSize={62} minSize={50}>
          <RightPane 
            selectedPdf={selectedPdf}
            uploadedFiles={uploadedFiles}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};

export default Index;
