import React from 'react';
import { GlassCard } from '@/components/layout/GlassCard';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { FileText, Sparkles, Globe, BookOpen, Target, ExternalLink } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const PUBLISH_TARGETS: Record<string, { label: string; website: string }> = {
  WWJMRD: { label: 'WWJMRD', website: 'https://wwjmrd.com/' },
  WWJMER: { label: 'WWJMER', website: 'https://wwjmer.com/' },
};

interface ArticleDetailsSectionProps {
  title: string;
  setTitle: (v: string) => void;
  abstract: string;
  setAbstract: (v: string) => void;
  keywords: string;
  setKeywords: (v: string) => void;
  authorName: string;
  setAuthorName: (v: string) => void;
  country: string;
  setCountry: (v: string) => void;
  subject: string;
  setSubject: (v: string) => void;
  reasonOfResearch: string;
  setReasonOfResearch: (v: string) => void;
  submissionTarget: string;
  setSubmissionTarget: (v: string) => void;
  onGenerateSubject: () => void;
  generatingSubject: boolean;
}

export function ArticleDetailsSection({
  title,
  setTitle,
  abstract,
  setAbstract,
  keywords,
  setKeywords,
  authorName,
  setAuthorName,
  country,
  setCountry,
  subject,
  setSubject,
  reasonOfResearch,
  setReasonOfResearch,
  submissionTarget,
  setSubmissionTarget,
  onGenerateSubject,
  generatingSubject,
}: ArticleDetailsSectionProps) {
  return (
    <GlassCard>
      <h2 className="font-display text-xl font-semibold mb-6 flex items-center gap-2">
        <FileText className="w-5 h-5 text-primary" />
        Article Details
      </h2>

      <div className="space-y-5">
        {/* Author Name & Country Row */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="authorName">Author Name *</Label>
            <Input
              id="authorName"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder="Your full name"
              className="glass-input"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="country" className="flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5" />
              Country *
            </Label>
            <Input
              id="country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="e.g., India, United States"
              className="glass-input"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="title">Article Title *</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter your article title"
            className="glass-input"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="abstract">Abstract</Label>
          <Textarea
            id="abstract"
            value={abstract}
            onChange={(e) => setAbstract(e.target.value)}
            placeholder="Provide a brief summary of your article"
            className="glass-input min-h-[120px]"
          />
        </div>

        {/* Subject with AI generate button */}
        <div className="space-y-2">
          <Label htmlFor="subject" className="flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5" />
            Subject
          </Label>
          <div className="flex gap-2">
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g., Computer Science, Environmental Biology"
              className="glass-input flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onGenerateSubject}
              disabled={generatingSubject || !abstract.trim()}
              className="shrink-0 gap-1.5"
            >
              {generatingSubject ? (
                <GlassSpinner size="sm" />
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  AI Generate
                </>
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Write your abstract first, then click "AI Generate" to auto-detect the subject
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="keywords">Keywords (comma separated)</Label>
          <Input
            id="keywords"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="e.g., machine learning, neural networks, deep learning"
            className="glass-input"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="reasonOfResearch">Reason of Research</Label>
          <Textarea
            id="reasonOfResearch"
            value={reasonOfResearch}
            onChange={(e) => setReasonOfResearch(e.target.value)}
            placeholder="Briefly explain the motivation behind this research"
            className="glass-input min-h-[80px]"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="submissionTarget" className="flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5" />
            Where do you want to Publish? *
          </Label>
          <Select
            value={PUBLISH_TARGETS[submissionTarget] ? submissionTarget : ''}
            onValueChange={setSubmissionTarget}
          >
            <SelectTrigger id="submissionTarget" className="glass-input">
              <SelectValue placeholder="Select a journal" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PUBLISH_TARGETS).map(([key, { label }]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {submissionTarget && PUBLISH_TARGETS[submissionTarget] && (
            <a
              href={PUBLISH_TARGETS[submissionTarget].website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <ExternalLink className="w-3 h-3" />
              Visit the journal website ({PUBLISH_TARGETS[submissionTarget].website})
            </a>
          )}
        </div>
      </div>
    </GlassCard>
  );
}
