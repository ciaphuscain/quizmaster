import { useEffect } from 'react';
import { useEditor as useTiptap, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Italic, Underline, List, ListOrdered, Strikethrough, Heading2 } from 'lucide-react';
import type { RichNode } from '@/types/schema';
import { Button } from '@/components/ui/primitives';

/** Tiptap-backed rich text editor storing ProseMirror JSON. */
export function RichTextEditor({ value, onChange, placeholder, minHeight = 96, testId, autoFocusEvent }: {
  value: RichNode; onChange: (doc: RichNode) => void; placeholder?: string; minHeight?: number; testId?: string; autoFocusEvent?: string;
}) {
  const editor = useTiptap({
    extensions: [StarterKit.configure({ heading: { levels: [1, 2] } })],
    content: value as object,
    onUpdate: ({ editor }) => onChange(editor.getJSON() as RichNode),
    editorProps: { attributes: { class: 'tiptap px-2.5 py-2 text-[13px]', 'aria-label': placeholder ?? 'Rich text', ...(testId ? { 'data-testid': testId } : {}) } },
  });
  // sync external changes (undo/redo, template apply)
  useEffect(() => {
    if (!editor) return;
    const cur = JSON.stringify(editor.getJSON());
    if (cur !== JSON.stringify(value)) editor.commands.setContent(value as object, { emitUpdate: false });
  }, [value, editor]);
  useEffect(() => {
    if (!autoFocusEvent || !editor) return;
    const h = () => editor.commands.focus('end');
    window.addEventListener(autoFocusEvent, h);
    return () => window.removeEventListener(autoFocusEvent, h);
  }, [editor, autoFocusEvent]);
  if (!editor) return null;
  const B = ({ on, active, icon, label }: { on: () => void; active: boolean; icon: React.ReactNode; label: string }) => (
    <Button size="icon-sm" variant="ghost" active={active} tooltip={label} onMouseDown={(e) => e.preventDefault()} onClick={on}>{icon}</Button>
  );
  return (
    <div className="rounded-md border border-line bg-panel-2 focus-within:border-accent">
      <div className="flex gap-0.5 border-b border-line p-1">
        <B label="Bold (Ctrl+B)" active={editor.isActive('bold')} on={() => editor.chain().focus().toggleBold().run()} icon={<Bold size={13} />} />
        <B label="Italic (Ctrl+I)" active={editor.isActive('italic')} on={() => editor.chain().focus().toggleItalic().run()} icon={<Italic size={13} />} />
        <B label="Underline (Ctrl+U)" active={editor.isActive('underline')} on={() => editor.chain().focus().toggleUnderline().run()} icon={<Underline size={13} />} />
        <B label="Strikethrough" active={editor.isActive('strike')} on={() => editor.chain().focus().toggleStrike().run()} icon={<Strikethrough size={13} />} />
        <B label="Heading" active={editor.isActive('heading')} on={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} icon={<Heading2 size={13} />} />
        <B label="Bullet list" active={editor.isActive('bulletList')} on={() => editor.chain().focus().toggleBulletList().run()} icon={<List size={13} />} />
        <B label="Numbered list" active={editor.isActive('orderedList')} on={() => editor.chain().focus().toggleOrderedList().run()} icon={<ListOrdered size={13} />} />
      </div>
      <div style={{ minHeight }}><EditorContent editor={editor} /></div>
    </div>
  );
}
