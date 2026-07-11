// Shared inline (WYSIWYG) Markdown editor built on MDXEditor (Lexical).
//
// Notion-style: you type and it renders live — headings, **bold**, tables, code
// blocks with syntax highlighting, links, images, admonitions, frontmatter — and
// emits clean GFM markdown, so it is drop-in compatible with everything that
// already stores `content_markdown` + renders it with react-markdown + remark-gfm.
//
// A Rich / Source / Diff toggle (top-right of the toolbar) lets power users drop to
// raw markdown at any time. Themed to the platform's light/dark tokens via
// MarkdownEditor.css (the `dark-theme` class is toggled from ThemeContext).
import React, { forwardRef, useMemo } from 'react';
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

import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/integrations/supabase/client';
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
        directivesPlugin({ directiveDescriptors: [AdmonitionDirectiveDescriptor] }),
        frontmatterPlugin(),
        markdownShortcutPlugin(),
        diffSourcePlugin({ viewMode: 'rich-text', diffMarkdown: value }),
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
      // `value` is intentionally excluded — MDXEditor is uncontrolled after mount
      // (updates flow through the ref / onChange). Including it would rebuild the
      // plugin list on every keystroke. diffMarkdown seeds the initial diff base.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [uploadHandler],
    );

    return (
      // The min-height CSS var is set on the wrapper (custom props inherit down to
      // the editable surface). MDXEditorProps has no `style`, so we can't put it there.
      <div style={{ ['--mk-editor-min-height' as string]: `${minHeight}px` }}>
        <MDXEditor
          ref={ref}
          markdown={value}
          onChange={onChange}
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
