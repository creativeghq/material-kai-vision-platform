// Shared inline (Notion-style) block editor built on Yoopta-Editor v6.
//
// SOURCE OF TRUTH = Yoopta block-JSON (`value`). On every edit this also generates
// a markdown projection, and callers persist BOTH: the JSON (so fancy blocks —
// callout / embed / accordion — survive round-trips losslessly) and the markdown
// (so the KAI agent's FTS + embeddings, the public KB page, and legacy consumers
// keep reading plain markdown/text, never a JSON blob).
//
// Legacy rows (no JSON yet) seed from `fallbackMarkdown`; the first save backfills
// the JSON column. Re-seeding is keyed on `seedKey` (the doc id) so switching docs
// reloads content while typing never resets the cursor.
//
// Theming: @yoopta/themes-shadcn consumes the app's existing shadcn CSS tokens, so
// light/dark tracks the global `.dark` class automatically.
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
import Callout from '@yoopta/callout';
import Accordion from '@yoopta/accordion';
import Embed from '@yoopta/embed';
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

const isNonEmpty = (v: YooptaContentValue | null | undefined): v is YooptaContentValue =>
  !!v && typeof v === 'object' && Object.keys(v).length > 0;

export interface MarkdownEditorProps {
  /** Yoopta block-JSON value = source of truth. Null/undefined for legacy rows. */
  value?: YooptaContentValue | null;
  /** Legacy markdown, used to seed the editor ONLY when `value` is empty. */
  fallbackMarkdown?: string;
  /**
   * Re-seeds the editor when it changes (pass the doc id, or 'new'). Stable while
   * editing a single doc so typing never resets; changes on doc switch to reload.
   */
  seedKey?: string | null;
  /**
   * Fires on every edit with BOTH the block-JSON (persist as source of truth) and
   * the generated markdown (persist for agents / embeddings / public rendering).
   */
  onChange: (json: YooptaContentValue, markdown: string) => void;
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
 * Inline Notion-style block editor with JSON-source-of-truth + markdown projection.
 */
export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  value,
  fallbackMarkdown,
  seedKey,
  onChange,
  placeholder = 'Type / for commands…',
  minHeight = 320,
  readOnly,
  className,
  imageUpload,
}) => {
  const uploadFn = imageUpload === undefined ? defaultImageUpload : imageUpload;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // Latest seed inputs, read inside the seed effect so it only depends on seedKey.
  const valueRef = useRef(value);
  valueRef.current = value;
  const fallbackRef = useRef(fallbackMarkdown);
  fallbackRef.current = fallbackMarkdown;

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
      Callout,
      Code,
      Link,
      imagePlugin,
      Table,
      Divider,
      Accordion,
      Embed,
    ]);
    return createYooptaEditor({ plugins, marks: MARKS, readOnly });
    // Editor is created once; content flows through the seed effect + onChange.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Seed on mount and on genuine doc switches (seedKey change). JSON wins; markdown
  // is only deserialized as a fallback for legacy rows that have no JSON yet.
  useEffect(() => {
    const v = valueRef.current;
    const content = isNonEmpty(v)
      ? v
      : fallbackRef.current
        ? markdown.deserialize(editor, fallbackRef.current)
        : null;
    if (isNonEmpty(content)) editor.setEditorValue(content);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, seedKey]);

  const handleChange = (content: YooptaContentValue) => {
    const md = markdown.serialize(editor, content);
    onChangeRef.current(content, md);
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
