// Source of truth for the situation-assessment skill.
// DO NOT EDIT — generated from SKILL.md by scripts/gen-skill-ts.mjs. Edit the markdown.

export default `---
name: Situation Assessment
slug: situation-assessment
description: Builds a fact-based baseline of where the business actually stands, structured around one decision question, with facts, inferences, and unknowns clearly separated.
agents: [kai, product-business]
tags: [strategy]
---

# Situation Assessment

## When to use
Use this at the very start of any strategy engagement, before any direction is proposed, when leadership has a vague sense that something needs attention but the actual diagnosis hasn't been done — the org is debating solutions before agreeing on the problem. It's also the right tool when previous attempts to fix a business issue haven't worked, which is often a sign the team solved for a plausible-sounding cause rather than the one the facts actually support. The signal to use it now: two executives describe "what's going on" in the business in materially different terms, and neither view has been checked against the underlying data. Without a disciplined situation assessment, organizations jump straight to solutions for a problem they haven't actually diagnosed, and the resulting strategy addresses a symptom instead of the real, evidenced issue.

## What it does
This skill establishes a rigorous, fact-based picture of current business performance across financial, market, and operational lenses, structures the findings into a clear issue hierarchy that separates confirmed fact from inference and open unknowns, and anchors all of it to the one decision question leadership actually needs answered. The output is a defensible baseline that any subsequent strategy work can be built on without re-litigating what's actually happening.

## Method
1. Frame the engagement using a situation-complication-question structure: state the shared situation everyone agrees on, name the complication that has changed and made the status quo untenable, and state precisely the one decision question this assessment needs to answer. Anchoring to a single question up front prevents the assessment from sprawling into an unfocused general review.
2. Triangulate current performance across three independent lenses rather than relying on any single one: financial (revenue growth, margin trend, cash position), market (share trend, demand signals, competitive positioning), and operational (throughput, quality, cost-to-serve). A problem that looks purely financial often has its root cause visible only in the operational or market lens.
3. Gather the underlying data for each lens at a granularity fine enough to spot where a problem is concentrated (by segment, region, product line, or cohort) rather than only looking at aggregated company-wide trends, which can hide a sharp, localized issue inside a healthy-looking average.
4. Build an issue tree, structured MECE (no overlapping branches, no gaps), decomposing the top-level symptom down through contributing factors to candidate root causes.
5. Mark every branch of the issue tree explicitly as fact (directly verified by data), inference (a reasoned conclusion from related but indirect data), or unknown (a plausible branch with no current evidence either way) — this discipline is what prevents assumptions from being quietly treated as established findings later in the engagement.
6. Plot the headline findings on a 2x2 of impact versus certainty: high-impact, high-certainty findings are the load-bearing issues the strategy must address; high-impact, low-certainty findings are the priority for further investigation; low-impact findings, regardless of certainty, should be set aside as noise for now.
7. Avoid the common failure of treating every collected data point as equally important — the deliverable is a ranked, curated set of the findings that actually bear on the decision question, not an exhaustive data dump.
8. Close by naming the specific open questions and the next analyses that would resolve the highest-impact unknowns, so the assessment produces a clear path forward rather than ending in ambiguity.

## Inputs
- Recent financial performance data (revenue, margin, cash) at a segment or product-line level of granularity
- Market data: share trends, demand signals, and competitive positioning
- Operational metrics relevant to the business (throughput, quality, cost-to-serve, cycle time)
- The specific question or concern leadership has raised that triggered the assessment

## Output format
A one-page fact base organized by the three lenses; a stated momentum read (improving, stable, deteriorating, and where); a MECE issue tree with every branch tagged fact/inference/unknown; an impact-vs-certainty 2x2 highlighting the load-bearing issues; and a list of open questions with the next analysis needed to close each one.

## Example
Leadership asks why enterprise renewal rates are declining and initially suspects pricing. The triangulated fact base shows financial data confirms the renewal decline is real and accelerating, but the operational lens shows it's heavily concentrated in accounts onboarded through a specific channel partner in the last two quarters — not spread evenly across the enterprise base as a pricing problem would predict. The issue tree marks "pricing is the cause" as an unconfirmed inference and "the decline is concentrated in one onboarding cohort" as a verified fact. Two next analyses are named: a cohort-level satisfaction survey and a review of that partner's onboarding process, before any pricing action is considered.

## Common pitfalls
- Starting to debate solutions before the situation assessment is complete, which locks in a diagnosis that hasn't actually been checked against the data.
- Treating every finding as equally weighted instead of separating fact from inference from unknown, which lets an unverified assumption quietly become the basis for the whole strategy.
- Producing an exhaustive data dump instead of a curated, ranked set of findings tied directly to the one decision question at hand.
`;
