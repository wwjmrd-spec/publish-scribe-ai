import React, { useCallback, useState } from 'react';
import { GlassCard } from '@/components/layout/GlassCard';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Upload, CheckCircle, X } from 'lucide-react';

interface FileUploadSectionProps {
  file: File | null;
  setFile: (f: File | null) => void;
}

const isAllowed = (name: string) => /\.(docx|doc)$/i.test(name);

export function FileUploadSection({ file, setFile }: FileUploadSectionProps) {
  const { toast } = useToast();
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        const droppedFile = e.dataTransfer.files[0];
        if (isAllowed(droppedFile.name)) {
          setFile(droppedFile);
        } else {
          toast({
            title: 'Invalid file type',
            description: 'Please upload a .doc or .docx file',
            variant: 'destructive',
          });
        }
      }
    },
    [toast, setFile]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (isAllowed(selectedFile.name)) {
        setFile(selectedFile);
      } else {
        toast({
          title: 'Invalid file type',
          description: 'Please upload a .doc or .docx file',
          variant: 'destructive',
        });
      }
    }
  };

  return (
    <GlassCard>
      <h2 className="font-display text-xl font-semibold mb-6 flex items-center gap-2">
        <Upload className="w-5 h-5 text-primary" />
        Document Upload
      </h2>

      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-300 ${
          dragActive
            ? 'border-primary bg-primary/10'
            : file
            ? 'border-green-500/50 bg-green-500/5'
            : 'border-[hsl(var(--glass-border))] hover:border-primary/50'
        }`}
      >
        {file ? (
          <div className="flex items-center justify-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-green-500/20 flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-500" />
            </div>
            <div className="text-left">
              <p className="font-medium">{file.name}</p>
              <p className="text-sm text-muted-foreground">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setFile(null)}
              className="ml-2"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <>
            <div className="w-16 h-16 rounded-2xl bg-[hsl(var(--glass-bg-strong))] flex items-center justify-center mx-auto mb-4">
              <Upload className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-lg font-medium mb-2">
              Drag and drop your .doc or .docx file
            </p>
            <p className="text-sm text-muted-foreground mb-4">or click to browse</p>
            <input
              type="file"
              accept=".docx,.doc"
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </>
        )}
      </div>
    </GlassCard>
  );
}
