import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { DownloadButton } from '@/components/ui/DownloadButton';
import { GlassCard } from '@/components/layout/GlassCard';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import {
  Save, CheckCircle, X, Eye, Bold, Italic, Underline,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Undo, Redo, Strikethrough,
  Table2, Columns2, Columns3, LayoutGrid, Minus, Plus,
  Trash2, PaintBucket, Grid3X3, SeparatorHorizontal, Hash,
  ImageIcon, Crop, MoveVertical, Palette, Eraser, Send,
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
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { buildPagedFormattedArticleHtml } from '@/lib/formattedArticlePagination';
import { downloadFormattedAsPdf, downloadFormattedAsDocx, buildFormattedPdfBlob } from '@/lib/exportFormattedArticle';

interface ArticleContentEditorProps {
  articleId: string;
  initialContent: string;
  articleTitle: string;
  referenceNumber: string;
  onClose: () => void;
  /** Default 'admin'. In 'author' mode the editor shows a red-highlight banner
   *  and replaces the admin Approve flow with a "Send Corrections to Admin" button. */
  mode?: 'admin' | 'author';
  /** Used to populate notification emails when the author sends corrections. */
  articleMeta?: { authorName?: string; authorEmail?: string };
}

// A4 content area inside the editor: 210mm wide, page break visualised every 297mm.
// The iframe body gets a repeating linear-gradient that paints a faint divider every page.
const PAGE_HEIGHT_MM = 297;
const EDITOR_STYLES = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: transparent; }
  body {
    font-family: 'Times New Roman', Times, serif;
    font-size: 12px;
    line-height: var(--ww-line-height, 1.6);
    color: #000;
    background:
      repeating-linear-gradient(
        to bottom,
        #ffffff 0,
        #ffffff calc(${PAGE_HEIGHT_MM}mm - 2px),
        #cbd5e1 calc(${PAGE_HEIGHT_MM}mm - 2px),
        #cbd5e1 ${PAGE_HEIGHT_MM}mm,
        #f1f5f9 ${PAGE_HEIGHT_MM}mm,
        #f1f5f9 calc(${PAGE_HEIGHT_MM}mm + 14px),
        #ffffff calc(${PAGE_HEIGHT_MM}mm + 14px)
      );
    padding: 0;
    margin: 0;
    min-height: ${PAGE_HEIGHT_MM}mm;
  }
  body:focus { outline: none; }
  h1 { font-size: 16px; text-align: center; margin: 12px 0; font-weight: bold; }
  h2 { font-size: 14px; margin: 16px 0 8px; font-weight: bold; }
  h3 { font-size: 13px; margin: 12px 0 6px; font-weight: bold; }
  p { text-align: justify; font-size: 11px; line-height: var(--ww-line-height, 1.6); margin: var(--ww-para-spacing, 4px) 0; }
  strong { font-weight: bold; }
  em { font-style: italic; }
  ul, ol { margin: 4px 0 4px 20px; font-size: 11px; }
  li { margin: var(--ww-para-spacing, 2px) 0; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; }
  td, th { border: 1px solid #999; padding: 4px 6px; font-size: 10px; min-width: 30px; }
  th { background: #f0f0f0; font-weight: bold; }
  hr { border: none; border-top: 1px solid #ccc; margin: 12px 0; }
  a { color: #0066cc; }
  img { max-width: 100%; cursor: pointer; }
  img.ww-selected { outline: 2px solid #2563eb; outline-offset: 2px; }
  figure { margin: 8px 0; text-align: center; }
  .ww-img-wrap { display: inline-block; position: relative; max-width: 100%; }
  .ww-img-wrap.ww-cropped { overflow: hidden; }
  .layout-two-col { column-count: 2; column-gap: 16px; }
  .layout-three-col { column-count: 3; column-gap: 12px; }
  .layout-sidebar-left { display: flex; gap: 12px; }
  .layout-sidebar-left > div:first-child { flex: 1; }
  .layout-sidebar-left > div:last-child { flex: 2; }
  .layout-sidebar-right { display: flex; gap: 12px; }
  .layout-sidebar-right > div:first-child { flex: 2; }
  .layout-sidebar-right > div:last-child { flex: 1; }
  table.table-bordered td, table.table-bordered th { border: 2px solid #333; }
  table.table-minimal td, table.table-minimal th { border: none; border-bottom: 1px solid #ddd; }
  table.table-striped tr:nth-child(even) td { background: #f9f9f9; }
  table.table-colored th { background: #2c7a7b; color: #fff; }
  .page-break {
    page-break-before: always; break-before: page;
    border: none; border-top: 2px dashed #e74c3c; margin: 20px 0; position: relative;
  }
  .page-break::after {
    content: '— Page Break —'; position: absolute; top: -10px; left: 50%;
    transform: translateX(-50%); background: #fff; padding: 0 8px;
    font-size: 10px; color: #e74c3c; font-family: Arial, sans-serif; font-weight: bold;
  }
`;

const FONT_SIZES = [
  { label: '8', value: '1' },
  { label: '10', value: '2' },
  { label: '12', value: '3' },
  { label: '14', value: '4' },
  { label: '18', value: '5' },
  { label: '24', value: '6' },
  { label: '32', value: '7' },
];

// A4 dimensions in mm
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const MARGIN_MM = 15;
const FOOTER_HEIGHT_MM = 10;
const CONTENT_HEIGHT_MM = A4_HEIGHT_MM - (MARGIN_MM * 2) - FOOTER_HEIGHT_MM;

export function ArticleContentEditor({
  articleId, initialContent, articleTitle, referenceNumber, onClose,
  mode = 'admin', articleMeta,
}: ArticleContentEditorProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string>('');
  const [previewBuilding, setPreviewBuilding] = useState(false);
  const [ready, setReady] = useState(false);
  const [columns, setColumns] = useState<1 | 2 | 3>(1);
  const [lineHeight, setLineHeight] = useState<string>('1.6');
  const [paraSpacing, setParaSpacing] = useState<string>('4');
  const [startPage, setStartPage] = useState<number>(1);
  const [selectedImg, setSelectedImg] = useState<HTMLImageElement | null>(null);
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

      doc.body.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        doc.body.querySelectorAll('img.ww-selected').forEach((n) => n.classList.remove('ww-selected'));
        if (target?.tagName === 'IMG') {
          (target as HTMLImageElement).classList.add('ww-selected');
          setSelectedImg(target as HTMLImageElement);
        } else {
          setSelectedImg(null);
        }
      });

      // Auto-grow the iframe to its content height so the paged background
      // shows full A4 pages instead of one long scrollable block.
      const resize = () => {
        const h = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight);
        iframe.style.height = `${h + 24}px`;
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(doc.body);
      doc.body.addEventListener('input', resize);

      setReady(true);
    };
    iframe.addEventListener('load', onLoad);
    iframe.src = 'about:blank';
    return () => iframe.removeEventListener('load', onLoad);
  }, [initialContent]);

  useEffect(() => {
    const body = iframeRef.current?.contentDocument?.body;
    if (!body) return;
    body.style.setProperty('--ww-line-height', lineHeight);
    body.style.setProperty('--ww-para-spacing', `${paraSpacing}px`);
  }, [lineHeight, paraSpacing, ready]);

  const getContent = useCallback(() => {
    return iframeRef.current?.contentDocument?.body?.innerHTML || '';
  }, []);

  const execCmd = useCallback((cmd: string, value?: string) => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    // Ensure iframe has focus before executing commands
    iframeRef.current?.contentWindow?.focus();
    doc.execCommand(cmd, false, value);
  }, []);

  const insertHtmlAtCursor = useCallback((html: string) => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    doc.execCommand('insertHTML', false, html);
  }, []);

  const resizeSelectedImage = useCallback((widthPct: number) => {
    if (!selectedImg) { toast.error('Click an image first'); return; }
    selectedImg.style.width = `${widthPct}%`;
    selectedImg.style.height = 'auto';
    selectedImg.removeAttribute('width');
    selectedImg.removeAttribute('height');
  }, [selectedImg]);

  const cropSelectedImage = useCallback((aspect: string) => {
    if (!selectedImg) { toast.error('Click an image first'); return; }
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    let wrap = selectedImg.closest('.ww-img-wrap') as HTMLElement | null;
    if (!wrap) {
      wrap = doc.createElement('span');
      wrap.className = 'ww-img-wrap';
      selectedImg.parentNode?.insertBefore(wrap, selectedImg);
      wrap.appendChild(selectedImg);
    }
    if (aspect === 'none') {
      wrap.classList.remove('ww-cropped');
      wrap.style.aspectRatio = '';
      selectedImg.style.height = 'auto';
      (selectedImg.style as any).objectFit = '';
    } else {
      wrap.classList.add('ww-cropped');
      wrap.style.aspectRatio = aspect;
      selectedImg.style.width = '100%';
      selectedImg.style.height = '100%';
      (selectedImg.style as any).objectFit = 'cover';
    }
  }, [selectedImg]);

  const removeSelectedImage = useCallback(() => {
    if (!selectedImg) { toast.error('Click an image first'); return; }
    const wrap = selectedImg.closest('.ww-img-wrap');
    (wrap || selectedImg).remove();
    setSelectedImg(null);
  }, [selectedImg]);

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
      'two-col': '<div class="layout-two-col"><p>Column 1 content</p><p>Column 2 content</p></div>',
      'three-col': '<div class="layout-three-col"><p>Column 1</p><p>Column 2</p><p>Column 3</p></div>',
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

  /** Apply a foreground colour to current selection (foreColor execCommand). */
  const applyColor = useCallback((color: string) => {
    iframeRef.current?.contentWindow?.focus();
    iframeRef.current?.contentDocument?.execCommand('foreColor', false, color);
  }, []);

  /** Strip every red-coloured run added by the author. Looks for span/font
   *  elements with red-ish foreground (style="color:red", color="red",
   *  rgb(255,0,0), or hex #ff0000/#f00) and unwraps them. Admin uses this to
   *  clean up the editor after reviewing author corrections. */
  const clearRedHighlights = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    const isRed = (val?: string | null) => {
      if (!val) return false;
      const v = val.trim().toLowerCase().replace(/\s+/g, '');
      return /^(red|#ff0000|#f00|rgb\(255,0,0\)|rgba\(255,0,0,[\d.]+\))$/.test(v);
    };
    let stripped = 0;
    doc.body.querySelectorAll<HTMLElement>('span,font').forEach((el) => {
      const styleColor = el.style?.color || '';
      const attrColor = el.getAttribute('color') || '';
      if (isRed(styleColor) || isRed(attrColor)) {
        if (el.tagName === 'FONT' || (el.tagName === 'SPAN' && el.attributes.length <= 1)) {
          // Unwrap completely
          const parent = el.parentNode;
          while (el.firstChild) parent?.insertBefore(el.firstChild, el);
          el.remove();
        } else {
          el.style.color = '';
          el.removeAttribute('color');
        }
        stripped++;
      }
    });
    toast.success(stripped ? `Cleared ${stripped} red highlight${stripped === 1 ? '' : 's'}` : 'No red highlights found');
  }, []);

  const handleSendAuthorCorrections = useCallback(async () => {
    setApproving(true);
    const tid = toast.loading('Sending corrections to admin…');
    try {
      const content = getContent();
      const { error } = await supabase
        .from('articles')
        .update({
          author_revision_html: content,
          author_revision_submitted_at: new Date().toISOString(),
          galley_proof_status: 'revision_submitted',
        } as any)
        .eq('id', articleId);
      if (error) throw error;

      const emailData = {
        articleTitle,
        referenceNumber,
        authorName: articleMeta?.authorName || 'Author',
        submissionDate: new Date().toLocaleDateString(),
      };
      // Admin email
      supabase.functions.invoke('send-email', {
        body: { to: 'shubhmeena23@gmail.com', template: 'galley-proof-author-corrections', data: emailData, isAdmin: true },
      }).catch(console.error);
      // Author confirmation
      if (articleMeta?.authorEmail) {
        supabase.functions.invoke('send-email', {
          body: { to: articleMeta.authorEmail, template: 'galley-proof-author-corrections', data: emailData, isAdmin: false },
        }).catch(console.error);
      }
      toast.success('Corrections sent to admin', { id: tid });
      queryClient.invalidateQueries({ queryKey: ['my-articles'] });
      onClose();
    } catch (err: any) {
      toast.error('Failed: ' + (err?.message || 'Unknown error'), { id: tid });
    } finally {
      setApproving(false);
    }
  }, [getContent, articleId, articleTitle, referenceNumber, articleMeta, queryClient, onClose]);

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
    const tid = toast.loading('Building galley proof PDF…');
    try {
      const content = getContent();

      // 1. Save current edits + mark formatting approved
      const { error: saveError } = await supabase
        .from('articles')
        .update({
          formatted_content: content,
          formatting_status: 'approved',
          formatting_approved_at: new Date().toISOString(),
        } as any)
        .eq('id', articleId);
      if (saveError) throw saveError;

      // 2. Generate PDF from the same paginated A4 pipeline used in preview/download
      const pdfBlob = await buildFormattedPdfBlob(content, { startPage: 1, showFirstPageNumber: true });

      // 3. Upload PDF to formatted-articles bucket
      const pdfPath = `galley-proofs/${articleId}/${crypto.randomUUID()}.pdf`;
      const upload = await supabase.storage
        .from('formatted-articles')
        .upload(pdfPath, pdfBlob, { contentType: 'application/pdf', upsert: true });
      if (upload.error) throw upload.error;

      // 4. Fetch article (for type, author, ref) and decide deadline
      const { data: article } = await supabase
        .from('articles')
        .select('*, profiles:author_id (full_name, email)')
        .eq('id', articleId)
        .single();
      if (!article) throw new Error('Article not found after save');

      const isFirstPublication = (article as any).publication_type === 'fast_track';
      const deadline = new Date();
      if (isFirstPublication) deadline.setHours(deadline.getHours() + 2);
      else deadline.setDate(deadline.getDate() + 2);

      // 5. Persist galley proof state on the article
      const { error: updateError } = await supabase
        .from('articles')
        .update({
          galley_proof_pdf_url: pdfPath,
          galley_proof_word_url: null,
          galley_proof_deadline: deadline.toISOString(),
          galley_proof_status: 'sent',
          galley_proof_sent_at: new Date().toISOString(),
          galley_proof_consent: false,
          galley_proof_revision_url: null,
        } as any)
        .eq('id', articleId);
      if (updateError) throw updateError;

      // 6. Create a short-lived signed URL the email can point to
      const signed = await supabase.storage
        .from('formatted-articles')
        .createSignedUrl(pdfPath, 7 * 24 * 60 * 60);

      const authorProfile = (article as any).profiles as any;
      const notificationEmail = (article as any).notification_email || authorProfile?.email;

      // 7. Send the proper galley-proof-review template email (with deadline + review link)
      if (notificationEmail) {
        await supabase.functions.invoke('send-email', {
          body: {
            to: notificationEmail,
            template: 'galley-proof-review',
            data: {
              authorName: authorProfile?.full_name || (article as any).author_name || 'Author',
              articleTitle: (article as any).title,
              referenceNumber: (article as any).reference_number,
              deadline: deadline.toLocaleString('en-US', {
                year: 'numeric', month: 'long', day: 'numeric',
                hour: '2-digit', minute: '2-digit',
              }),
              wordDownloadUrl: '',
              pdfDownloadUrl: signed.data?.signedUrl || '',
              isFirstPublication,
              publicationInfo: `${(article as any).publication_year || ''}; ${(article as any).volume || ''}(${(article as any).issue || ''}): ${(article as any).page_number || ''}`,
              publicationMonth: '',
            },
          },
        });
      }

      // 8. In-app notification for the author
      await supabase.from('notifications').insert({
        user_id: (article as any).author_id,
        title: 'Galley Proof Ready for Review 📄',
        message: `Your galley proof for "${(article as any).title}" is ready. Please review and respond by ${deadline.toLocaleDateString()}.`,
        type: 'info',
        link: '/author/articles',
      });

      toast.success('Galley proof generated, uploaded & sent to author!', { id: tid });
      queryClient.invalidateQueries({ queryKey: ['admin-formatting-articles'] });
      queryClient.invalidateQueries({ queryKey: ['admin-article-detail'] });
      queryClient.invalidateQueries({ queryKey: ['admin-galley-proofs'] });
      onClose();
    } catch (err: any) {
      console.error('Approve & send galley proof failed:', err);
      toast.error('Failed to send galley proof: ' + (err.message || 'Unknown error'), { id: tid });
    } finally {
      setApproving(false);
    }
  };

  // Open A4 preview — use the SAME pagination pipeline as PDF/Word exports
  // so editor preview, PDF, and Word stay perfectly in sync.
  const openPaginatedPreview = useCallback(async () => {
    setShowPreview(true);
    setPreviewBuilding(true);
    try {
      const html = getContent();
      const paged = await buildPagedFormattedArticleHtml(html, { startPage, showFirstPageNumber: true });
      setPreviewHtml(paged);
    } catch (e: any) {
      console.error(e);
      toast.error('Preview failed: ' + (e?.message || 'unknown error'));
    } finally {
      setPreviewBuilding(false);
    }
  }, [getContent, startPage]);

  const handleDownloadPdf = useCallback(async () => {
    try {
      toast.info('Building PDF…');
      await downloadFormattedAsPdf(getContent(), `formatted-${referenceNumber || 'article'}`, { startPage, showFirstPageNumber: true });
      toast.success('PDF ready');
    } catch (e: any) {
      toast.error('PDF export failed: ' + (e?.message || 'unknown error'));
    }
  }, [getContent, referenceNumber, startPage]);

  const handleDownloadDocx = useCallback(async () => {
    try {
      toast.info('Building Word file…');
      await downloadFormattedAsDocx(getContent(), `formatted-${referenceNumber || 'article'}`, { startPage, showFirstPageNumber: true });
      toast.success('Word file ready');
    } catch (e: any) {
      toast.error('Word export failed: ' + (e?.message || 'unknown error'));
    }
  }, [getContent, referenceNumber, startPage]);


  const ToolbarBtn = ({ cmd, value, icon: Icon, title }: { cmd: string; value?: string; icon: any; title: string }) => (
    <Button
      type="button" variant="ghost" size="sm"
      className="h-7 w-7 p-0 text-black/70 hover:text-black hover:bg-black/5"
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
          <div className="flex items-center gap-2 flex-wrap">
            {/* Column setting */}
            <div className="flex items-center gap-1.5">
              <Label className="text-xs text-muted-foreground">Columns:</Label>
              <Select value={String(columns)} onValueChange={(v) => setColumns(Number(v) as 1 | 2 | 3)}>
                <SelectTrigger className="h-7 w-[65px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 Col</SelectItem>
                  <SelectItem value="2">2 Col</SelectItem>
                  <SelectItem value="3">3 Col</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Line spacing */}
            <div className="flex items-center gap-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <MoveVertical className="w-3 h-3" /> Line:
              </Label>
              <Select value={lineHeight} onValueChange={setLineHeight}>
                <SelectTrigger className="h-7 w-[70px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['1.15', '1.3', '1.5', '1.6', '1.8', '2.0', '2.5'].map(v => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Paragraph spacing */}
            <div className="flex items-center gap-1.5">
              <Label className="text-xs text-muted-foreground">¶ Gap:</Label>
              <Select value={paraSpacing} onValueChange={setParaSpacing}>
                <SelectTrigger className="h-7 w-[70px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['0', '2', '4', '6', '8', '12', '16'].map(v => (
                    <SelectItem key={v} value={v}>{v}px</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Page number start */}
            <div className="flex items-center gap-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Hash className="w-3 h-3" /> Page #:
              </Label>
              <input
                type="number"
                min={1}
                value={startPage}
                onChange={(e) => setStartPage(Math.max(1, Number(e.target.value) || 1))}
                className="h-7 w-[55px] text-xs rounded border border-input bg-background px-2"
                title="Starting page number"
              />
            </div>

            {/* Image controls (only enabled when an image is selected) */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5 gap-1" title="Image">
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span className="text-[10px]">Image</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="text-xs">
                  {selectedImg ? 'Resize selected image' : 'Click an image to select'}
                </DropdownMenuLabel>
                <DropdownMenuItem onClick={() => resizeSelectedImage(25)}>Width 25%</DropdownMenuItem>
                <DropdownMenuItem onClick={() => resizeSelectedImage(50)}>Width 50%</DropdownMenuItem>
                <DropdownMenuItem onClick={() => resizeSelectedImage(75)}>Width 75%</DropdownMenuItem>
                <DropdownMenuItem onClick={() => resizeSelectedImage(100)}>Width 100%</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs">Crop (aspect ratio)</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => cropSelectedImage('1 / 1')}><Crop className="w-4 h-4 mr-2" /> Square 1:1</DropdownMenuItem>
                <DropdownMenuItem onClick={() => cropSelectedImage('4 / 3')}><Crop className="w-4 h-4 mr-2" /> 4:3</DropdownMenuItem>
                <DropdownMenuItem onClick={() => cropSelectedImage('16 / 9')}><Crop className="w-4 h-4 mr-2" /> 16:9</DropdownMenuItem>
                <DropdownMenuItem onClick={() => cropSelectedImage('3 / 4')}><Crop className="w-4 h-4 mr-2" /> 3:4 portrait</DropdownMenuItem>
                <DropdownMenuItem onClick={() => cropSelectedImage('none')}>Remove crop</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={removeSelectedImage} className="text-red-600">
                  <Trash2 className="w-4 h-4 mr-2" /> Delete image
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="ghost" size="sm" onClick={openPaginatedPreview}>
              <Eye className="w-4 h-4 mr-1" /> Preview A4
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* A4 page with embedded toolbar */}
        <style>{`
          @media (max-width: 900px) {
            .ww-a4-scroll { padding: 8px !important; }
            .ww-a4-shell { transform: scale(var(--ww-scale, 0.46)); transform-origin: top left; width: 210mm !important; max-width: none !important; margin-left: 0 !important; }
          }
          @media (max-width: 640px) { .ww-a4-shell { --ww-scale: 0.42; } }
          @media (max-width: 420px) { .ww-a4-shell { --ww-scale: 0.34; } }
        `}</style>
        <div className="overflow-auto rounded-lg" style={{ maxHeight: '78vh', background: '#e5e7eb', padding: '24px' }}>
          <div
            className="mx-auto shadow-lg rounded ww-a4-shell"
            style={{
              width: '210mm',
              maxWidth: '100%',
              minHeight: '297mm',
              background: '#ffffff',
            }}
          >
            {/* Toolbar */}
            <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 p-1.5 bg-[#f3f4f6] border-b border-[#d1d5db] rounded-t">
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
              <Select defaultValue="3" onValueChange={(v) => execCmd('fontSize', v)}>
                <SelectTrigger className="h-7 w-[55px] text-xs bg-white border-[#d1d5db] text-black">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONT_SIZES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}pt</SelectItem>)}
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
                  <DropdownMenuItem onClick={() => insertTable(3, 3)}><Grid3X3 className="w-4 h-4 mr-2" /> 3 × 3</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => insertTable(4, 4)}><Grid3X3 className="w-4 h-4 mr-2" /> 4 × 4</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => insertTable(5, 5)}><Grid3X3 className="w-4 h-4 mr-2" /> 5 × 5</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs">Table Actions</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => tableAction('add-row-above')}><Plus className="w-4 h-4 mr-2" /> Add Row Above</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => tableAction('add-row-below')}><Plus className="w-4 h-4 mr-2" /> Add Row Below</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => tableAction('add-col-left')}><Plus className="w-4 h-4 mr-2" /> Add Column Left</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => tableAction('add-col-right')}><Plus className="w-4 h-4 mr-2" /> Add Column Right</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => tableAction('delete-row')} className="text-red-600"><Minus className="w-4 h-4 mr-2" /> Delete Row</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => tableAction('delete-col')} className="text-red-600"><Minus className="w-4 h-4 mr-2" /> Delete Column</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => tableAction('delete-table')} className="text-red-600"><Trash2 className="w-4 h-4 mr-2" /> Delete Table</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs">Table Style</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => tableAction('style-')}>Default</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => tableAction('style-table-bordered')}><PaintBucket className="w-4 h-4 mr-2" /> Bold Borders</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => tableAction('style-table-minimal')}><PaintBucket className="w-4 h-4 mr-2" /> Minimal</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => tableAction('style-table-striped')}><PaintBucket className="w-4 h-4 mr-2" /> Striped Rows</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => tableAction('style-table-colored')}><PaintBucket className="w-4 h-4 mr-2" /> Colored Header</DropdownMenuItem>
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
                  <DropdownMenuItem onClick={() => insertLayout('two-col')}><Columns2 className="w-4 h-4 mr-2" /> Two Columns</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => insertLayout('three-col')}><Columns3 className="w-4 h-4 mr-2" /> Three Columns</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => insertLayout('sidebar-left')}><LayoutGrid className="w-4 h-4 mr-2" /> Sidebar Left</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => insertLayout('sidebar-right')}><LayoutGrid className="w-4 h-4 mr-2" /> Sidebar Right</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs">Insert Elements</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => insertHtmlAtCursor('<hr />')}><Minus className="w-4 h-4 mr-2" /> Horizontal Rule</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => insertHtmlAtCursor('<hr class="page-break" contenteditable="false" />')}><SeparatorHorizontal className="w-4 h-4 mr-2" /> Page Break</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="w-px h-5 bg-[#d1d5db] mx-1" />

              <Button
                type="button" variant="ghost" size="sm"
                className="h-7 px-1.5 text-black/70 hover:text-black hover:bg-black/5 gap-1"
                onClick={() => insertHtmlAtCursor('<hr class="page-break" contenteditable="false" />')}
                title="Insert Page Break"
              >
                <SeparatorHorizontal className="w-3.5 h-3.5" />
                <span className="text-[10px]">Break</span>
              </Button>

              <div className="w-px h-5 bg-[#d1d5db] mx-1" />

              {/* Text colour dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5 gap-1 text-black/70 hover:text-black hover:bg-black/5" title="Text colour">
                    <Palette className="w-3.5 h-3.5" />
                    <span className="text-[10px]">Colour</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-44">
                  <DropdownMenuLabel className="text-xs">Text colour</DropdownMenuLabel>
                  {[
                    { c: '#dc2626', label: 'Red (for corrections)' },
                    { c: '#000000', label: 'Black' },
                    { c: '#1d4ed8', label: 'Blue' },
                    { c: '#15803d', label: 'Green' },
                    { c: '#ea580c', label: 'Orange' },
                    { c: '#7c3aed', label: 'Purple' },
                    { c: '#6b7280', label: 'Grey' },
                  ].map((opt) => (
                    <DropdownMenuItem key={opt.c} onClick={() => applyColor(opt.c)}>
                      <span style={{ background: opt.c }} className="inline-block w-3 h-3 rounded-sm mr-2 border border-black/10" />
                      {opt.label}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={clearRedHighlights}>
                    <Eraser className="w-4 h-4 mr-2" /> Clear red highlights
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="w-px h-5 bg-[#d1d5db] mx-1" />

              <ToolbarBtn cmd="undo" icon={Undo} title="Undo" />
              <ToolbarBtn cmd="redo" icon={Redo} title="Redo" />
            </div>


            {/* Content area */}
            <div style={{ padding: '15mm' }}>
              <iframe
                ref={iframeRef}
                className="w-full border-0"
                style={{ minHeight: '260mm', height: '100%', display: 'block' }}
                title="Article Editor"
              />
            </div>
          </div>
        </div>

        {mode === 'author' && (
          <div className="mt-3 p-3 rounded-md border border-red-500/40 bg-red-500/10 text-sm text-red-700 dark:text-red-300">
            <strong>📝 Make changes as needed.</strong> Please <span className="font-semibold">highlight every edit using the <span style={{ color: '#dc2626' }}>red text colour</span></span> (use the “Colour” button in the toolbar) so the admin can spot your corrections quickly. When you’re done, click <em>Send Corrections to Admin</em>.
          </div>
        )}

        <div className="flex items-center justify-end gap-3 mt-4 flex-wrap">
          <Button variant="outline" onClick={openPaginatedPreview}>
            <Eye className="w-4 h-4 mr-2" /> Preview A4 Pages
          </Button>
          <DownloadButton onDownload={() => Promise.resolve(handleDownloadPdf())}>
            Download PDF
          </DownloadButton>
          <DownloadButton onDownload={() => Promise.resolve(handleDownloadDocx())}>
            Download Word
          </DownloadButton>
          {mode === 'admin' && (
            <>
              <Button variant="outline" onClick={handleSave} disabled={saving}>
                {saving ? <GlassSpinner size="sm" className="mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Save Draft
              </Button>
              <Button onClick={handleApproveAndSendGalleyProof} disabled={approving}>
                {approving ? <GlassSpinner size="sm" className="mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                Approve & Send Galley Proof
              </Button>
            </>
          )}
          {mode === 'author' && (
            <Button onClick={handleSendAuthorCorrections} disabled={approving} className="gradient-primary">
              {approving ? <GlassSpinner size="sm" className="mr-2" /> : <Send className="w-4 h-4 mr-2" />}
              Send Corrections to Admin
            </Button>
          )}
        </div>
      </GlassCard>

      {/* Paginated A4 Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-5xl max-h-[95vh] p-0 overflow-hidden">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle>A4 Page Preview — {referenceNumber}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto" style={{ height: '85vh', background: '#525659' }}>
            {previewBuilding ? (
              <div className="flex items-center justify-center h-full text-white/80">
                <GlassSpinner size="lg" className="mr-3" /> Building preview…
              </div>
            ) : (
              <iframe srcDoc={previewHtml} className="w-full h-full border-0" title="A4 Preview" style={{ minHeight: '85vh' }} />
            )}
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
<table width="100%" style="margin:28px 0;"><tr><td align="center"><a href="https://wwjmrdai.online/author/articles" style="display:inline-block;background-color:#00d4ff;color:#0d1528;font-family:${font};font-size:16px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:8px;">Review Galley Proof</a></td></tr></table>
<p style="font-family:${font};font-size:14px;color:#9ca3af;">If you have any questions, contact us at support@wwjmrd.com</p>
</td></tr>
<tr><td align="center" style="padding-top:24px;"><p style="font-family:${font};font-size:12px;color:#6b7280;margin:0;">&copy; ${new Date().getFullYear()} WWJMRD. All rights reserved.</p></td></tr>
</table></td></tr></table></body></html>`;
}
