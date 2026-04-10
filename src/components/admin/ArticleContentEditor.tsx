import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/layout/GlassCard';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import {
  Save, CheckCircle, X, Eye, Bold, Italic, Underline,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Undo, Redo, Strikethrough,
  Table2, Columns2, Columns3, LayoutGrid, Minus, Plus,
  Trash2, PaintBucket, Grid3X3, SeparatorHorizontal, Hash,
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
}: ArticleContentEditorProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [ready, setReady] = useState(false);
  const [columns, setColumns] = useState<1 | 2 | 3>(1);
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
    // Ensure iframe has focus before executing commands
    iframeRef.current?.contentWindow?.focus();
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

  // Build paginated A4 preview HTML
  const buildPaginatedPreview = () => {
    const content = getContent();
    const colStyle = columns > 1 ? `column-count: ${columns}; column-gap: 16px;` : '';
    const contentWidthMM = A4_WIDTH_MM - MARGIN_MM * 2;
    
    return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Times New Roman', Times, serif; background: #525659; padding: 20px; }
  
  .a4-page {
    background: white;
    width: ${A4_WIDTH_MM}mm;
    min-height: ${A4_HEIGHT_MM}mm;
    max-height: ${A4_HEIGHT_MM}mm;
    margin: 0 auto 20px;
    padding: ${MARGIN_MM}mm;
    box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  
  .page-content {
    flex: 1;
    overflow: hidden;
  }
  
  .page-footer {
    text-align: center;
    font-size: 10px;
    color: #555;
    padding-top: 8px;
    border-top: 1px solid #ddd;
    margin-top: auto;
    font-family: 'Times New Roman', serif;
    height: ${FOOTER_HEIGHT_MM}mm;
    flex-shrink: 0;
  }
  
  .page-content h1 { font-size: 16px; text-align: center; margin: 12px 0; font-weight: bold; }
  .page-content h2 { font-size: 14px; margin: 16px 0 8px; font-weight: bold; }
  .page-content h3 { font-size: 13px; margin: 12px 0 6px; font-weight: bold; }
  .page-content p { text-align: justify; font-size: 11px; line-height: 1.6; margin: 4px 0; }
  .page-content strong { font-weight: bold; }
  .page-content em { font-style: italic; }
  .page-content ul, .page-content ol { margin: 4px 0 4px 20px; font-size: 11px; }
  .page-content table { border-collapse: collapse; width: 100%; margin: 8px 0; }
  .page-content td, .page-content th { border: 1px solid #999; padding: 4px 6px; font-size: 10px; }
  .page-content th { background: #f0f0f0; font-weight: bold; }
  .page-content hr { border: none; border-top: 1px solid #ccc; margin: 12px 0; }
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
  
  .page-break { display: none; }
  
  @media print {
    body { background: white; padding: 0; }
    .a4-page { box-shadow: none; margin: 0; page-break-after: always; height: auto; min-height: ${A4_HEIGHT_MM}mm; }
    .a4-page:last-child { page-break-after: auto; }
  }
</style>
<script>
  window.addEventListener('load', function() {
    var body = document.body;
    var rawContent = document.getElementById('raw-content');
    var rawHTML = rawContent.innerHTML;
    rawContent.style.display = 'none';
    var container = document.getElementById('pages-container');
    var colStyle = '${colStyle}';
    
    // mm to px conversion (96dpi)
    var maxH = ${CONTENT_HEIGHT_MM} * 3.7795;
    
    // Split by explicit page breaks
    var sections = rawHTML.split(/<hr[^>]*class=["']page-break["'][^>]*\\/?>/gi);
    var pageNum = 1;
    
    for (var s = 0; s < sections.length; s++) {
      var secHTML = sections[s].trim();
      if (!secHTML) continue;
      
      // Parse into child elements
      var tmp = document.createElement('div');
      tmp.innerHTML = secHTML;
      var children = [];
      for (var i = 0; i < tmp.childNodes.length; i++) {
        var n = tmp.childNodes[i];
        if (n.nodeType === 1) children.push(n.outerHTML);
        else if (n.nodeType === 3 && n.textContent.trim()) children.push(n.textContent);
      }
      
      if (children.length === 0) continue;
      
      // Measure each element incrementally
      var measure = document.createElement('div');
      measure.style.cssText = 'position:absolute;visibility:hidden;left:-9999px;width:${contentWidthMM}mm;font-family:Times New Roman,serif;font-size:11px;line-height:1.6;';
      if (colStyle) { measure.style.columnCount = '${columns}'; measure.style.columnGap = '16px'; }
      body.appendChild(measure);
      
      var currentContent = '';
      
      for (var j = 0; j < children.length; j++) {
        var elHTML = children[j];
        measure.innerHTML = currentContent + elHTML;
        
        if (measure.scrollHeight > maxH && currentContent.trim()) {
          // Page full — emit current content as page
          createPage(container, currentContent, pageNum++, colStyle);
          currentContent = elHTML;
          measure.innerHTML = elHTML;
          
          // If single element still exceeds page, emit it anyway
          if (measure.scrollHeight > maxH) {
            createPage(container, currentContent, pageNum++, colStyle);
            currentContent = '';
            measure.innerHTML = '';
          }
        } else {
          currentContent += elHTML;
        }
      }
      
      if (currentContent.trim()) {
        createPage(container, currentContent, pageNum++, colStyle);
      }
      
      body.removeChild(measure);
    }
    
    // Update totals
    var total = pageNum - 1;
    var spans = document.querySelectorAll('.page-total');
    for (var k = 0; k < spans.length; k++) spans[k].textContent = total;
  });
  
  function createPage(container, content, pageNum, colStyle) {
    var page = document.createElement('div');
    page.className = 'a4-page';
    page.innerHTML = '<div class="page-content" style="' + colStyle + '">' + content + '</div>' +
      '<div class="page-footer">~ ' + pageNum + ' / <span class="page-total">...</span> ~</div>';
    container.appendChild(page);
  }
</script>
</head><body>
<div id="raw-content" style="display:none;">${content}</div>
<div id="pages-container"></div>
</body></html>`;
  };

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
          <div className="flex items-center gap-2">
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
            <Button variant="ghost" size="sm" onClick={() => setShowPreview(true)}>
              <Eye className="w-4 h-4 mr-1" /> Preview A4
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* A4 page with embedded toolbar */}
        <div className="overflow-auto rounded-lg" style={{ maxHeight: '78vh', background: '#e5e7eb', padding: '24px' }}>
          <div
            className="mx-auto shadow-lg rounded"
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

        <div className="flex items-center justify-end gap-3 mt-4">
          <Button variant="outline" onClick={() => setShowPreview(true)}>
            <Eye className="w-4 h-4 mr-2" /> Preview A4 Pages
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

      {/* Paginated A4 Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-5xl max-h-[95vh] p-0 overflow-hidden">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle>A4 Page Preview — {referenceNumber} ({columns}-column layout)</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto" style={{ height: '85vh', background: '#525659' }}>
            <iframe srcDoc={buildPaginatedPreview()} className="w-full h-full border-0" title="A4 Preview" style={{ minHeight: '85vh' }} />
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
