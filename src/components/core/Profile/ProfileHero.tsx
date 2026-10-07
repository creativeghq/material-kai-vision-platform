import React from 'react';
import { Link } from 'react-router-dom';
import {
  Building2, Camera, Check, Copy, ExternalLink, Eye, EyeOff, Globe, Loader2, Mail, MapPin, Plus, Star,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/core/ui/avatar';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Label } from '@/components/core/ui/label';
import { Switch } from '@/components/core/ui/switch';
import { formatNumber } from '@/utils/decimal';
import { websiteHref } from '@/utils/emailSignature';

export interface ProfileStrengthItem {
  key: string;
  label: string;
  done: boolean;
}

export interface ProfileHeroStat {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}

interface ProfileHeroProps {
  userId: string | undefined;
  name: string;
  email: string;
  initials: string;
  avatarUrl: string;
  roleLabel: string | null;
  company: string;
  location: string;
  website: string;
  bio: string;
  uploading: boolean;
  onPickAvatar: () => void;
  isPublic: boolean;
  onTogglePublic: (v: boolean) => void;
  copied: boolean;
  onCopyLink: () => void;
  strength: ProfileStrengthItem[];
  onFix: (key: string) => void;
  stats: ProfileHeroStat[];
}

export const ProfileHero: React.FC<ProfileHeroProps> = (p) => {
  const done = p.strength.filter((s) => s.done).length;
  const pct = p.strength.length ? Math.round((done / p.strength.length) * 100) : 0;
  const missing = p.strength.filter((s) => !s.done);
  const web = p.website ? websiteHref(p.website) : null;

  return (
    <section className="overflow-hidden rounded-md border border-hairline bg-card">
      <div className="h-20 border-b border-hairline bg-primary/[0.07] sm:h-24" aria-hidden="true" />

      <div className="px-4 pb-5 sm:px-6">
        <div className="-mt-10 flex flex-col gap-4 sm:-mt-12 sm:flex-row sm:items-end sm:justify-between">
          <button
            type="button" onClick={p.onPickAvatar} disabled={p.uploading}
            className="group relative w-fit shrink-0 rounded-full ring-4 ring-card" aria-label="Change profile photo"
          >
            <Avatar className="h-20 w-20 sm:h-24 sm:w-24">
              {p.avatarUrl && <AvatarImage src={p.avatarUrl} alt="" />}
              <AvatarFallback className="bg-primary/15 text-2xl font-semibold text-primary">{p.initials}</AvatarFallback>
            </Avatar>
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              {p.uploading ? <Loader2 className="h-5 w-5 animate-spin text-white" /> : <Camera className="h-5 w-5 text-white" />}
            </span>
          </button>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {p.isPublic && (
              <>
                <Button size="sm" variant="outline" asChild>
                  <Link to={`/u/${p.userId}`} target="_blank" rel="noopener noreferrer"><ExternalLink />View public page</Link>
                </Button>
                <Button size="sm" variant="outline" onClick={p.onCopyLink}>
                  {p.copied ? <Check /> : <Copy />}{p.copied ? 'Copied' : 'Copy link'}
                </Button>
              </>
            )}
            <div className="flex h-9 items-center gap-2 rounded-sm border border-hairline px-3">
              {p.isPublic ? <Eye className="h-4 w-4 text-primary" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
              <Label htmlFor="profile-visibility" className="cursor-pointer text-sm">{p.isPublic ? 'Public' : 'Private'}</Label>
              <Switch id="profile-visibility" checked={p.isPublic} onCheckedChange={p.onTogglePublic} />
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate font-sans text-2xl font-semibold">{p.name || 'Add your name'}</h2>
              {p.roleLabel && <Badge variant="info">{p.roleLabel}</Badge>}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {p.company && <span className="inline-flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" />{p.company}</span>}
              {p.location && <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{p.location}</span>}
              <span className="inline-flex min-w-0 items-center gap-1.5"><Mail className="h-3.5 w-3.5" /><span className="truncate">{p.email}</span></span>
              {p.website && (
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5" />
                  {web ? <a href={web} target="_blank" rel="noopener noreferrer" className="truncate hover:text-foreground hover:underline">{p.website}</a> : p.website}
                </span>
              )}
            </div>
            {p.bio && <p className="line-clamp-2 max-w-2xl text-sm leading-relaxed">{p.bio}</p>}
            <p className="pt-1 text-xs text-muted-foreground">
              {p.isPublic ? 'Anyone can find and view your public page.' : 'Your profile is private. Only you can see it.'}
            </p>
          </div>

          <div className="space-y-2 rounded-sm border border-hairline bg-surface-sunken p-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs font-semibold">Profile strength</p>
              <p className="text-xs tabular-nums text-muted-foreground">{done} of {p.strength.length}</p>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-hairline" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Profile strength">
              <div className="h-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
            </div>
            {missing.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {missing.map((m) => (
                  <button
                    key={m.key} type="button" onClick={() => p.onFix(m.key)}
                    className="inline-flex items-center gap-1 rounded-sm border border-hairline bg-card px-2 py-0.5 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  >
                    <Plus className="h-3 w-3" />{m.label}
                  </button>
                ))}
              </div>
            ) : (
              <p className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground"><Star className="h-3.5 w-3.5 text-primary" />Everything is filled in.</p>
            )}
          </div>
        </div>
      </div>

      {p.stats.length > 0 && (
        <dl className="grid grid-cols-2 border-t border-hairline sm:grid-cols-4">
          {p.stats.map((s, i) => (
            <div key={s.label} className={`px-4 py-3 sm:px-6 ${i % 2 ? 'border-l border-hairline' : ''} ${i > 1 ? 'border-t border-hairline sm:border-t-0' : ''} ${i === 2 ? 'sm:border-l' : ''}`}>
              <dt className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                {s.label}
              </dt>
              <dd className="text-xl font-semibold tabular-nums">{typeof s.value === 'number' ? formatNumber(s.value) : s.value}</dd>
              {s.hint && <dd className="text-[11px] text-muted-foreground">{s.hint}</dd>}
            </div>
          ))}
        </dl>
      )}
    </section>
  );
};
