import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Loader2, Copy, RefreshCw,
  Image as ImageIcon, SkipForward, Check,
} from 'lucide-react';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Textarea } from '@/components/core/ui/textarea';
import { Label } from '@/components/core/ui/label';
import { Input } from '@/components/core/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { GlobalAdminHeader } from '@/components/Admin/GlobalAdminHeader';

// ── Types ──────────────────────────────────────────────────────────────────────

interface SocialAccount {
  id: string;
  platform: string;
  handle: string;
}

interface CaptionVariant {
  text: string;
  hashtags: string;
}

type PostType   = 'image' | 'video' | 'carousel';
type Tone       = 'professional' | 'casual' | 'inspirational' | 'promotional';
type AspectRatio = '1:1' | '4:5' | '9:16' | '16:9';
type ImageModel = 'aurora' | 'gemini' | 'flux' | 'auto';

const TONES: { value: Tone; label: string }[] = [
  { value: 'professional',  label: 'Professional'  },
  { value: 'casual',        label: 'Casual'        },
  { value: 'inspirational', label: 'Inspirational' },
  { value: 'promotional',   label: 'Promotional'   },
];

const POST_TYPES: { value: PostType; label: string }[] = [
  { value: 'image',    label: '🖼 Image'    },
  { value: 'video',    label: '🎬 Video'    },
  { value: 'carousel', label: '🎠 Carousel' },
];

const IMAGE_MODELS: {
  id: ImageModel; label: string; desc: string; credits: number;
}[] = [
  { id: 'aurora', label: 'Aurora',  desc: 'Lifestyle / People', credits: 10 },
  { id: 'gemini', label: 'Gemini',  desc: 'Product / Interior', credits: 5  },
  { id: 'flux',   label: 'FLUX',    desc: 'Artistic',           credits: 6  },
  { id: 'auto',   label: 'Auto',    desc: 'Recommended',        credits: 5  },
];

const ASPECT_RATIOS: AspectRatio[] = ['1:1', '4:5', '9:16', '16:9'];

const PLATFORM_EMOJI: Record<string, string> = {
  instagram: '📸', facebook: '📘', linkedin: '💼', tiktok: '🎵',
  pinterest: '📌', youtube: '▶️', twitter: '🐦', threads: '🧵',
};

