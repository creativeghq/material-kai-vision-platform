// Source of truth for the decision-memo skill.
// DO NOT EDIT — generated from SKILL.md by scripts/gen-skill-ts.mjs. Edit the markdown.

export default `---
name: Decision Memo
slug: decision-memo
description: Converts finished analysis into a one-page, answer-first decision memo that states the recommendation, the rationale, and the exact approval being requested.
agents: [kai, product-business]
tags: [strategy]
---

# Decision Memo

## When to use
Use this when analysis is essentially done and the remaining task is getting a specific executive or committee to make a specific decision — and especially when the current draft of that communication is a long slide deck or report that makes the reader hunt for the actual ask. It is also the right tool when a decision has stalled in review for weeks because nobody can articulate, in one sentence, exactly what is being decided and by whom. The signal to use it now: someone asks "so what do you actually want me to approve?" after reading twenty pages. Without a disciplined one-page memo, decisions drift, get relitigated in every meeting, or get approved without the decision-maker having actually understood the trade-off they signed off on.

## What it does
This skill compresses a finished body of analysis into a single page structured to be read in under two minutes, leading with the decision being asked for and the recommendation, then backing it with only the rationale that actually supports that recommendation. It produces a document that can be forwarded, approved over email, or used to anchor a five-minute conversation, rather than requiring a scheduled readout.

## Method
1. State the decision question precisely at the very top, in one sentence, framed as a choice (for example, "Should we build the analytics module in-house or buy a vendor solution by Q3?") — not as a topic or a status update.
2. Identify the actual decision-maker and what specific authority they're being asked to exercise (approve budget, approve direction, approve a specific vendor) — a memo that doesn't name who decides and what they're deciding will circulate without resolution.
3. Lay out the full option set considered, including the ones rejected, in one or two lines each — this demonstrates the recommendation survived real alternatives rather than being the only option presented.
4. State the explicit criteria used to evaluate the options (cost, speed, risk, strategic fit, reversibility) so the reader can audit the logic, not just accept the conclusion on authority.
5. Give the recommendation first, before the supporting rationale — lead with the answer, then justify it, rather than building up to a conclusion the reader has to wait for.
6. Support the recommendation with the two or three data points or arguments that actually carry the weight of the decision; cut everything else, even if it was part of the underlying analysis. A memo that includes everything analyzed is not a decision memo, it's a report.
7. Add a short risk and mitigation note: name the main way this recommendation could go wrong and what would be done about it, so the decision-maker isn't surprised later by a risk that was known and unstated.
8. Close with concrete next steps: who does what by when if approved, and what specifically is being asked of the reader right now (a signature, a budget release, a verbal yes in the next meeting).

## Inputs
- The finished analysis or recommendation and its supporting evidence
- The full set of options that were seriously considered, including rejected ones
- The name and role of the actual decision-maker
- Any known organizational risks, dependencies, or political sensitivities around the decision

## Output format
A single page with: the decision question, the recommendation stated up front, the options considered with the criteria used to evaluate them, the two to three supporting arguments, a brief risk/mitigation line, and explicit next steps naming owners, dates, and the specific approval being requested.

## Example
A team facing a build-vs-buy decision on an internal analytics tool produces a memo that opens with "Recommend: buy the vendor solution; requesting budget approval of $180K/year by June 15." It shows three options considered (build, buy, delay), the criteria (time-to-value, total cost over 3 years, engineering opportunity cost), and two supporting points: the vendor solution ships in 6 weeks versus 9 months to build, and the 3-year total cost of building is 40% higher once opportunity cost of the engineering team is included. The risk section notes vendor lock-in and proposes a contractual data-export clause as mitigation. The ask: sign-off on the budget line in the next finance review.

## Common pitfalls
- Burying the recommendation at the end after pages of build-up, forcing the decision-maker to read the whole document to find the ask.
- Including all analysis performed rather than only the two or three points that actually drive the recommendation, which dilutes the argument and slows the reader down.
- Ending without a specific, dated ask — a memo that concludes with "let's discuss" instead of naming exactly what approval is needed rarely produces a decision.
`;
