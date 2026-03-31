import React, { useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import FontFamily from '@tiptap/extension-font-family';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Placeholder from '@tiptap/extension-placeholder';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  Undo,
  Redo,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
  Strikethrough,
  Highlighter,
  Palette,
  TableIcon,
  Plus,
  Trash2,
  Minus,
  Type,
} from 'lucide-react';

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  className?: string;
  placeholder?: string;
  minHeight?: string;
}

const FONT_FAMILIES = [
  { label: 'Times New Roman', value: 'Times New Roman' },
  { label: 'Arial', value: 'Arial' },
  { label: 'Georgia', value: 'Georgia' },
  { label: 'Verdana', value: 'Verdana' },
  { label: 'Courier New', value: 'Courier New' },
  { label: 'Helvetica', value: 'Helvetica' },
];

const FONT_SIZES = ['8', '9', '10', '11', '12', '14', '16', '18', '20', '24', '28', '32', '36', '48'];

const COLORS = [
  '#000000', '#434343', '#666666', '#999999', '#cccccc', '#ffffff',
  '#ff0000', '#ff6600', '#ffcc00', '#00cc00', '#0066ff', '#9900ff',
  '#cc0000', '#cc6600', '#cccc00', '#00aa00', '#0044cc', '#6600cc',
];

export function RichTextEditor({ content, onChange, className = '', placeholder, minHeight = '300px' }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
      }),
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Subscript,
      Superscript,
      FontFamily,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Placeholder.configure({ placeholder: placeholder || 'Start editing...' }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: `prose prose-sm max-w-none p-4 focus:outline-none`,
        style: `min-height: ${minHeight}; font-family: 'Times New Roman', serif;`,
      },
    },
  });

  if (!editor) return null;

  const ToolbarButton = ({
    onClick,
    isActive = false,
    children,
    title,
    disabled = false,
  }: {
    onClick: () => void;
    isActive?: boolean;
    children: React.ReactNode;
    title: string;
    disabled?: boolean;
  }) => (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={`h-7 w-7 p-0 ${isActive ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
      onClick={onClick}
      title={title}
      disabled={disabled}
    >
      {children}
    </Button>
  );

  const ToolbarDivider = () => <div className="w-px h-5 bg-border mx-1" />;

  return (
    <div className={`border border-border rounded-lg overflow-hidden bg-background ${className}`}>
      {/* Toolbar Row 1 - Font, Size, Colors */}
      <div className="flex flex-wrap items-center gap-1 p-1.5 border-b border-border bg-muted/30">
        {/* Font Family */}
        <Select
          value={editor.getAttributes('textStyle').fontFamily || 'Times New Roman'}
          onValueChange={(val) => editor.chain().focus().setFontFamily(val).run()}
        >
          <SelectTrigger className="h-7 w-[130px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FONT_FAMILIES.map((f) => (
              <SelectItem key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Font Size */}
        <Select
          value="12"
          onValueChange={(val) => {
            editor.chain().focus().run();
          }}
        >
          <SelectTrigger className="h-7 w-[60px] text-xs">
            <SelectValue placeholder="12" />
          </SelectTrigger>
          <SelectContent>
            {FONT_SIZES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <ToolbarDivider />

        {/* Text Color */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Text Color">
              <Palette className="w-3.5 h-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="start">
            <div className="grid grid-cols-6 gap-1">
              {COLORS.map((color) => (
                <button
                  key={color}
                  className="w-6 h-6 rounded border border-border hover:scale-110 transition-transform"
                  style={{ backgroundColor: color }}
                  onClick={() => editor.chain().focus().setColor(color).run()}
                  title={color}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Highlight */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className={`h-7 w-7 p-0 ${editor.isActive('highlight') ? 'bg-primary/20' : ''}`} title="Highlight">
              <Highlighter className="w-3.5 h-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="start">
            <div className="grid grid-cols-6 gap-1">
              {['#ffff00', '#00ff00', '#00ffff', '#ff00ff', '#ff6600', '#ff0000', 'transparent'].map((color) => (
                <button
                  key={color}
                  className="w-6 h-6 rounded border border-border hover:scale-110 transition-transform"
                  style={{ backgroundColor: color === 'transparent' ? 'transparent' : color }}
                  onClick={() => {
                    if (color === 'transparent') {
                      editor.chain().focus().unsetHighlight().run();
                    } else {
                      editor.chain().focus().toggleHighlight({ color }).run();
                    }
                  }}
                  title={color === 'transparent' ? 'Remove highlight' : color}
                >
                  {color === 'transparent' && <Minus className="w-4 h-4 mx-auto text-muted-foreground" />}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Toolbar Row 2 - Formatting */}
      <div className="flex flex-wrap items-center gap-0.5 p-1.5 border-b border-border bg-muted/30">
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} isActive={editor.isActive('bold')} title="Bold (Ctrl+B)">
          <Bold className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive('italic')} title="Italic (Ctrl+I)">
          <Italic className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} isActive={editor.isActive('underline')} title="Underline (Ctrl+U)">
          <UnderlineIcon className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} isActive={editor.isActive('strike')} title="Strikethrough">
          <Strikethrough className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleSubscript().run()} isActive={editor.isActive('subscript')} title="Subscript">
          <SubscriptIcon className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleSuperscript().run()} isActive={editor.isActive('superscript')} title="Superscript">
          <SuperscriptIcon className="w-3.5 h-3.5" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} isActive={editor.isActive('heading', { level: 1 })} title="Heading 1">
          <Heading1 className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} isActive={editor.isActive('heading', { level: 2 })} title="Heading 2">
          <Heading2 className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} isActive={editor.isActive('heading', { level: 3 })} title="Heading 3">
          <Heading3 className="w-3.5 h-3.5" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('left').run()} isActive={editor.isActive({ textAlign: 'left' })} title="Align Left">
          <AlignLeft className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('center').run()} isActive={editor.isActive({ textAlign: 'center' })} title="Align Center">
          <AlignCenter className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('right').run()} isActive={editor.isActive({ textAlign: 'right' })} title="Align Right">
          <AlignRight className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('justify').run()} isActive={editor.isActive({ textAlign: 'justify' })} title="Justify">
          <AlignJustify className="w-3.5 h-3.5" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} isActive={editor.isActive('bulletList')} title="Bullet List">
          <List className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} isActive={editor.isActive('orderedList')} title="Numbered List">
          <ListOrdered className="w-3.5 h-3.5" />
        </ToolbarButton>

        <ToolbarDivider />

        {/* Table controls */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Insert Table">
              <TableIcon className="w-3.5 h-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="start">
            <div className="space-y-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-xs"
                onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
              >
                <Plus className="w-3 h-3 mr-1.5" /> Insert 3×3 Table
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-xs"
                onClick={() => editor.chain().focus().insertTable({ rows: 4, cols: 4, withHeaderRow: true }).run()}
              >
                <Plus className="w-3 h-3 mr-1.5" /> Insert 4×4 Table
              </Button>
              {editor.isActive('table') && (
                <>
                  <div className="border-t border-border my-1" />
                  <Button variant="ghost" size="sm" className="w-full justify-start text-xs" onClick={() => editor.chain().focus().addColumnAfter().run()}>
                    Add Column After
                  </Button>
                  <Button variant="ghost" size="sm" className="w-full justify-start text-xs" onClick={() => editor.chain().focus().addRowAfter().run()}>
                    Add Row After
                  </Button>
                  <Button variant="ghost" size="sm" className="w-full justify-start text-xs text-destructive" onClick={() => editor.chain().focus().deleteColumn().run()}>
                    Delete Column
                  </Button>
                  <Button variant="ghost" size="sm" className="w-full justify-start text-xs text-destructive" onClick={() => editor.chain().focus().deleteRow().run()}>
                    Delete Row
                  </Button>
                  <Button variant="ghost" size="sm" className="w-full justify-start text-xs text-destructive" onClick={() => editor.chain().focus().deleteTable().run()}>
                    <Trash2 className="w-3 h-3 mr-1.5" /> Delete Table
                  </Button>
                </>
              )}
            </div>
          </PopoverContent>
        </Popover>

        <ToolbarDivider />

        <ToolbarButton onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal Line">
          <Minus className="w-3.5 h-3.5" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} title="Undo (Ctrl+Z)" disabled={!editor.can().undo()}>
          <Undo className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} title="Redo (Ctrl+Y)" disabled={!editor.can().redo()}>
          <Redo className="w-3.5 h-3.5" />
        </ToolbarButton>
      </div>

      {/* Editor Content */}
      <div className="overflow-auto" style={{ maxHeight: '70vh' }}>
        <EditorContent editor={editor} />
      </div>

      {/* Editor styles */}
      <style>{`
        .ProseMirror table {
          border-collapse: collapse;
          width: 100%;
          margin: 8px 0;
        }
        .ProseMirror td, .ProseMirror th {
          border: 1px solid hsl(var(--border));
          padding: 6px 8px;
          min-width: 60px;
          vertical-align: top;
        }
        .ProseMirror th {
          background: hsl(var(--muted));
          font-weight: 600;
        }
        .ProseMirror .selectedCell {
          background: hsl(var(--primary) / 0.1);
        }
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: hsl(var(--muted-foreground));
          pointer-events: none;
          height: 0;
        }
        .ProseMirror hr {
          border: none;
          border-top: 1px solid hsl(var(--border));
          margin: 16px 0;
        }
      `}</style>
    </div>
  );
}
