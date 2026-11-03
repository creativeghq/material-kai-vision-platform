// Shared inline (WYSIWYG) Markdown editor built on MDXEditor (Lexical); emits GFM
// markdown, so it is drop-in compatible with content rendered by react-markdown.
import React, { forwardRef, useMemo, useState } from 'react';
import {
  MDXEditor,
  type MDXEditorMethods,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  markdownShortcutPlugin,
  linkPlugin,
  linkDialogPlugin,
  imagePlugin,
  tablePlugin,
  codeBlockPlugin,
  codeMirrorPlugin,
  frontmatterPlugin,
  diffSourcePlugin,
  directivesPlugin,
  AdmonitionDirectiveDescriptor,
  toolbarPlugin,
  UndoRedo,
  BoldItalicUnderlineToggles,
  StrikeThroughSupSubToggles,
  ListsToggle,
  BlockTypeSelect,
  CreateLink,
  InsertImage,
  InsertTable,
  InsertThematicBreak,
  InsertCodeBlock,
  InsertAdmonition,
  InsertFrontmatter,
  Separator,
  DiffSourceToggleWrapper,
  ConditionalContents,
  ChangeCodeMirrorLanguage,
} from '@mdxeditor/editor';
import '@mdxeditor/editor/style.css';

import { Textarea } from '@/components/core/ui/textarea';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/integrations/supabase/client';
import { toEditorMarkdown } from './markdownEditorInput';
import './MarkdownEditor.css';

// Languages offered in the code-block language dropdown. `text` is the default
// (plain fenced block); the rest cover what appears in KB/docs content.
const CODE_BLOCK_LANGUAGES: Record<string, string> = {
  text: 'Plain text',
  ts: 'TypeScript',
  tsx: 'TSX',
  js: 'JavaScript',
  jsx: 'JSX',
  json: 'JSON',
  python: 'Python',
  bash: 'Shell',
  sql: 'SQL',
  html: 'HTML',
  css: 'CSS',
  yaml: 'YAML',
  markdown: 'Markdown',
  '': 'None',
};

// Upload pasted/selected images into the public generation-images bucket under a
// docs-images/ prefix and hand MDXEditor the public URL. Falls back to letting the
// user paste a URL if the upload fails (MDXEditor surfaces the rejection).
async function defaultImageUploadHandler(file: File): Promise<string> {
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const rand = Math.random().toString(36).slice(2);
  const path = `docs-images/${Date.now()}-${rand}.${ext}`;
  const { error } = await supabase.storage
    .from('generation-images')
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from('generation-images').getPublicUrl(path);
  return data.publicUrl;
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
   * Override the image upload handler. Pass `null` to disable uploads entirely
   * (image dialog then accepts a URL only). Defaults to the generation-images
   * bucket uploader.
   */
  imageUploadHandler?: ((file: File) => Promise<string>) | null;
}

/**
 * Inline markdown editor. Forwards a ref exposing MDXEditor's imperative methods
 * (`getMarkdown()`, `setMarkdown()`, `insertMarkdown()`, `focus()`).
 */
export const MarkdownEditor = forwardRef<MDXEditorMethods, MarkdownEditorProps>(
  function MarkdownEditor(
    { value, onChange, placeholder, minHeight = 320, readOnly, className, imageUploadHandler },
    ref,
  ) {
    const { theme } = useTheme();
    const [initialMarkdown] = useState(() => toEditorMarkdown(value));
    const [parseError, setParseError] = useState<string | null>(null);

    const uploadHandler = useMemo(
      () => (imageUploadHandler === undefined ? defaultImageUploadHandler : imageUploadHandler),
      [imageUploadHandler],
    );

    const plugins = useMemo(
      () => [
        headingsPlugin(),
        listsPlugin(),
        quotePlugin(),
        thematicBreakPlugin(),
        linkPlugin(),
        linkDialogPlugin(),
        tablePlugin(),
        imagePlugin(uploadHandler ? { imageUploadHandler: uploadHandler } : {}),
        codeBlockPlugin({ defaultCodeBlockLanguage: 'text' }),
        codeMirrorPlugin({ codeBlockLanguages: CODE_BLOCK_LANGUAGES }),
        directivesPlugin({ directiveDescriptors: [AdmonitionDirectiveDescriptor], escapeUnknownTextDirectives: true }),
        frontmatterPlugin(),
        markdownShortcutPlugin(),
        diffSourcePlugin({ viewMode: 'rich-text', diffMarkdown: initialMarkdown }),
        toolbarPlugin({
          toolbarContents: () => (
            <DiffSourceToggleWrapper>
              <ConditionalContents
                options={[
                  {
                    when: (editor) => editor?.editorType === 'codeblock',
                    contents: () => <ChangeCodeMirrorLanguage />,
                  },
                  {
                    fallback: () => (
                      <>
                        <UndoRedo />
                        <Separator />
                        <BoldItalicUnderlineToggles />
                        <StrikeThroughSupSubToggles />
                        <Separator />
                        <ListsToggle />
                        <Separator />
                        <BlockTypeSelect />
                        <Separator />
                        <CreateLink />
                        <InsertImage />
                        <Separator />
                        <InsertTable />
                        <InsertThematicBreak />
                        <InsertCodeBlock />
                        <InsertAdmonition />
                        <Separator />
                        <InsertFrontmatter />
                      </>
                    ),
                  },
                ]}
              />
            </DiffSourceToggleWrapper>
          ),
        }),
      ],
      [uploadHandler, initialMarkdown],
    );

    if (parseError) {
      return (
        <div className={className}>
          <p className="mb-2 text-xs text-muted-foreground">
            The rich editor could not read this document ({parseError}), so it is open as plain Markdown.
          </p>
          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            readOnly={readOnly}
            placeholder={placeholder}
            className="font-mono text-xs"
            style={{ minHeight }}
          />
        </div>
      );
    }

    return (
      // The min-height CSS var is set on the wrapper (custom props inherit down to
      // the editable surface). MDXEditorProps has no `style`, so we can't put it there.
      <div style={{ ['--mk-editor-min-height' as string]: `${minHeight}px` }}>
        <MDXEditor
          ref={ref}
          markdown={initialMarkdown}
          onChange={onChange}
          onError={({ error }) => setParseError(error)}
          readOnly={readOnly}
          placeholder={placeholder}
          plugins={plugins}
          className={`mk-mdxeditor ${theme === 'dark' ? 'dark-theme' : ''} ${className ?? ''}`}
        />
      </div>
    );
  },
);

export default MarkdownEditor;
