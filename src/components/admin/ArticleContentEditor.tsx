import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/layout/GlassCard';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import {
  Save, CheckCircle, X, Eye, Bold, Italic, Underline,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Undo, Redo, Strikethrough, Type,
  Table2, Columns2, Columns3, LayoutGrid, Minus, Plus,
  Trash2, PaintBucket, Grid3X3,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger,
  DropdownMenuSubContent, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';

interface ArticleContentEditorProps {
  articleId: string;
  initialContent: string;
  articleTitle: string;
  referenceNumber: string;
  onClose: () => void;
}

const EDITOR_STYLES = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Times New Roman', Times, serif;
    font-size: 12px;
    line-height: 1.6;
    color: #000;
    background: #fff;
    padding: 0;
    margin: 0;
  }
  body:focus { outline: none; }
  h1 { font-size: 16px; text-align: center; margin: 12px 0; font-weight: bold; }
  h2 { font-size: 14px; margin: 16px 0 8px; font-weight: bold; }
  h3 { font-size: 13px; margin: 12px 0 6px; font-weight: bold; }
  p { text-align: justify; font-size: 11px; line-height: 1.6; margin: 4px 0; }
  strong { font-weight: bold; }
  em { font-style: italic; }
  ul, ol { margin: 4px 0 4px 20px; font-size: 11px; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; }
  td, th { border: 1px solid #999; padding: 4px 6px; font-size: 10px; min-width: 30px; }
  th { background: #f0f0f0; font-weight: bold; }
  hr { border: none; border-top: 1px solid #ccc; margin: 12px 0; }
  a { color: #0066cc; }
  .layout-two-col { display: flex; gap: 12px; margin: 8px 0; }
  .layout-two-col > div { flex: 1; }
  .layout-three-col { display: flex; gap: 12px; margin: 8px 0; }
  .layout-three-col > div { flex: 1; }
  .layout-sidebar-left { display: flex; gap: 12px; margin: 8px 0; }
  .layout-sidebar-left > div:first-child { flex: 1; }
  .layout-sidebar-left > div:last-child { flex: 2; }
  .layout-sidebar-right { display: flex; gap: 12px; margin: 8px 0; }
  .layout-sidebar-right > div:first-child { flex: 2; }
  .layout-sidebar-right > div:last-child { flex: 1; }
  table.table-bordered td, table.table-bordered th { border: 2px solid #333; }
  table.table-minimal td, table.table-minimal th { border: none; border-bottom: 1px solid #ddd; }
  table.table-striped tr:nth-child(even) td { background: #f9f9f9; }
  table.table-colored th { background: #2c7a7b; color: #fff; }
  table.table-colored td { border-color: #2c7a7b; }
`;

const FONT_SIZES = ['8', '9', '10', '11', '12', '14', '16', '18', '20', '24'];

export function ArticleContentEditor({
  articleId, initialContent, articleTitle, referenceNumber, onClose,
}: ArticleContentEditorProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [ready, setReady] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const onLoad = () => {
      const doc = iframe.contentDocument;
      if (!doc) return;
      doc.open();
      doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>${EDITOR_STYLES}</style></head><body contenteditable="true">${initialContent}</body></html>`);
      doc.close();
      setReady(true);
    };
    iframe.addEventListener('load', onLoad);
    iframe.src = 'about:blank';
    return () => iframe.removeEventListener('load', onLoad);
  }, [initialContent]);

  const getContent = useCallback(() => {
    return iframeRef.current?.contentDocument?.body?.innerHTML || '';
  }, []);

  const execCmd = useCallback((cmd: string, value?: string) => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    doc.execCommand(cmd, false, value);
  }, []);

  const insertHtmlAtCursor = useCallback((html: string) => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    doc.execCommand('insertHTML', false, html);
  }, []);

  const insertTable = useCallback((rows: number, cols: number, style?: string) => {
    const cls = style ? ` class="${style}"` : '';
    let html = `<table${cls}>`;
    for (let r = 0; r < rows; r++) {
      html += '<tr>';
      for (let c = 0; c < cols; c++) {
        html += r === 0 ? '<th>&nbsp;</th>' : '<td>&nbsp;</td>';
      }
      html += '</tr>';
    }
    html += '</table>';
    insertHtmlAtCursor(html);
  }, [insertHtmlAtCursor]);

  const insertLayout = useCallback((type: string) => {
    const layouts: Record<string, string> = {
      'two-col': '<div class="layout-two-col"><div><p>Column 1 content</p></div><div><p>Column 2 content</p></div></div>',
      'three-col': '<div class="layout-three-col"><div><p>Column 1</p></div><div><p>Column 2</p></div><div><p>Column 3</p></div></div>',
      'sidebar-left': '<div class="layout-sidebar-left"><div><p>Sidebar</p></div><div><p>Main content</p></div></div>',
      'sidebar-right': '<div class="layout-sidebar-right"><div><p>Main content</p></div><div><p>Sidebar</p></div></div>',
    };
    if (layouts[type]) insertHtmlAtCursor(layouts[type]);
  }, [insertHtmlAtCursor]);

  const tableAction = useCallback((action: string) => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    const sel = doc.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const node = sel.anchorNode;
    const td = (node as HTMLElement)?.closest?.('td,th') || (node?.parentElement as HTMLElement)?.closest?.('td,th');
    if (!td) { toast.error('Place cursor inside a table cell first'); return; }
    const tr = td.closest('tr');
    const table = td.closest('table');
    if (!tr || !table) return;

    const colIndex = Array.from(tr.children).indexOf(td);

    if (action === 'add-row-above' || action === 'add-row-below') {
      const newRow = doc.createElement('tr');
      for (let i = 0; i < tr.children.length; i++) {
        const cell = doc.createElement('td');
        cell.innerHTML = '&nbsp;';
        newRow.appendChild(cell);
      }
      if (action === 'add-row-above') tr.parentNode?.insertBefore(newRow, tr);
      else tr.parentNode?.insertBefore(newRow, tr.nextSibling);
    } else if (action === 'add-col-left' || action === 'add-col-right') {
      table.querySelectorAll('tr').forEach(row => {
        const cell = doc.createElement(row.children[0]?.tagName === 'TH' ? 'th' : 'td');
        cell.innerHTML = '&nbsp;';
        const ref = row.children[colIndex];
        if (action === 'add-col-left') row.insertBefore(cell, ref);
        else row.insertBefore(cell, ref?.nextSibling || null);
      });
    } else if (action === 'delete-row') {
      if (table.querySelectorAll('tr').length <= 1) table.remove();
      else tr.remove();
    } else if (action === 'delete-col') {
      table.querySelectorAll('tr').forEach(row => {
        row.children[colIndex]?.remove();
      });
      if (table.querySelector('tr')?.children.length === 0) table.remove();
    } else if (action === 'delete-table') {
      table.remove();
    } else if (action.startsWith('style-')) {
      const style = action.replace('style-', '');
      table.className = style;
    }
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const content = getContent();
      const { error } = await supabase
        .from('articles')
        .update({ formatted_content: content } as any)
        .eq('id', articleId);
      if (error) throw error;
      toast.success('Content saved successfully');
      queryClient.invalidateQueries({ queryKey: ['admin-formatting-articles'] });
    } catch (err: any) {
      toast.error('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleApproveAndSendGalleyProof = async () => {
    setApproving(true);
    try {
      const content = getContent();
      const { error: saveError } = await supabase
        .from('articles')
        .update({
          formatted_content: content,
          formatting_status: 'approved',
          formatting_approved_at: new Date().toISOString(),
        } as any)
        .eq('id', articleId);
      if (saveError) throw saveError;

      const { data: article } = await supabase
        .from('articles')
        .select('*, profiles:author_id (full_name, email)')
        .eq('id', articleId)
        .single();

      if (article) {
        const authorProfile = article.profiles as any;
        if (authorProfile?.email) {
          await supabase.functions.invoke('send-email', {
            body: {
              to: authorProfile.email,
              template: 'custom',
              subject: `Galley Proof Ready - ${article.reference_number}`,
              html: buildGalleyProofAuthorEmail(article, authorProfile),
            },
          });
        }
        await supabase.from('notifications').insert({
          user_id: article.author_id,
          title: 'Galley Proof Ready 📄',
          message: `The galley proof for your article "${article.title}" has been approved and is ready for your review.`,
          type: 'info',
          link: '/author/articles',
        });
      }

      toast.success('Article approved & galley proof email sent to author!');
      queryClient.invalidateQueries({ queryKey: ['admin-formatting-articles'] });
      onClose();
    } catch (err: any) {
      toast.error('Failed to approve: ' + err.message);
    } finally {
      setApproving(false);
    }
  };

  const previewHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Times New Roman', Times, serif; background: #e5e7eb; padding: 20px; }
    .page { background: white; width: 210mm; min-height: 297mm; margin: 0 auto; padding: 15mm; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
    .page h1 { font-size: 16px; text-align: center; margin: 12px 0; }
    .page h2 { font-size: 14px; margin: 16px 0 8px; }
    .page h3 { font-size: 13px; margin: 12px 0 6px; }
    .page p { text-align: justify; font-size: 11px; line-height: 1.6; margin: 4px 0; }
    .page ul, .page ol { margin: 4px 0 4px 20px; font-size: 11px; }
    .page table { border-collapse: collapse; width: 100%; margin: 8px 0; }
    .page td, .page th { border: 1px solid #999; padding: 4px 6px; font-size: 10px; }
    .page th { background: #f0f0f0; font-weight: bold; }
    .page hr { border: none; border-top: 1px solid #ccc; margin: 12px 0; }
    .layout-two-col, .layout-three-col, .layout-sidebar-left, .layout-sidebar-right { display: flex; gap: 12px; margin: 8px 0; }
    .layout-two-col > div, .layout-three-col > div { flex: 1; }
    .layout-sidebar-left > div:first-child { flex: 1; } .layout-sidebar-left > div:last-child { flex: 2; }
    .layout-sidebar-right > div:first-child { flex: 2; } .layout-sidebar-right > div:last-child { flex: 1; }
    table.table-bordered td, table.table-bordered th { border: 2px solid #333; }
    table.table-minimal td, table.table-minimal th { border: none; border-bottom: 1px solid #ddd; }
    table.table-striped tr:nth-child(even) td { background: #f9f9f9; }
    table.table-colored th { background: #2c7a7b; color: #fff; }
  </style></head><body><div class="page">${getContent()}</div></body></html>`;

  const ToolbarBtn = ({ cmd, value, icon: Icon, title, active }: { cmd: string; value?: string; icon: any; title: string; active?: boolean }) => (
    <Button
      type="button" variant="ghost" size="sm"
      className={`h-7 w-7 p-0 ${active ? 'bg-primary/20 text-primary' : 'text-black/70 hover:text-black hover:bg-black/5'}`}
      onClick={() => execCmd(cmd, value)}
      title={title}
    >
      <Icon className="w-3.5 h-3.5" />
    </Button>
  );

  return (
    <>
      <GlassCard className="mt-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold text-lg">Edit Formatted Article</h3>
            <p className="text-sm text-muted-foreground">{referenceNumber} — {articleTitle}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowPreview(true)}>
              <Eye className="w-4 h-4 mr-1" /> Preview PDF
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* PDF-like editor */}
        <div className="rounded-lg overflow-hidden border border-border">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-0.5 p-1.5 bg-[#f3f4f6] border-b border-[#d1d5db]">
            <Select defaultValue="Times New Roman" onValueChange={(v) => execCmd('fontName', v)}>
              <SelectTrigger className="h-7 w-[130px] text-xs bg-white border-[#d1d5db] text-black">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['Times New Roman', 'Arial', 'Georgia', 'Verdana', 'Courier New'].map(f => (
                  <SelectItem key={f} value={f} style={{ fontFamily: f }}>{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select defaultValue="12" onValueChange={(v) => execCmd('fontSize', v)}>
              <SelectTrigger className="h-7 w-[55px] text-xs bg-white border-[#d1d5db] text-black">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONT_SIZES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>

            <div className="w-px h-5 bg-[#d1d5db] mx-1" />

            <ToolbarBtn cmd="bold" icon={Bold} title="Bold" />
            <ToolbarBtn cmd="italic" icon={Italic} title="Italic" />
            <ToolbarBtn cmd="underline" icon={Underline} title="Underline" />
            <ToolbarBtn cmd="strikeThrough" icon={Strikethrough} title="Strikethrough" />

            <div className="w-px h-5 bg-[#d1d5db] mx-1" />

            <ToolbarBtn cmd="justifyLeft" icon={AlignLeft} title="Align Left" />
            <ToolbarBtn cmd="justifyCenter" icon={AlignCenter} title="Align Center" />
            <ToolbarBtn cmd="justifyRight" icon={AlignRight} title="Align Right" />
            <ToolbarBtn cmd="justifyFull" icon={AlignJustify} title="Justify" />

            <div className="w-px h-5 bg-[#d1d5db] mx-1" />

            <ToolbarBtn cmd="insertUnorderedList" icon={List} title="Bullet List" />
            <ToolbarBtn cmd="insertOrderedList" icon={ListOrdered} title="Numbered List" />

            <div className="w-px h-5 bg-[#d1d5db] mx-1" />

            {/* Table dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5 text-black/70 hover:text-black hover:bg-black/5 gap-1" title="Table">
                  <Table2 className="w-3.5 h-3.5" />
                  <span className="text-[10px]">Table</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuLabel className="text-xs">Insert Table</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => insertTable(3, 3)}>
                  <Grid3X3 className="w-4 h-4 mr-2" /> 3 × 3 Table
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => insertTable(4, 4)}>
                  <Grid3X3 className="w-4 h-4 mr-2" /> 4 × 4 Table
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => insertTable(5, 5)}>
                  <Grid3X3 className="w-4 h-4 mr-2" /> 5 × 5 Table
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => insertTable(2, 6)}>
                  <Grid3X3 className="w-4 h-4 mr-2" /> 2 × 6 Table
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs">Table Actions</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => tableAction('add-row-above')}>
                  <Plus className="w-4 h-4 mr-2" /> Add Row Above
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => tableAction('add-row-below')}>
                  <Plus className="w-4 h-4 mr-2" /> Add Row Below
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => tableAction('add-col-left')}>
                  <Plus className="w-4 h-4 mr-2" /> Add Column Left
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => tableAction('add-col-right')}>
                  <Plus className="w-4 h-4 mr-2" /> Add Column Right
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => tableAction('delete-row')} className="text-red-600">
                  <Minus className="w-4 h-4 mr-2" /> Delete Row
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => tableAction('delete-col')} className="text-red-600">
                  <Minus className="w-4 h-4 mr-2" /> Delete Column
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => tableAction('delete-table')} className="text-red-600">
                  <Trash2 className="w-4 h-4 mr-2" /> Delete Table
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs">Table Style</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => tableAction('style-')}>
                  Default
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => tableAction('style-table-bordered')}>
                  <PaintBucket className="w-4 h-4 mr-2" /> Bold Borders
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => tableAction('style-table-minimal')}>
                  <PaintBucket className="w-4 h-4 mr-2" /> Minimal
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => tableAction('style-table-striped')}>
                  <PaintBucket className="w-4 h-4 mr-2" /> Striped Rows
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => tableAction('style-table-colored')}>
                  <PaintBucket className="w-4 h-4 mr-2" /> Colored Header
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Layout dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5 text-black/70 hover:text-black hover:bg-black/5 gap-1" title="Layout">
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span className="text-[10px]">Layout</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuLabel className="text-xs">Column Layouts</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => insertLayout('two-col')}>
                  <Columns2 className="w-4 h-4 mr-2" /> Two Columns
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => insertLayout('three-col')}>
                  <Columns3 className="w-4 h-4 mr-2" /> Three Columns
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => insertLayout('sidebar-left')}>
                  <LayoutGrid className="w-4 h-4 mr-2" /> Sidebar Left
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => insertLayout('sidebar-right')}>
                  <LayoutGrid className="w-4 h-4 mr-2" /> Sidebar Right
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs">Insert Elements</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => insertHtmlAtCursor('<hr />')}>
                  <Minus className="w-4 h-4 mr-2" /> Horizontal Rule
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="w-px h-5 bg-[#d1d5db] mx-1" />

            <ToolbarBtn cmd="undo" icon={Undo} title="Undo" />
            <ToolbarBtn cmd="redo" icon={Redo} title="Redo" />
          </div>

          {/* A4 Page inside grey container */}
          <div className="overflow-auto" style={{ maxHeight: '70vh', background: '#e5e7eb', padding: '24px' }}>
            <div
              className="mx-auto shadow-lg"
              style={{
                width: '210mm',
                maxWidth: '100%',
                minHeight: '297mm',
                padding: '15mm',
                background: '#ffffff',
              }}
            >
              <iframe
                ref={iframeRef}
                className="w-full border-0"
                style={{ minHeight: '260mm', height: '100%', display: 'block' }}
                title="Article Editor"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 mt-4">
          <Button variant="outline" onClick={() => setShowPreview(true)}>
            <Eye className="w-4 h-4 mr-2" /> Preview PDF
          </Button>
          <Button variant="outline" onClick={handleSave} disabled={saving}>
            {saving ? <GlassSpinner size="sm" className="mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Save Draft
          </Button>
          <Button onClick={handleApproveAndSendGalleyProof} disabled={approving}>
            {approving ? <GlassSpinner size="sm" className="mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
            Approve & Send Galley Proof
          </Button>
        </div>
      </GlassCard>

      {/* PDF Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[95vh] p-0 overflow-hidden">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle>PDF Preview — {referenceNumber}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto bg-[hsl(var(--muted))]" style={{ height: '80vh' }}>
            <iframe srcDoc={previewHtml} className="w-full h-full border-0" title="PDF Preview" style={{ minHeight: '80vh' }} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function buildGalleyProofAuthorEmail(article: any, authorProfile: any): string {
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
  const esc = (s: string) => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background-color:#0d1528;">
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#0d1528"><tr><td align="center" style="padding:40px 16px;">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
<tr><td align="center" style="padding-bottom:32px;"><img src="https://myjbbbytbzzzsaaiohrz.supabase.co/storage/v1/object/public/email-assets/logo.png?v=1" alt="WWJMRD" width="200" style="display:block;max-width:200px;height:auto;" /></td></tr>
<tr><td bgcolor="#151d35" style="background-color:#151d35;border-radius:12px;padding:32px 28px;border:1px solid rgba(255,255,255,0.08);">
<h1 style="font-family:${font};font-size:24px;color:#ffffff;text-align:center;margin:0 0 24px;">Galley Proof Ready for Review 📄</h1>
<p style="font-family:${font};font-size:16px;color:#d1d5db;line-height:26px;">Hi ${esc(authorProfile.full_name || 'Author')},</p>
<p style="font-family:${font};font-size:16px;color:#d1d5db;line-height:26px;">Your article has been formatted and the galley proof has been approved by our editorial team. Please review it carefully.</p>
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#1a2340" style="background-color:#1a2340;border-radius:8px;margin:20px 0;"><tr><td style="padding:20px;">
<p style="font-family:${font};font-size:16px;font-weight:600;color:#ffffff;margin:0 0 12px;">Article Details:</p>
<table width="100%">
<tr><td style="font-family:${font};font-size:14px;color:#9ca3af;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);">Reference</td><td align="right" style="font-family:${font};font-size:14px;color:#ffffff;font-weight:500;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);">${esc(article.reference_number)}</td></tr>
<tr><td style="font-family:${font};font-size:14px;color:#9ca3af;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);">Title</td><td align="right" style="font-family:${font};font-size:14px;color:#ffffff;font-weight:500;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);">${esc(article.title)}</td></tr>
<tr><td style="font-family:${font};font-size:14px;color:#9ca3af;padding:10px 0;">Status</td><td align="right" style="font-family:${font};font-size:14px;color:#10b981;font-weight:600;padding:10px 0;">Galley Proof Approved</td></tr>
</table></td></tr></table>
<table width="100%" style="margin:28px 0;"><tr><td align="center"><a href="https://wwjmrdai.lovable.app/author/articles" style="display:inline-block;background-color:#00d4ff;color:#0d1528;font-family:${font};font-size:16px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:8px;">Review Galley Proof</a></td></tr></table>
<p style="font-family:${font};font-size:14px;color:#9ca3af;">If you have any questions, contact us at support@wwjmrd.com</p>
</td></tr>
<tr><td align="center" style="padding-top:24px;"><p style="font-family:${font};font-size:12px;color:#6b7280;margin:0;">&copy; ${new Date().getFullYear()} WWJMRD. All rights reserved.</p></td></tr>
</table></td></tr></table></body></html>`;
}
