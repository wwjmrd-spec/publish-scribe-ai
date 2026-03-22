import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { toast } from 'sonner';
import { Upload, FileCheck, Download } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

interface CopyrightFormSectionProps {
  article: any;
}

export function CopyrightFormSection({ article }: CopyrightFormSectionProps) {
  const [uploading, setUploading] = useState(false);
  const queryClient = useQueryClient();

  const hasCopyrightForm = !!(article as any).copyright_form_url;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast.error('Please upload a PDF file only');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be less than 10MB');
      return;
    }

    setUploading(true);
    try {
      const fileName = `copyright-${article.id}-${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { error: updateError } = await supabase
        .from('articles')
        .update({ copyright_form_url: fileName } as any)
        .eq('id', article.id);

      if (updateError) throw updateError;

      queryClient.invalidateQueries({ queryKey: ['my-articles'] });
      toast.success('Copyright form submitted successfully!');
    } catch (err: any) {
      toast.error('Failed to upload copyright form: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  // Show for articles that are not withdrawn/rejected
  if (['withdrawn', 'rejected'].includes(article.status)) return null;

  return (
    <div className="pt-2 border-t border-border/50">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">Copyright Form:</span>
        {hasCopyrightForm ? (
          <span className="inline-flex items-center gap-1 text-sm text-emerald-400">
            <FileCheck className="w-4 h-4" />
            Submitted
          </span>
        ) : (
          <>
            <span className="text-sm text-amber-400">Not submitted</span>
            <label className="cursor-pointer">
              <input
                type="file"
                accept="application/pdf"
                onChange={handleUpload}
                className="hidden"
                disabled={uploading}
              />
              <Button
                variant="outline"
                size="sm"
                className="text-primary"
                asChild
                disabled={uploading}
              >
                <span>
                  {uploading ? (
                    <GlassSpinner size="sm" className="mr-1" />
                  ) : (
                    <Upload className="w-4 h-4 mr-1" />
                  )}
                  Upload Copyright Form (PDF)
                </span>
              </Button>
            </label>
          </>
        )}
      </div>
    </div>
  );
}
