
import React from 'react';
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Clock, CheckCircle2, AlertCircle, Eye } from 'lucide-react';
import { ScrollArea } from "@/components/ui/scroll-area";

interface TimelineTabProps {
  uploadedFiles: File[];
  selectedPdf: string | null;
}

const TimelineTab = ({ uploadedFiles, selectedPdf }: TimelineTabProps) => {
  const getProcessingStatus = (index: number) => {
    // Simulate different processing statuses
    const statuses = ['complete', 'processing', 'pending', 'complete'];
    return statuses[index % statuses.length];
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'complete':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'processing':
        return <Clock className="w-4 h-4 text-yellow-500 animate-spin" />;
      case 'pending':
        return <AlertCircle className="w-4 h-4 text-slate-400" />;
      default:
        return <Clock className="w-4 h-4 text-slate-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'complete':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'processing':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'pending':
        return 'bg-slate-100 text-slate-600 border-slate-200';
      default:
        return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  if (uploadedFiles.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center">
          <Clock className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-600 mb-2">No Documents to Display</h3>
          <p className="text-slate-500">Upload some PDFs to see the processing timeline</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-2">Document Processing Timeline</h3>
        <p className="text-sm text-slate-600">Track the processing status of your uploaded documents</p>
      </div>

      <ScrollArea className="h-[calc(100%-120px)]">
        <div className="relative">
          {/* Timeline Line */}
          <div className="absolute left-8 top-8 bottom-8 w-0.5 bg-slate-200"></div>
          
          <div className="space-y-6">
            {uploadedFiles.map((file, index) => {
              const status = getProcessingStatus(index);
              const isSelected = selectedPdf === file.name;
              
              return (
                <div key={index} className="relative">
                  {/* Timeline Node */}
                  <div className={`absolute left-6 w-4 h-4 rounded-full border-2 bg-white ${
                    isSelected ? 'border-blue-500' : 'border-slate-300'
                  }`}>
                    <div className={`absolute inset-1 rounded-full ${
                      status === 'complete' ? 'bg-green-500' :
                      status === 'processing' ? 'bg-yellow-500' :
                      'bg-slate-300'
                    }`}></div>
                  </div>
                  
                  {/* Document Card */}
                  <Card className={`ml-16 p-4 hover:shadow-md transition-all ${
                    isSelected ? 'ring-2 ring-blue-500 bg-blue-50' : ''
                  }`}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        <FileText className="w-5 h-5 text-red-500" />
                        <div>
                          <h4 className="font-medium text-slate-900">{file.name}</h4>
                          <p className="text-sm text-slate-500">
                            Uploaded {new Date().toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className={getStatusColor(status)}>
                        {getStatusIcon(status)}
                        <span className="ml-1 capitalize">{status}</span>
                      </Badge>
                    </div>
                    
                    {/* Processing Events */}
                    <div className="space-y-2 mb-3">
                      {status === 'complete' && (
                        <>
                          <div className="flex items-center space-x-2 text-sm text-slate-600">
                            <CheckCircle2 className="w-3 h-3 text-green-500" />
                            <span>Summary Generated</span>
                          </div>
                          <div className="flex items-center space-x-2 text-sm text-slate-600">
                            <CheckCircle2 className="w-3 h-3 text-green-500" />
                            <span>Key Entities Extracted</span>
                          </div>
                          <div className="flex items-center space-x-2 text-sm text-slate-600">
                            <CheckCircle2 className="w-3 h-3 text-green-500" />
                            <span>Action Items: 3 found</span>
                          </div>
                        </>
                      )}
                      {status === 'processing' && (
                        <div className="flex items-center space-x-2 text-sm text-slate-600">
                          <Clock className="w-3 h-3 text-yellow-500" />
                          <span>Analyzing content...</span>
                        </div>
                      )}
                      {status === 'pending' && (
                        <div className="flex items-center space-x-2 text-sm text-slate-600">
                          <AlertCircle className="w-3 h-3 text-slate-400" />
                          <span>Waiting to be processed</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex space-x-2">
                      <Button variant="outline" size="sm">
                        <Eye className="w-3 h-3 mr-1" />
                        View PDF
                      </Button>
                      {status === 'complete' && (
                        <Button variant="outline" size="sm">
                          View Summary
                        </Button>
                      )}
                    </div>
                  </Card>
                </div>
              );
            })}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
};

export default TimelineTab;
