// Shared inline (Notion-style) block editor built on Yoopta-Editor v6.
//
// Type `/` for the block menu, drag blocks to reorder, select text for the
// floating toolbar. Genuine Notion/Craft feel — headings, lists, todo, tables,
// code (Shiki-highlighted), links, images, blockquotes, dividers.
//
// IMPORTANT — storage contract: this platform stores `content_markdown` and the
// KAI agent reads KB/docs via markdown (FTS + embeddings). Yoopta's native value
// is block JSON, so this wrapper keeps a MARKDOWN in / MARKDOWN out boundary via
// @yoopta/exports: it deserializes the incoming markdown on mount (and on genuine
// external changes, e.g. switching docs) and serializes back to markdown on every
// edit. The plugin set is deliberately limited to markdown-representable blocks —
// no callout/embed/accordion, which would be dropped on save into a markdown column.
//
// Theming: @yoopta/themes-shadcn consumes the same shadcn CSS tokens the app
// already defines, so light/dark tracks the existing `.dark` class automatically.
import React, { useEffect, useMemo, useRef } from 'react';
import YooptaEditor, {
  createYooptaEditor,
  type YooptaContentValue,
} from '@yoopta/editor';
import Paragraph from '@yoopta/paragraph';
import { HeadingOne, HeadingTwo, HeadingThree } from '@yoopta/headings';
import { BulletedList, NumberedList, TodoList } from '@yoopta/lists';
import Blockquote from '@yoopta/blockquote';
import { Code } from '@yoopta/code';
import Link from '@yoopta/link';
import Image, { type ImageElementProps } from '@yoopta/image';
import Table from '@yoopta/table';
import Divider from '@yoopta/divider';
import { Bold, Italic, Underline, Strike, CodeMark, Highlight } from '@yoopta/marks';
import { FloatingToolbar, FloatingBlockActions, SlashCommandMenu } from '@yoopta/ui';
import { applyTheme } from '@yoopta/themes-shadcn';
import { markdown } from '@yoopta/exports';

import { supabase } from '@/integrations/supabase/client';
import './MarkdownEditor.css';

const MARKS = [Bold, Italic, Underline, Strike, CodeMark, Highlight];

// Upload pasted/selected images into the public generation-images bucket under a
// docs-images/ prefix and return the block src. Yoopta surfaces a rejection if the
// upload fails; the user can still paste an image URL.
async function defaultImageUpload(file: File): Promise<ImageElementProps> {
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const rand = Math.random().toString(36).slice(2);
  const path = `docs-images/${Date.now()}-${rand}.${ext}`;
  const { error } = await supabase.storage
    .from('generation-images')
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from('generation-images').getPublicUrl(path);
  return { id: null, src: data.publicUrl, alt: file.name };
}

export interface MarkdownEditorProps {
  /** Current markdown value. */
  value: string;
  /** Called with the new markdown on every edit. */
  onChange: (markdown: string) => void;
  placeholder?: string;
  /** Minimum height of the editable surface. Default 320px. */
  minHeight?: number;
  readOnly?: boolean;
  className?: string;
  /**
   * Override the image upload handler (file → block props). Pass `null` to disable
   * uploads (URL paste still works). Defaults to the generation-images uploader.
   */
  imageUpload?: ((file: File) => Promise<ImageElementProps>) | null;
}

/**
 * Inline Notion-style editor with a markdown-in / markdown-out contract, so it is
 * a drop-in for anything that stores `content_markdown`.
 */
export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  value,
  onChange,
  placeholder = 'Type / for commands…',
  minHeight = 320,
  readOnly,
  className,
  imageUpload,
}) => {
  const uploadFn = imageUpload === undefined ? defaultImageUpload : imageUpload;
  // Stable ref so onChange/effects always call the latest parent handler without
  // rebuilding the editor.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // The last markdown this editor emitted — lets the seeding effect distinguish a
  // genuine external value change (switch docs) from the echo of our own edit, so
  // typing never resets the cursor.
  const lastMarkdownRef = useRef<string | null>(null);

  const editor = useMemo(() => {
    const imagePlugin = uploadFn ? Image.extend({ options: { upload: uploadFn } }) : Image;
    const plugins = applyTheme([
      Paragraph,
      HeadingOne,
      HeadingTwo,
      HeadingThree,
      BulletedList,
      NumberedList,
      TodoList,
      Blockquote,
      Code,
      Link,
      imagePlugin,
      Table,
      Divider,
    ]);
    return createYooptaEditor({ plugins, marks: MARKS, readOnly });
    // Editor is created once; content flows through the seeding effect + onChange.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Seed from markdown on mount and on genuine external changes.
  useEffect(() => {
    if (value === lastMarkdownRef.current) return; // echo of our own edit — ignore
    const content = markdown.deserialize(editor, value || '');
    editor.setEditorValue(content);
    lastMarkdownRef.current = value;
  }, [editor, value]);

  const handleChange = (content: YooptaContentValue) => {
    const md = markdown.serialize(editor, content);
    lastMarkdownRef.current = md;
    onChangeRef.current(md);
  };

  return (
    <div
      className={`mk-yoopta ${className ?? ''}`}
      style={{ ['--mk-editor-min-height' as string]: `${minHeight}px` }}
    >
      <YooptaEditor
        editor={editor}
        onChange={handleChange}
        placeholder={placeholder}
        className="mk-yoopta-editor"
      >
        {!readOnly && (
          <>
            <FloatingToolbar />
            <FloatingBlockActions />
            <SlashCommandMenu />
          </>
        )}
      </YooptaEditor>
    </div>
  );
};

export default MarkdownEditor;
