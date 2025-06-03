
import React, { useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Upload, FileText, Search, MoreVertical, Eye, Trash2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

interface PdfsTabProps {
  uploadedFiles: File[];
  setUploadedFiles: (files: File[]) => void;
  selectedPdf: string | null;
  setSelectedPdf: (pdf: string | null) => void;
}

const PdfsTab = ({ uploadedFiles, setUploadedFiles, selectedPdf, setSelectedPdf }: PdfsTabProps) => {
  const { toast } = useToast();

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const pdfFiles = Array.from(files).filter(file => file.type === 'application/pdf');
      if (pdfFiles.length !== files.length) {
        toast({
          title: "Invalid files detected",
          description: "Only PDF files are allowed.",
          variant: "destructive"
        });
      }
      setUploadedFiles([...uploadedFiles, ...pdfFiles]);
      if (pdfFiles.length > 0) {
        toast({
          title: "Files uploaded successfully",
          description: `${pdfFiles.length} PDF(s) added to your collection.`
        });
      }
    }
  }, [uploadedFiles, setUploadedFiles, toast]);

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const files = event.dataTransfer.files;
    const pdfFiles = Array.from(files).filter(file => file.type === 'application/pdf');
    setUploadedFiles([...uploadedFiles, ...pdfFiles]);
    if (pdfFiles.length > 0) {
      toast({
        title: "Files uploaded successfully",
        description: `${pdfFiles.length} PDF(s) added to your collection.`
      });
    }
  }, [uploadedFiles, setUploadedFiles, toast]);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
  }, []);

  const removeFile = (index: number) => {
    const newFiles = uploadedFiles.filter((_, i) => i !== index);
    setUploadedFiles(newFiles);
    toast({
      title: "File removed",
      description: "PDF has been removed from your collection."
    });
  };

  return (
    <div className="p-4 h-full flex flex-col">
      {/* Upload Area */}
      <div
        className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center mb-4 hover:border-slate-400 transition-colors cursor-pointer"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
        <p className="text-sm text-slate-600 mb-2">Drag & drop PDFs here, or click to browse</p>
        <input
          type="file"
          multiple
          accept=".pdf"
          onChange={handleFileUpload}
          className="hidden"
          id="file-upload"
        />
        <Button asChild variant="outline">
          <label htmlFor="file-upload" className="cursor-pointer">
            + Add Documents
          </label>
        </Button>
      </div>

      {/* Search Bar */}
      {uploadedFiles.length > 0 && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
          <Input
            placeholder="Search PDFs..."
            className="pl-10"
          />
        </div>
      )}

      {/* File List */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {uploadedFiles.map((file, index) => (
          <Card 
            key={index}
            className={`p-3 hover:shadow-md transition-all cursor-pointer ${
              selectedPdf === file.name ? 'ring-2 ring-blue-500 bg-blue-50' : ''
            }`}
            onClick={() => setSelectedPdf(file.name)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3 flex-1 min-w-0">
                <FileText className="w-5 h-5 text-red-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {file.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-white">
                  <DropdownMenuItem onClick={() => setSelectedPdf(file.name)}>
                    <Eye className="mr-2 h-4 w-4" />
                    View
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => removeFile(index)} className="text-red-600">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remove
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </Card>
        ))}
      </div>

      {uploadedFiles.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">No PDFs uploaded yet</p>
            <p className="text-sm text-slate-400">Upload your first document to get started</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default PdfsTab;
