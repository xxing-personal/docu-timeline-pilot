import React, { useCallback, useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Upload, FileText, Search, MoreVertical, Eye, Trash2, Loader2, RefreshCw, AlertTriangle, Edit3, Calendar } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getApiBaseUrl } from "@/lib/utils";

interface UploadedFile {
  filename: string;
  size: number;
  uploadedAt: string;
  modifiedAt: string;
}

interface FilesResponse {
  files: UploadedFile[];
  total: number;
}

interface PdfsTabProps {
  uploadedFiles: File[];
  setUploadedFiles: (files: File[]) => void;
  selectedPdf: string | null;
  setSelectedPdf: (pdf: string | null) => void;
}

const API_BASE_URL = getApiBaseUrl();

const PdfsTab = ({ uploadedFiles, setUploadedFiles, selectedPdf, setSelectedPdf }: PdfsTabProps) => {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [serverFiles, setServerFiles] = useState<UploadedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [editingTimestamp, setEditingTimestamp] = useState<{
    filename: string;
    uploadedAt: string;
    modifiedAt: string;
  } | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Fetch files from server on component mount
  useEffect(() => {
    fetchServerFiles();
  }, []);

  const fetchServerFiles = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/files`);
      if (response.ok) {
        const data: FilesResponse = await response.json();
        setServerFiles(data.files);
      } else {
        throw new Error('Failed to fetch files');
      }
    } catch (error) {
      console.error('Error fetching files:', error);
      toast({
        title: "Error",
        description: "Failed to load uploaded files.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const uploadFiles = async (files: FileList) => {
    const pdfFiles = Array.from(files).filter(file => file.type === 'application/pdf');
    
    if (pdfFiles.length === 0) {
      toast({
        title: "No valid files",
        description: "Please select PDF files to upload.",
        variant: "destructive"
      });
      return;
    }

    if (pdfFiles.length !== files.length) {
      toast({
        title: "Invalid files detected",
        description: "Only PDF files are allowed.",
        variant: "destructive"
      });
    }

    setUploading(true);

    try {
      // Upload all files at once
      const formData = new FormData();
      pdfFiles.forEach(file => {
        formData.append('pdf', file);
      });

      const response = await fetch(`${API_BASE_URL}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const result = await response.json();
      
      toast({
        title: "Files uploaded successfully",
        description: result.message
      });

      // Refresh the server files list to show newly uploaded files
      await fetchServerFiles();
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "An error occurred during upload.",
        variant: "destructive"
      });
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      uploadFiles(files);
    }
  }, []);

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const files = event.dataTransfer.files;
    if (files) {
      uploadFiles(files);
    }
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
  }, []);

  const removeFile = async (filename: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/files/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete file');
      }

      toast({
        title: "File deleted",
        description: "PDF has been removed from the server.",
      });

      // Refresh the file list
      await fetchServerFiles();
    } catch (error) {
      console.error('Error removing file:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to remove file.",
        variant: "destructive"
      });
    }
  };

  const formatFileSize = (bytes: number) => {
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const openEditTimestamp = (file: UploadedFile) => {
    setEditingTimestamp({
      filename: file.filename,
      uploadedAt: new Date(file.uploadedAt).toISOString().slice(0, 16), // Format for datetime-local input
      modifiedAt: new Date(file.modifiedAt).toISOString().slice(0, 16)
    });
  };

  const saveTimestampChanges = async () => {
    if (!editingTimestamp) return;

    try {
      setIsEditing(true);
      
      const response = await fetch(`${API_BASE_URL}/files/${encodeURIComponent(editingTimestamp.filename)}/timestamp`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          uploadedAt: new Date(editingTimestamp.uploadedAt).toISOString(),
          modifiedAt: new Date(editingTimestamp.modifiedAt).toISOString(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update timestamp');
      }

      toast({
        title: "Timestamp updated",
        description: "File timestamp has been updated successfully.",
      });

      // Refresh the file list
      await fetchServerFiles();
      setEditingTimestamp(null);
    } catch (error) {
      console.error('Error updating timestamp:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update timestamp.",
        variant: "destructive"
      });
    } finally {
      setIsEditing(false);
    }
  };

  const deleteAllFiles = async () => {
    if (serverFiles.length === 0) return;
    
    const confirmed = window.confirm(
      `Are you sure you want to delete all ${serverFiles.length} PDF files? This will also clear all associated tasks. This action cannot be undone.`
    );
    
    if (!confirmed) return;
    
    try {
      setDeletingAll(true);
      
      const response = await fetch(`${API_BASE_URL}/files`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete all files');
      }

      const result = await response.json();
      
      toast({
        title: "All files deleted",
        description: result.message,
      });

      // Clear the selected PDF since it's been deleted
      setSelectedPdf(null);
      
      // Refresh the file list
      await fetchServerFiles();
    } catch (error) {
      console.error('Error deleting all files:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete all files.",
        variant: "destructive"
      });
    } finally {
      setDeletingAll(false);
    }
  };

  return (
    <div className="p-4 h-full flex flex-col">
      {/* Upload Area */}
      <div
        className={`border-2 border-dashed border-slate-300 rounded-lg p-6 text-center mb-4 hover:border-slate-400 transition-colors cursor-pointer ${
          uploading ? 'opacity-50 pointer-events-none' : ''
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {uploading ? (
          <Loader2 className="w-8 h-8 text-slate-400 mx-auto mb-2 animate-spin" />
        ) : (
          <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
        )}
        <p className="text-sm text-slate-600 mb-2">
          {uploading ? 'Uploading files...' : 'Drag & drop PDFs here, or click to browse'}
        </p>
        <input
          type="file"
          multiple
          accept=".pdf"
          onChange={handleFileUpload}
          className="hidden"
          id="file-upload"
          disabled={uploading}
        />
        <Button asChild variant="outline" disabled={uploading}>
          <label htmlFor="file-upload" className="cursor-pointer">
            {uploading ? 'Uploading...' : '+ Add Documents'}
          </label>
        </Button>
      </div>

      {/* Search Bar */}
      {serverFiles.length > 0 && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
          <Input
            placeholder="Search PDFs..."
            className="pl-10"
          />
        </div>
      )}

      {/* Header with Refresh and Delete All Buttons */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-medium text-slate-700">
          Uploaded Documents ({serverFiles.length})
        </h3>
        <div className="flex space-x-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchServerFiles}
            disabled={loading || deletingAll}
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {serverFiles.length > 0 && (
            <Button 
              variant="destructive" 
              size="sm" 
              onClick={deleteAllFiles}
              disabled={loading || deletingAll}
            >
              {deletingAll ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <AlertTriangle className="w-4 h-4 mr-1" />
              )}
              {deletingAll ? 'Deleting...' : 'Delete All'}
            </Button>
          )}
        </div>
      </div>

      {/* File List */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {serverFiles.map((file, index) => (
          <Card 
            key={index}
            className={`p-3 hover:shadow-md transition-all cursor-pointer ${
              selectedPdf === file.filename ? 'ring-2 ring-blue-500 bg-blue-50' : ''
            }`}
            onClick={() => setSelectedPdf(file.filename)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3 flex-1 min-w-0">
                <FileText className="w-5 h-5 text-red-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {file.filename}
                  </p>
                  <div className="flex items-center space-x-2 text-xs text-slate-500">
                    <span>{formatFileSize(file.size)}</span>
                    <span>•</span>
                    <span>Uploaded {formatDate(file.uploadedAt)}</span>
                  </div>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-white">
                  <DropdownMenuItem onClick={() => setSelectedPdf(file.filename)}>
                    <Eye className="mr-2 h-4 w-4" />
                    View
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openEditTimestamp(file)}>
                    <Edit3 className="mr-2 h-4 w-4" />
                    Edit Timestamp
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => removeFile(file.filename)} className="text-red-600">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remove
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </Card>
        ))}
      </div>

      {serverFiles.length === 0 && !loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">No PDFs uploaded yet</p>
            <p className="text-sm text-slate-400">Upload your first document to get started</p>
          </div>
        </div>
      )}

      {loading && serverFiles.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      )}

      {/* Timestamp Editing Dialog */}
      <Dialog open={!!editingTimestamp} onOpenChange={(open) => !open && setEditingTimestamp(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <Calendar className="w-5 h-5" />
              <span>Edit Timestamp</span>
            </DialogTitle>
          </DialogHeader>
          {editingTimestamp && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="filename" className="text-sm font-medium">
                  File Name
                </Label>
                <Input
                  id="filename"
                  value={editingTimestamp.filename}
                  disabled
                  className="mt-1"
                />
              </div>
              
              <div>
                <Label htmlFor="uploadedAt" className="text-sm font-medium">
                  Upload Date & Time
                </Label>
                <Input
                  id="uploadedAt"
                  type="datetime-local"
                  value={editingTimestamp.uploadedAt}
                  onChange={(e) => setEditingTimestamp({
                    ...editingTimestamp,
                    uploadedAt: e.target.value
                  })}
                  className="mt-1"
                />
              </div>
              
              <div>
                <Label htmlFor="modifiedAt" className="text-sm font-medium">
                  Modified Date & Time
                </Label>
                <Input
                  id="modifiedAt"
                  type="datetime-local"
                  value={editingTimestamp.modifiedAt}
                  onChange={(e) => setEditingTimestamp({
                    ...editingTimestamp,
                    modifiedAt: e.target.value
                  })}
                  className="mt-1"
                />
              </div>
              
              <div className="flex justify-end space-x-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setEditingTimestamp(null)}
                  disabled={isEditing}
                >
                  Cancel
                </Button>
                <Button
                  onClick={saveTimestampChanges}
                  disabled={isEditing}
                >
                  {isEditing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PdfsTab;