// ── Step indicator ─────────────────────────────────────────────────────────────

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 justify-center mb-6">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-2 rounded-full transition-all ${
            i === current
              ? 'w-6 bg-primary'
              : i < current
              ? 'w-2 bg-primary/40'
              : 'w-2 bg-muted'
          }`}
        />
      ))}
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export function SocialMediaCreatePage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep]     = useState(0);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [accounts, setAccounts]       = useState<SocialAccount[]>([]);

  // Step 1
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [postType,           setPostType]          = useState<PostType>('image');

  // Step 2
  const [topic,        setTopic]        = useState('');
  const [tone,         setTone]         = useState<Tone>('professional');
  const [productInfo,  setProductInfo]  = useState('');

  // Step 3
  const [captions,         setCaptions]         = useState<CaptionVariant[]>([]);
  const [selectedCaption,  setSelectedCaption]  = useState(0);
  const [generatingCaption, setGeneratingCaption] = useState(false);

  // Step 4
  const [imageModel,  setImageModel]  = useState<ImageModel>('auto');
  const [imagePrompt, setImagePrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [generatedImageUrl, setGeneratedImageUrl] = useState('');
  const [generatingImage,   setGeneratingImage]   = useState(false);
  const [skipImage, setSkipImage] = useState(false);

  // Step 5
  const [scheduledAt,  setScheduledAt]  = useState('');
  const [publishing,   setPublishing]   = useState(false);
  const [savingDraft,  setSavingDraft]  = useState(false);

  const STEPS = ['Platform', 'Topic', 'Caption', 'Image', 'Preview'];

  // ── Load workspace + accounts ──────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: wsData } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('joined_at', { ascending: true })
        .limit(1)
        .single();
      if (!wsData) return;
      setWorkspaceId(wsData.workspace_id);
      const { data: accs } = await supabase
        .from('social_accounts')
        .select('id,platform,handle')
        .eq('workspace_id', wsData.workspace_id);
      setAccounts((accs ?? []) as SocialAccount[]);
    };
    load();
  }, []);

  // ── Caption generation ─────────────────────────────────────────────────────
  const handleGenerateCaption = async () => {
    if (!topic) {
      toast({ title: 'Please enter a topic first', variant: 'destructive' });
      return;
    }
    setGeneratingCaption(true);
    try {
      const account = accounts.find((a) => a.id === selectedAccountId);
      const { data, error } = await supabase.functions.invoke('generate-social-content', {
        body: {
          topic,
          tone,
          post_type: postType,
          platform: account?.platform,
          product_info: productInfo,
          workspace_id: workspaceId,
        },
      });
      if (error) throw error;
      const variants: CaptionVariant[] = data?.variants ?? [
        { text: data?.caption ?? 'Generated caption...', hashtags: data?.hashtags ?? '' },
      ];
      setCaptions(variants);
      setSelectedCaption(0);
    } catch (err: any) {
      toast({ title: 'Caption generation failed', description: err.message, variant: 'destructive' });
    } finally {
      setGeneratingCaption(false);
    }
  };

  // ── Image generation ───────────────────────────────────────────────────────
  const handleGenerateImage = async () => {
    if (!imagePrompt) {
      toast({ title: 'Please enter an image prompt', variant: 'destructive' });
      return;
    }
    setGeneratingImage(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-social-image', {
        body: {
          prompt: imagePrompt,
          model: imageModel,
          aspect_ratio: aspectRatio,
          workspace_id: workspaceId,
        },
      });
      if (error) throw error;
      setGeneratedImageUrl(data?.image_url ?? '');
    } catch (err: any) {
      toast({ title: 'Image generation failed', description: err.message, variant: 'destructive' });
    } finally {
      setGeneratingImage(false);
    }
  };

  // ── Publish ────────────────────────────────────────────────────────────────
  const handlePublish = async (schedule?: boolean) => {
    setPublishing(true);
    try {
      const caption = captions[selectedCaption];
      const { error } = await supabase.functions.invoke('late-publish', {
        body: {
          account_id: selectedAccountId,
          platform: accounts.find((a) => a.id === selectedAccountId)?.platform,
          caption: caption?.text ?? '',
          hashtags: caption?.hashtags ?? '',
          image_url: generatedImageUrl,
          post_type: postType,
          workspace_id: workspaceId,
          scheduled_at: schedule ? scheduledAt : undefined,
        },
      });
      if (error) throw error;
      toast({
        title: schedule ? 'Post scheduled!' : 'Post published!',
        description: schedule ? `Scheduled for ${scheduledAt}` : 'Your post is live.',
      });
      navigate('/admin/social-media');
    } catch (err: any) {
      toast({ title: 'Publish failed', description: err.message, variant: 'destructive' });
    } finally {
      setPublishing(false);
    }
  };

  const handleSaveDraft = async () => {
    setSavingDraft(true);
    try {
      const caption = captions[selectedCaption];
      const { error } = await supabase.from('social_posts').insert({
        account_id: selectedAccountId,
        platform: accounts.find((a) => a.id === selectedAccountId)?.platform,
        caption: caption?.text ?? '',
        hashtags: caption?.hashtags ?? '',
        image_url: generatedImageUrl,
        post_type: postType,
        status: 'draft',
        workspace_id: workspaceId,
      });
      if (error) throw error;
      toast({ title: 'Draft saved!' });
      navigate('/admin/social-media');
    } catch (err: any) {
      toast({ title: 'Save failed', description: err.message, variant: 'destructive' });
    } finally {
      setSavingDraft(false);
    }
  };

  // ── Copy helper ────────────────────────────────────────────────────────────
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied to clipboard' });
  };

  // ── Render steps ───────────────────────────────────────────────────────────
  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  const renderStep = () => {
    switch (step) {
      // ── Step 0: Platform + Account ─────────────────────────────────────────
      case 0:
        return (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label>Connected Account</Label>
              {accounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No connected accounts.{' '}
                  <button
                    onClick={() => navigate('/admin/social-media/accounts')}
                    className="text-primary underline"
                  >
                    Connect one first.
                  </button>
                </p>
              ) : (
                <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select account…" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {PLATFORM_EMOJI[a.platform?.toLowerCase()] ?? '🌐'} @{a.handle} ({a.platform})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label>Post Type</Label>
              <div className="flex flex-wrap gap-2">
                {POST_TYPES.map((pt) => (
                  <Button
                    key={pt.value}
                    variant={postType === pt.value ? 'default' : 'outline'}
                    className="rounded-full"
                    onClick={() => setPostType(pt.value)}
                  >
                    {pt.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        );

      // ── Step 1: Topic ──────────────────────────────────────────────────────
      case 1:
        return (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="topic">What is this post about?</Label>
              <Textarea
                id="topic"
                placeholder="Describe the topic of your post…"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label>Tone</Label>
              <div className="flex flex-wrap gap-2">
                {TONES.map((t) => (
                  <Button
                    key={t.value}
                    variant={tone === t.value ? 'default' : 'outline'}
                    className="rounded-full"
                    onClick={() => setTone(t.value)}
                  >
                    {t.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="productInfo">Product info (optional)</Label>
              <Textarea
                id="productInfo"
                placeholder="Add any product details to include…"
                value={productInfo}
                onChange={(e) => setProductInfo(e.target.value)}
                rows={3}
              />
            </div>
          </div>
        );

      // ── Step 2: Caption generation ─────────────────────────────────────────
      case 2:
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Button
                className="rounded-full"
                onClick={handleGenerateCaption}
                disabled={generatingCaption}
              >
                {generatingCaption ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                {captions.length === 0 ? 'Generate Caption' : 'Regenerate'}
              </Button>
              <span className="text-xs text-muted-foreground">~2 credits</span>
            </div>

            {captions.length > 0 && (
              <div className="space-y-3">
                {captions.map((variant, i) => (
                  <div
                    key={i}
                    onClick={() => setSelectedCaption(i)}
                    className={`dashboard-card cursor-pointer border-2 transition ${
                      selectedCaption === i ? 'border-primary' : 'border-transparent'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm flex-1">{variant.text}</p>
                      {selectedCaption === i && (
                        <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      )}
                    </div>
                    {variant.hashtags && (
                      <div className="flex items-center gap-2 mt-2">
                        <p className="text-xs text-muted-foreground flex-1">{variant.hashtags}</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-full h-6 px-2"
                          onClick={(e) => { e.stopPropagation(); copyToClipboard(variant.hashtags); }}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {captions.length === 0 && !generatingCaption && (
              <p className="text-sm text-muted-foreground">
                Click "Generate Caption" to create caption variants.
              </p>
            )}
          </div>
        );

      // ── Step 3: Image generation ───────────────────────────────────────────
      case 3:
        return (
          <div className="space-y-5">
            {/* Model tiles */}
            <div className="space-y-2">
              <Label>Image Model</Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {IMAGE_MODELS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setImageModel(m.id)}
                    className={`dashboard-card text-left border-2 transition p-3 rounded-xl ${
                      imageModel === m.id ? 'border-primary' : 'border-transparent'
                    }`}
                  >
                    <p className="font-medium text-sm">{m.label}</p>
                    <p className="text-xs text-muted-foreground">{m.desc}</p>
                    <p className="text-xs text-primary mt-1">{m.credits} cr</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Prompt */}
            <div className="space-y-2">
              <Label htmlFor="imagePrompt">Image Prompt</Label>
              <Textarea
                id="imagePrompt"
                value={imagePrompt || topic}
                onChange={(e) => setImagePrompt(e.target.value)}
                placeholder="Describe the image you want to generate…"
                rows={3}
              />
            </div>

            {/* Aspect ratio */}
            <div className="space-y-2">
              <Label>Aspect Ratio</Label>
              <Tabs value={aspectRatio} onValueChange={(v) => setAspectRatio(v as AspectRatio)}>
                <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
                  {ASPECT_RATIOS.map((ar) => (
                    <TabsTrigger
                      key={ar}
                      value={ar}
                      className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                    >
                      {ar}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                className="rounded-full"
                onClick={handleGenerateImage}
                disabled={generatingImage || skipImage}
              >
                {generatingImage ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <ImageIcon className="h-4 w-4 mr-2" />
                )}
                Generate Image
              </Button>
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => { setSkipImage(true); setGeneratedImageUrl(''); }}
              >
                <SkipForward className="h-4 w-4 mr-2" />
                Skip
              </Button>
            </div>

            {/* Preview */}
            {generatedImageUrl && !skipImage && (
              <div className="space-y-2">
                <img
                  src={generatedImageUrl}
                  alt="Generated"
                  className="rounded-xl max-h-72 object-cover w-full"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={handleGenerateImage}
                  disabled={generatingImage}
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Regenerate
                </Button>
              </div>
            )}

            {skipImage && (
              <p className="text-sm text-muted-foreground">
                Image skipped — post will be text-only.
              </p>
            )}
          </div>
        );

      // ── Step 4: Preview + Publish ──────────────────────────────────────────
      case 4:
        const captionVariant = captions[selectedCaption];
        return (
          <div className="space-y-5">
            {/* Preview card */}
            <Card className="dashboard-card max-w-sm mx-auto">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">
                    {selectedAccount
                      ? PLATFORM_EMOJI[selectedAccount.platform?.toLowerCase()] ?? '🌐'
                      : '🌐'}
                  </span>
                  <div>
                    <p className="font-medium text-sm">
                      @{selectedAccount?.handle ?? 'handle'}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {selectedAccount?.platform ?? 'platform'}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {generatedImageUrl && !skipImage && (
                  <img
                    src={generatedImageUrl}
                    alt="Post"
                    className="rounded-lg w-full object-cover max-h-60"
                  />
                )}
                <p className="text-sm whitespace-pre-wrap">
                  {captionVariant?.text ?? '—'}
                </p>
                {captionVariant?.hashtags && (
                  <p className="text-xs text-blue-600">{captionVariant.hashtags}</p>
                )}
              </CardContent>
            </Card>

            {/* Schedule input */}
            <div className="space-y-2">
              <Label htmlFor="scheduledAt">Schedule for (optional)</Label>
              <Input
                id="scheduledAt"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              <Button
                className="rounded-full"
                onClick={() => handlePublish(false)}
                disabled={publishing || savingDraft}
              >
                {publishing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Publish Now
              </Button>
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => handlePublish(true)}
                disabled={!scheduledAt || publishing || savingDraft}
              >
                Schedule
              </Button>
              <Button
                variant="ghost"
                className="rounded-full"
                onClick={handleSaveDraft}
                disabled={publishing || savingDraft}
              >
                {savingDraft ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Save as Draft
              </Button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 pb-10">
      <GlobalAdminHeader
        title="Create Post"
        description="Generate and publish social media content"
        breadcrumbs={[
          { label: 'Social Media', path: '/admin/social-media' },
          { label: 'Create Post' },
        ]}
      />

      <div className="px-6 max-w-2xl mx-auto w-full">
        <StepDots current={step} total={STEPS.length} />

        <div className="dashboard-card mb-6">
          <h2 className="text-lg font-medium mb-4">
            Step {step + 1}: {STEPS[step]}
          </h2>
          {renderStep()}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => step === 0 ? navigate('/admin/social-media') : setStep((s) => s - 1)}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            {step === 0 ? 'Cancel' : 'Back'}
          </Button>

          {step < STEPS.length - 1 && (
            <Button
              className="rounded-full"
              onClick={() => setStep((s) => s + 1)}
              disabled={step === 0 && !selectedAccountId}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
