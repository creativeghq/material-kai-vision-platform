/**
 * Who this is for, said in the words the reader would use about themselves.
 *
 * The homepage said "for design, construction and materials businesses", which is three audiences
 * in one breath and therefore none: a contractor reads it and cannot tell whether the thing knows
 * what a retention release is. Naming the job each one actually does — and the spreadsheet it
 * replaces — is the difference between a category claim and a reason to sign up.
 *
 * Every capability listed here is one that SHIPPED. Nothing aspirational, because the first thing
 * a visitor does after signing up is look for the thing that made them sign up.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { HardHat, Palette, PackageSearch, ArrowRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Card, CardContent } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';

interface Audience {
  icon: LucideIcon;
  who: string;
  /** The job, in their words — not the feature name. */
  job: string;
  does: string[];
  /** What they stop doing. Concrete, because this is the line people recognise themselves in. */
  replaces: string;
}

const AUDIENCES: Audience[] = [
  {
    icon: HardHat,
    who: 'Contractors & builders',
    job: 'Know what a job is really making, while it is still running',
    does: [
      'Cost value reconciliation by cost code — committed, actual and the margin left',
      'Drawing register with revisions, RFIs and submittals against the sheet they were raised on',
      'Applications for payment, certification and retention, cumulative and never re-typed',
      'Tender packages out to subcontractors, compared on what they actually cover',
    ],
    replaces: 'A valuation spreadsheet, a drawings folder, and an RFI email thread',
  },
  {
    icon: Palette,
    who: 'Design studios & architects',
    job: 'Get from a mood to a signed quote without re-typing anything',
    does: [
      'Moodboards and presentation sheets a client can open on a link',
      'Room planning and product configuration that carry into the quote',
      'Quotes with per-line discounts, deposits and e-signature',
      'A client portal for approvals, so decisions land somewhere you can find them',
    ],
    replaces: 'Pinterest, a slide deck, and a quote rebuilt by hand each time',
  },
  {
    icon: PackageSearch,
    who: 'Materials suppliers & distributors',
    job: 'Keep a catalogue that is correct everywhere it appears',
    does: [
      'PDF and XML catalogue import that reads specifications, not just names',
      'AI visual search across your own range',
      'A storefront and buyer portal on the same catalogue',
      'Price and mention monitoring on the products you care about',
    ],
    replaces: 'A PIM you outgrew, and a price list emailed as a PDF',
  },
];

export const AudienceSection: React.FC = () => (
  <section id="who-its-for" className="container mx-auto max-w-6xl px-4 py-16 scroll-mt-20">
    <div className="text-center mb-10">
      <h2 className="font-display text-3xl font-semibold tracking-tight mb-3">
        Built for three kinds of business
      </h2>
      <p className="text-muted-foreground max-w-2xl mx-auto">
        They share a catalogue, a customer list and a set of books — so the platform is one, and
        you switch on the parts your work actually needs.
      </p>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {AUDIENCES.map((a) => {
        const Icon = a.icon;
        return (
          <Card key={a.who} className="dashboard-card h-full">
            <CardContent className="p-6 flex flex-col h-full">
              <div className="rounded-xl bg-primary/10 p-2.5 w-fit mb-4">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-1">{a.who}</h3>
              <p className="text-sm text-muted-foreground mb-4">{a.job}</p>

              <ul className="space-y-2 text-sm flex-1">
                {a.does.map((d) => (
                  <li key={d} className="flex items-start gap-2">
                    <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                    <span className="text-muted-foreground">{d}</span>
                  </li>
                ))}
              </ul>

              <div className="pt-4">
                <Badge variant="neutral" className="font-normal">
                  Replaces: {a.replaces}
                </Badge>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>

    <div className="mt-8 text-center">
      <Link
        to="/auth?mode=signup"
        className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
      >
        Start free — no card <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  </section>
);

export default AudienceSection;
