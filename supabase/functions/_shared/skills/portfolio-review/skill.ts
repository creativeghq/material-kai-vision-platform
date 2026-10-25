// Source of truth for the portfolio-review skill.
// DO NOT EDIT — generated from SKILL.md by scripts/gen-skill-ts.mjs. Edit the markdown.

export default `---
name: Portfolio Review
slug: portfolio-review
description: Reallocates capital and management attention across a portfolio of business units or bets using a nine-box attractiveness view cross-checked against actual capital consumption.
agents: [kai, product-business]
tags: [strategy]
---

# Portfolio Review

## When to use
Use this at an annual or major capital-planning cycle when a company has multiple business lines, products, or bets and resource allocation across them has drifted from deliberate strategy toward simple inertia — each unit gets roughly the same increase it got last year regardless of performance. It's also the right tool when leadership suspects some units are being cross-subsidized by others without a clear view of the scale of that subsidy, or when a genuinely promising unit seems to be under-resourced relative to its potential. The signal to use it now: capital allocation decisions are being made by precedent ("that's what they got last year") rather than by evidence of attractiveness and returns. Without a disciplined portfolio review, capital quietly flows to legacy units by habit while higher-potential bets are starved, and nobody notices until the pattern has compounded for years.

## What it does
This skill positions every unit or bet in the portfolio on a structured view of market attractiveness against competitive strength, then overlays actual capital consumed and returns generated to expose where the current allocation contradicts the evidence. It converts that diagnosis into explicit reallocation decisions — what grows, what holds, what gets fixed, and what stops — rather than leaving the portfolio review as a descriptive exercise with no consequence.

## Method
1. Define the portfolio's units of analysis clearly — business lines, product lines, or major strategic bets — at a level of granularity where meaningful capital and attractiveness differences actually exist; too coarse a cut (the whole company as one unit) or too fine a cut (individual SKUs) will obscure the real allocation decisions.
2. Score each unit's market attractiveness using consistent criteria across the whole portfolio: market size, growth rate, structural profitability, and competitive intensity — applied the same way to every unit so scores are genuinely comparable.
3. Score each unit's competitive strength: relative market share, cost position, differentiation, and customer loyalty — again using one consistent scoring rubric, not a unit-by-unit narrative judgment.
4. Plot each unit on a nine-box grid of attractiveness versus competitive strength; this creates a structured, comparable view rather than a qualitative debate about which unit "feels" more important.
5. Overlay two additional data layers onto the same units: capital and management attention actually consumed over the last one to two cycles, and the returns (revenue growth, margin, or ROIC) actually generated. This step is what typically produces the most uncomfortable finding — units in weak boxes still consuming disproportionate capital, and units in strong boxes being starved.
6. Reconcile the attractiveness/strength position against the capital-and-returns overlay explicitly: identify subsidized units (weak position, high capital) and starved winners (strong position, low capital relative to their box) by name — avoid the trap of only presenting the nine-box without this overlay, since the nine-box alone rarely changes anyone's mind on its own.
7. Assign each unit one of four calls: grow (strong position, attractive market — increase capital and management attention), hold (moderate position — maintain current investment while monitoring), fix (weak execution in an attractive market — time-boxed turnaround with clear milestones), or exit (weak position in an unattractive market, or a fix attempt that has already failed once).
8. Convert the calls into an explicit reallocation: name specifically what gets more capital, what gets less, and what stops entirely, with rough magnitudes — a portfolio review that ends in labels (grow/hold/fix/exit) without translating them into actual budget movement changes nothing.

## Inputs
- Financial and operating performance by unit for the last one to two cycles (revenue, margin, growth, ROIC)
- Capital and headcount/attention allocated to each unit over the same period
- Market attractiveness data by unit's served market (size, growth, structural profitability)
- Competitive position data by unit (share, cost position, customer retention)

## Output format
A nine-box attractiveness-vs-strength matrix with every unit plotted; a capital-and-returns overlay table naming subsidized units and starved winners explicitly; a grow/hold/fix/exit call for every unit with the rationale; and a reallocation summary stating specifically what gets more capital, what gets less, and what stops.

## Example
A company reviews eight business lines and finds two units sitting in the strongest attractiveness/strength box are receiving the smallest capital increases of the portfolio, while a unit in the weakest box — low growth market, weak competitive position — has received a stable, unquestioned capital allocation for three straight years. The review calls for growing the two starved winners with a combined 25% capital increase, and exiting the structurally weak unit rather than attempting a third turnaround, freeing capital for reallocation.

## Common pitfalls
- Producing the nine-box attractiveness view without overlaying actual capital and returns data, which leaves the exercise descriptive rather than decision-forcing.
- Allowing legacy units to retain capital by precedent rather than evidence, especially when they have strong internal political support disproportionate to their portfolio position.
- Calling for "fix" repeatedly on the same unit without a time-boxed milestone, turning what should be a decisive turnaround-or-exit call into indefinite life support.
`;
