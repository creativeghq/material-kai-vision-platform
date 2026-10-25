// Source of truth for the customer-segmentation skill.
// DO NOT EDIT — generated from SKILL.md by scripts/gen-skill-ts.mjs. Edit the markdown.

export default `---
name: Customer Segmentation
slug: customer-segmentation
description: Builds needs-based, mutually exclusive customer segments scored on attractiveness and right-to-win, so strategy can be built around the one or two that matter.
agents: [kai, product-business, marketing]
tags: [strategy]
---

# Customer Segmentation

## When to use
Use this when a strategy decision — where to invest, what to build, who to target — is being made against a customer base described only in generic demographic or firmographic terms ("SMB," "enterprise," "millennials"), which hides more decision-relevant differences than it reveals. It's also the right tool when a personas deck exists but nobody uses it to make trade-offs, because the personas were built for marketing color rather than for choosing where to allocate resources. The signal to reach for this now: two people in the room have different mental pictures of "the customer" and are talking past each other in a resourcing debate. Without decision-useful segmentation, companies spread resources evenly across a customer base where value and cost-to-serve actually vary enormously, and end up subsidizing unprofitable segments while underinvesting in the ones that matter.

## What it does
This skill re-cuts the customer base by underlying needs and behavior rather than surface-level attributes, verifies the cut is clean (no customer belongs in two segments or none), and then scores each segment on commercial attractiveness and your right to win it. The output names the one or two segments the strategy should actually be built around, with the rest explicitly deprioritized.

## Method
1. Gather the raw material: usage data, purchase behavior, win/loss records, support tickets, and any qualitative interviews — the segmentation must be built on what customers actually do and need, not just who they are on paper.
2. Identify the underlying jobs-to-be-done: what outcome is each customer actually hiring the product or service to achieve, and under what constraints (budget, urgency, risk tolerance)? Two customers in the same firmographic bucket often have entirely different jobs; two in different buckets can have the same job.
3. Draft candidate segments around clusters of similar jobs and buying behavior, then test the cut for MECE structure: every customer must land in exactly one segment, with no overlaps and no gaps. If a meaningful share of customers don't fit cleanly, the segment boundaries are wrong — redraw them rather than creating a catch-all "other" bucket that hides the problem.
4. Score each segment on attractiveness: current size, growth rate, willingness to pay, and lifetime value net of cost-to-serve. Use actual revenue and margin data where available rather than assumed averages across the whole base.
5. Score each segment on right-to-win: your current share, brand relevance, distribution fit, and whether your product's core strengths map to what this segment's job requires. A segment can be highly attractive and still be wrong to pursue if a competitor has a structural advantage there.
6. Plot segments on an attractiveness-vs-right-to-win matrix and rank them; avoid the trap of chasing the largest segment by size alone when it is one where you have the weakest structural position.
7. Stress-test the top-ranked segment(s) against a simple reality check: can you name three real customers who exemplify this segment, and does the product roadmap already serve their specific job well, or does it require new investment?
8. Name the one or two segments the strategy will be built around, and explicitly state which segments are being deprioritized and why, so the decision isn't quietly reversed later without new evidence.

## Inputs
- Customer-level usage, purchase, and revenue/margin data
- Win/loss data and sales notes describing why deals were won or lost
- Any existing qualitative research or customer interviews
- A rough view of competitive share by customer type, if available

## Output format
A MECE segmentation with a clear name and job-to-be-done statement for each segment; an attractiveness-vs-right-to-win matrix plotting all segments; a data table showing size, growth, and margin by segment; and a final ranked priority call naming the one or two segments to build strategy around, with the rationale for deprioritizing the rest.

## Example
A broad SMB customer base initially described as one segment is re-cut into four needs-based groups: solo operators needing simplicity, growing teams needing collaboration features, agencies needing white-label reselling, and franchises needing multi-location control. Margin data shows the agency segment has 2.3x the lifetime value of the solo-operator segment despite being one-third the size, and the company already has a distribution edge there through existing partner channels. The recommendation names the agency segment as the primary wedge for the next product cycle, with solo operators deprioritized despite being the largest segment by headcount.

## Common pitfalls
- Segmenting by demographic or firmographic convenience (industry, company size) because the data is easy to pull, even when it doesn't predict behavior or value.
- Allowing segments to overlap or leaving a large "other" bucket, which signals the underlying cut doesn't reflect real behavioral differences.
- Picking the largest segment by volume without weighting for margin and right-to-win, which spreads investment into a segment you're structurally unlikely to win.
`;
