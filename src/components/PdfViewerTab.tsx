
import React from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, ZoomIn, ZoomOut, Download, Search, RotateCw } from 'lucide-react';
import { Input } from "@/components/ui/input";

interface PdfViewerTabProps {
  selectedPdf: string | null;
}

const PdfViewerTab = ({ selectedPdf }: PdfViewerTabProps) => {
  if (!selectedPdf) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center">
          <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-600 mb-2">No PDF Selected</h3>
          <p className="text-slate-500">Select a PDF from the PDFs tab to view it here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="p-4 border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-slate-800 truncate">{selectedPdf}</h3>
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Download
          </Button>
        </div>
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1">
            <Button variant="outline" size="sm">
              <ZoomOut className="w-4 h-4" />
            </Button>
            <span className="text-sm text-slate-600 px-2">100%</span>
            <Button variant="outline" size="sm">
              <ZoomIn className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex items-center space-x-1">
            <span className="text-sm text-slate-600">Page</span>
            <Input className="w-16 h-8 text-center" defaultValue="1" />
            <span className="text-sm text-slate-600">of 1</span>
          </div>
          <div className="flex items-center space-x-1">
            <Button variant="outline" size="sm">
              <RotateCw className="w-4 h-4" />
            </Button>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-slate-400" />
              <Input placeholder="Search in PDF..." className="pl-7 h-8 w-32" />
            </div>
          </div>
        </div>
      </div>

      {/* PDF Viewer Area */}
      <div className="flex-1 bg-slate-100 flex items-center justify-center p-8">
        <Card className="w-full max-w-2xl h-full bg-white shadow-lg flex items-center justify-center">
          <div className="text-center">
            <FileText className="w-24 h-24 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-600 mb-2">PDF Viewer</h3>
            <p className="text-slate-500 max-w-md">
              This is a placeholder for the PDF viewer. In a real implementation, 
              you would integrate a PDF.js viewer or similar library to display the actual PDF content.
            </p>
            <p className="text-sm text-slate-400 mt-4">Currently viewing: {selectedPdf}</p>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default PdfViewerTab;
