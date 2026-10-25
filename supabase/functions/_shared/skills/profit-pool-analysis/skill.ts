// Source of truth for the profit-pool-analysis skill.
// DO NOT EDIT — generated from SKILL.md by scripts/gen-skill-ts.mjs. Edit the markdown.

export default `---
name: Profit Pool Analysis
slug: profit-pool-analysis
description: Maps revenue and margin at every stage of the value chain to reveal where profit actually concentrates, and where it is migrating to next.
agents: [kai, product-business, erp]
tags: [strategy]
---

# Profit Pool Analysis

## When to use
Use this when a company is profitable but growth feels harder to convert into margin than it should, or when a strategy conversation keeps assuming "our industry" is a single economic pool when in fact profit is concentrated in one specific stage of the value chain that the company doesn't occupy. It's also the right tool before a vertical integration, unbundling, or channel strategy decision, since those decisions are really bets about which stage of the chain to move toward or away from. The signal to use it now: revenue is growing but margin isn't following it, which often means the company is capturing volume in a low-margin part of the chain while a different, adjacent stage quietly holds most of the industry's actual profit. Without this view, companies compete hard to win share in a part of the value chain that was never where the money was.

## What it does
This skill decomposes an entire industry value chain into its distinct stages and estimates the revenue and margin captured at each one, producing a picture of where profit is concentrated rather than assuming it is evenly spread. It then compares the company's own position against that map and identifies the direction the pool is migrating, translating both into a specific strategic implication for where to compete next.

## Method
1. Map the full value chain from raw input or upstream supply through to the end customer, naming every distinct stage (for example: component supply, manufacturing, distribution, retail, service/support, financing) — be granular enough that stages with genuinely different economics aren't collapsed into one.
2. Estimate the total revenue flowing through each stage industry-wide, using public financial disclosures of major players at each stage, industry reports, or bottom-up estimates from unit economics where public data is unavailable.
3. Estimate the margin captured at each stage using the same sources, and multiply through to calculate the actual profit pool (not just revenue) sitting at each stage — a stage can carry the largest revenue and still be a shallow profit pool if margins are structurally thin there.
4. Build the profit pool map as a simple visual: each stage sized by its share of total chain profit, so the reader can see at a glance which one or two stages hold the majority of the money.
5. Locate your own company's current position and margin on this same map, and compare it explicitly against the stage(s) holding the deepest pool — avoid the common failure of only mapping the industry pool without overlaying your own position, which leaves the analysis interesting but not actionable.
6. Analyze migration: compare the current pool map against how it looked several years ago (or against forward-looking structural signals — new entrants, technology shifts, regulatory change) to identify whether profit is moving from one stage to another, and why.
7. Triangulate the estimate with a sanity check: cross-reference your bottom-up stage margin estimates against any top-down industry profitability data available, and reconcile meaningful gaps rather than presenting a single unverified figure.
8. Translate the map into strategic implications: should the company move toward the deep-pool stage (via M&A, partnership, or organic build), defend its current position against migration risk, or exit a stage whose pool is structurally shrinking? State the implication as a specific strategic option, not just a descriptive observation.

## Inputs
- A defined value chain for the industry with its distinct stages identified
- Public financial data, industry reports, or unit economics for major players at each stage
- Your own company's revenue and margin by product/service line, mapped to the relevant chain stage(s)
- Any historical data (3-5 years) to assess how the pool has shifted over time

## Output format
A value chain map with every stage named; a profit pool visualization sizing each stage by share of total chain profit; your own position plotted against the deepest-pool stage; a migration narrative describing how the pool has shifted and why; and a stated strategic implication (move toward, defend, or exit) with the rationale.

## Example
A hardware manufacturer maps its industry value chain across component supply, assembly, distribution, and post-sale service, and finds that while assembly carries 55% of industry revenue, it captures only 12% of total chain profit, whereas post-sale service carries just 15% of revenue but 70% of chain profit. The company currently sits almost entirely in assembly. The migration analysis shows this pattern has strengthened over the last five years as hardware commoditized. The strategic implication: prioritize building or acquiring an attach-rate service offering rather than continuing to compete on assembly share, where margin ceiling is structurally low regardless of execution quality.

## Common pitfalls
- Mapping industry revenue without separately estimating margin by stage, which conflates a high-revenue stage with a high-profit one when they are often not the same stage.
- Building the profit pool map without overlaying your own company's position, leaving an interesting industry picture with no direct implication for your own strategy.
- Treating the pool map as a static snapshot instead of checking for migration, missing that today's deep pool may already be shifting toward a different stage.
`;
