// Source of truth for the seo-opportunity-triage skill.
//
// Generated from SKILL.md by scripts/gen-skill-ts.mjs — edit the markdown, not this file.
// A plain template literal, not String.raw: String.raw keeps the backslash of an escaped
// backtick, so the text the model reads comes out as \`tool_name\` rather than `tool_name`.

export default `---
name: SEO Opportunity Triage
slug: seo-opportunity-triage
description: Decide what to actually do about a site's search performance, in the right order — own data before market data, one diagnosis before any research fan-out. Use when the user asks how their site is doing in search, what to write next, why traffic moved, how they compare to a competitor, or hands you a domain and asks for an audit.
agents: [kai, marketing]
tags: [seo, research, audit, content, gsc]
---

# SEO Opportunity Triage

You have around fifty SEO tools. That is the problem this skill solves: with no order to work in, the default behaviour is to fan out across half a dozen of them, return five tables, and leave the user to decide what any of it means. Every one of those calls costs money and none of them is an answer.

The order below is not a style preference. It is cheapest-and-most-certain first.

\`\`\`
0  own data      seo_gsc_striking_distance / seo_gsc_top_movers    free, first-party, already true
1  one diagnosis seo_site_review  or  seo_serp_audit               one call, broad
2  the delta     seo_keyword_gap / seo_domain_competitors          only against a NAMED competitor
3  validate      seo_keyword_overview / seo_search_intent          batch, never one keyword at a time
4  act           create_seo_article / a prioritised list           an ending, not another table
\`\`\`

## Start with data they already own

\`seo_gsc_striking_distance\` and \`seo_gsc_top_movers\` read Google Search Console — the user's own verified data. It is first-party, it is about pages that already exist, and it needs no market estimates to be true.

**Striking distance is the single highest-leverage thing you can run.** Positions 8–20 with real impressions are pages Google already considers relevant; moving one of those to page one is a rewrite, not a new article. New content is the most expensive intervention available and you should not propose it before checking whether the win is already sitting on the site.

If GSC is not connected, say so in one line and move to step 1 — do not silently substitute third-party estimates for the user's own numbers and present them the same way.

## Then one diagnosis, not six

| the question | the ONE call |
|---|---|
| "how is my site doing?" | \`seo_site_review\` — rank overview + top keywords + competitors + backlinks + anchors, composite |
| "why am I not ranking for X?" | \`seo_serp_audit\` on X — shows what actually occupies the page |
| "how do I look when people search my name?" | \`seo_brand_search_audit\` |
| "am I visible in AI answers?" | \`check_llm_visibility\` |

Run the composite. Read it. Then decide what the second call should be. Running \`seo_domain_snapshot\`, \`seo_ranked_keywords\`, \`seo_domain_competitors\` and \`seo_backlinks_summary\` separately is \`seo_site_review\` done four times more expensively, and it arrives as four disconnected tables instead of one picture.

## Rules that hold across all of it

**1. Batch the keyword tools. They take arrays.**
\`seo_keyword_overview\` and \`seo_search_intent\` accept \`keywords: []\`. Twelve keywords is ONE call. Calling them twelve times is twelve times the cost for the same answer, and it is the most common way to burn a research budget on this platform.

**2. A gap needs a named competitor.**
\`seo_keyword_gap\` requires \`your_domain\` AND \`competitor_domain\`. If the user has not named one, get it from \`seo_domain_competitors\` first — or ask. Do not invent a plausible competitor; the whole output is the delta between two specific sites, so a wrong second domain produces a confident, entirely fictional content plan.

**3. Country and language change the answer.**
Every SERP tool takes \`country_code\` / \`language_code\`. This platform's users sell in Greece. Defaulting to US English and reporting the result as "your rankings" is wrong in a way that looks completely normal. If you do not know the market, ask once — it is one question and it invalidates everything downstream.

**4. Volume without intent is noise.**
A 9,000/month head term that is \`informational\` will not sell tile. Run \`seo_search_intent\` alongside \`seo_keyword_overview\` and lead with the commercial and transactional ones. High volume is the number users fixate on and the one that least predicts revenue.

**5. \`seo_dataforseo_call\` is the escape hatch, not a shortcut.**
Reach for it only when no named tool covers what is needed, and say why you did.

## End with a decision

An SEO answer that stops at data is unfinished. Close with the shortlist, ordered, each item carrying the reason it is on the list:

> **Do these three, in order.**
> 1. Rewrite \`/porcelain-floor-tiles\` — position 11, 2,400 impressions/mo, no clicks. Already ranks; needs the title and H1 to match the query.
> 2. Write for "χαλαζιακός νεροχύτης" — 880/mo, transactional, KD 21, nobody in the top 5 sells it.
> 3. Leave "kitchen design ideas" alone — 14,000/mo but informational, and the SERP is nine listicles and a Pinterest board.

Point 3 matters as much as the other two. Saying what to **ignore** is what makes the list a decision rather than a summary.

**Only run \`create_seo_article\` when the user has agreed on a target.** It is the full pipeline — research, plan, write, analyse, auto-fix — and it is expensive. It ends the triage; it does not perform it. Never fire it off to "show what we could do" for a keyword nobody has chosen.
`;
