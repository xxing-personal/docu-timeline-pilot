import React, { useState, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, ZoomIn, ZoomOut, Download, Search, RotateCw, ChevronLeft, ChevronRight, Loader2, AlertCircle } from 'lucide-react';
import { Input } from "@/components/ui/input";
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import { getApiBaseUrl } from "@/lib/utils";

// Configure PDF.js worker - use local worker file
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

interface PdfViewerTabProps {
  selectedPdf: string | null;
}

const PdfViewerTab = ({ selectedPdf }: PdfViewerTabProps) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [rotation, setRotation] = useState<number>(0);
  const [searchText, setSearchText] = useState<string>('');
  const [pageInput, setPageInput] = useState<string>('1');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const API_BASE_URL = getApiBaseUrl();

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setPageNumber(1);
    setPageInput('1');
    setError(null);
    setLoading(false);
  }, []);

  const onDocumentLoadError = useCallback((error: Error) => {
    console.error('PDF load error:', error);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    setError(`Failed to load PDF document: ${error.message}`);
    setLoading(false);
  }, []);

  const onLoadStart = useCallback(() => {
    setLoading(true);
    setError(null);
  }, []);

  const changePage = (offset: number) => {
    const newPageNumber = pageNumber + offset;
    if (newPageNumber >= 1 && newPageNumber <= numPages) {
      setPageNumber(newPageNumber);
      setPageInput(newPageNumber.toString());
    }
  };

  const goToPage = (page: number) => {
    if (page >= 1 && page <= numPages) {
      setPageNumber(page);
      setPageInput(page.toString());
    }
  };

  const handlePageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPageInput(e.target.value);
  };

  const handlePageInputKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const page = parseInt(pageInput);
      if (!isNaN(page)) {
        goToPage(page);
      } else {
        setPageInput(pageNumber.toString());
      }
    }
  };

  const handlePageInputBlur = () => {
    const page = parseInt(pageInput);
    if (!isNaN(page)) {
      goToPage(page);
    } else {
      setPageInput(pageNumber.toString());
    }
  };

  const zoomIn = () => {
    setScale(prev => Math.min(prev + 0.25, 3.0));
  };

  const zoomOut = () => {
    setScale(prev => Math.max(prev - 0.25, 0.5));
  };

  const rotate = () => {
    setRotation(prev => (prev + 90) % 360);
  };

  const downloadPdf = () => {
    if (selectedPdf) {
      // Create a download link for the PDF
      const link = document.createElement('a');
      link.href = `${API_BASE_URL}/files/${encodeURIComponent(selectedPdf)}`;
      link.download = selectedPdf;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

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

  const pdfUrl = `${API_BASE_URL}/files/${encodeURIComponent(selectedPdf)}`;
  
  // Debug logging
  console.log('PDF URL:', pdfUrl);
  console.log('Selected PDF:', selectedPdf);

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="p-4 border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-slate-800 truncate">{selectedPdf}</h3>
          <Button variant="outline" size="sm" onClick={downloadPdf}>
            <Download className="w-4 h-4 mr-2" />
            Download
          </Button>
        </div>
        <div className="flex items-center space-x-2 flex-wrap gap-2">
          <div className="flex items-center space-x-1">
            <Button variant="outline" size="sm" onClick={zoomOut} disabled={scale <= 0.5}>
              <ZoomOut className="w-4 h-4" />
            </Button>
            <span className="text-sm text-slate-600 px-2 min-w-[50px] text-center">
              {Math.round(scale * 100)}%
            </span>
            <Button variant="outline" size="sm" onClick={zoomIn} disabled={scale >= 3.0}>
              <ZoomIn className="w-4 h-4" />
            </Button>
          </div>
          
          <div className="flex items-center space-x-1">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => changePage(-1)}
              disabled={pageNumber <= 1}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm text-slate-600">Page</span>
            <Input 
              className="w-16 h-8 text-center" 
              value={pageInput}
              onChange={handlePageInputChange}
              onKeyPress={handlePageInputKeyPress}
              onBlur={handlePageInputBlur}
            />
            <span className="text-sm text-slate-600">of {numPages || 0}</span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => changePage(1)}
              disabled={pageNumber >= numPages}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          
          <div className="flex items-center space-x-1">
            <Button variant="outline" size="sm" onClick={rotate}>
              <RotateCw className="w-4 h-4" />
            </Button>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-slate-400" />
              <Input 
                placeholder="Search in PDF..." 
                className="pl-7 h-8 w-32" 
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* PDF Viewer Area */}
      <div className="flex-1 bg-slate-100 overflow-auto">
        <div className="flex justify-center p-4">
          {error ? (
            <Card className="p-8 bg-white shadow-lg">
              <div className="text-center">
                <AlertCircle className="w-16 h-16 text-red-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-red-600 mb-2">Error Loading PDF</h3>
                <p className="text-red-500">{error}</p>
                <p className="text-sm text-slate-400 mt-2">File: {selectedPdf}</p>
              </div>
            </Card>
          ) : (
            <div className="relative">
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75 z-10">
                  <div className="text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-2" />
                    <p className="text-sm text-slate-600">Loading PDF...</p>
                  </div>
                </div>
              )}
              
              <Document
                file={pdfUrl}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={onDocumentLoadError}
                onLoadStart={onLoadStart}
                loading={
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                  </div>
                }
              >
                <Page
                  pageNumber={pageNumber}
                  scale={scale}
                  rotate={rotation}
                  renderTextLayer={true}
                  renderAnnotationLayer={true}
                  className="shadow-lg"
                />
              </Document>
            </div>
          )}
        </div>
      </div>

      {/* Status Bar */}
      {numPages > 0 && (
        <div className="px-4 py-2 bg-slate-50 border-t border-slate-200">
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>
              {loading ? 'Loading...' : `Page ${pageNumber} of ${numPages}`}
            </span>
            <span>
              Zoom: {Math.round(scale * 100)}% | Rotation: {rotation}°
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default PdfViewerTab;
