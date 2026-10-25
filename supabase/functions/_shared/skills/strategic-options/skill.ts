// Source of truth for the strategic-options skill.
// DO NOT EDIT — generated from SKILL.md by scripts/gen-skill-ts.mjs. Edit the markdown.

export default `---
name: Strategic Options
slug: strategic-options
description: Generates a genuine set of alternatives across time horizons, scores them against explicit weighted criteria, and reasons to a conditional recommendation instead of advocating a single pre-chosen answer.
agents: [kai, product-business]
tags: [strategy]
---

# Strategic Options

## When to use
Use this whenever a major strategic decision is being framed as a single yes/no choice — "should we do X" — rather than as a genuine choice among alternatives, which is usually a sign the option-generation step was skipped and the team jumped straight to defending a preferred answer. It's also the right tool when a strategy proposal reads as an advocacy document rather than an honest comparison, since a recommendation that never seriously considers a real alternative invites (and deserves) pushback in review. The signal to use it now: nobody in the room can name what the second-best option actually was. Without genuine option generation, organizations either anchor prematurely on the first idea proposed or discover too late, mid-implementation, that a materially better alternative was never seriously considered.

## What it does
This skill generates a real, structured set of strategic alternatives spanning different time horizons and risk levels, scores each against explicit, weighted decision criteria agreed before scoring begins, and shows the trade-offs plainly rather than hiding them behind a single confident recommendation. It closes by naming the specific conditions under which a different option would be the better choice, so the recommendation is transparent about its own sensitivity.

## Method
1. Frame the decision precisely: what is actually being chosen, over what time horizon, and against what objective the choice needs to serve — a vague framing produces vague, incomparable options.
2. Generate options across three horizons to avoid anchoring on a single type of move: optimize the current core business (near-term, lower risk), expand into adjacencies that leverage existing capability (medium-term, medium risk), and place transformational bets that could reshape the business (longer-term, higher risk). Requiring options in all three horizons is what prevents the exercise from converging prematurely on the one idea that was already popular before the analysis started.
3. Ensure each option is genuinely distinct and actionable — not a minor variation of another option on the list — and includable at a "do nothing / maintain current course" baseline, since that baseline is often skipped but changes how every other option's value is judged.
4. Define explicit decision criteria before scoring any option: typically value creation, feasibility (capability, capital, timeline), risk, and strategic fit — and assign each criterion an explicit weight agreed with the actual decision-maker in advance, not reverse-engineered after seeing which option looks strongest.
5. Score every option against every criterion using a consistent scale, with the reasoning behind each score stated in one line — a scorecard with numbers but no rationale invites the reader to distrust it.
6. Calculate the weighted composite score per option and rank them, then explicitly test how sensitive the ranking is to the two most contested weights — if swinging the risk weight by a reasonable margin flips the top ranking, that sensitivity needs to be surfaced, not hidden.
7. Avoid the common failure of designing the criteria or weights to favor a pre-chosen answer; a credible options analysis should occasionally surprise the person who commissioned it, and if it never does, the weighting process should be questioned.
8. Recommend the top-ranked option, but state explicitly the conditions under which a different option would be superior (for example, a capital constraint, a faster competitive timeline, a regulatory change) — this converts the recommendation from a single point answer into a decision framework the reader can apply as circumstances shift.

## Inputs
- The decision to be made and the objective(s) it needs to serve
- Known constraints: capital availability, timeline, regulatory limits, organizational capacity
- A first-draft list of options already under consideration, if any
- The actual decision-maker's priorities, to inform criteria weighting

## Output format
A set of distinct options spanning optimize-core, expand-adjacency, and transformational-bet horizons, plus a baseline; a weighted criteria scorecard showing the score and one-line rationale per option per criterion; a ranked composite result with a stated sensitivity check on the two most contested weights; and a conditional recommendation naming the circumstances under which the ranking would change.

## Example
A company facing a declining core product generates three real options: optimize the core through a cost and retention program, expand into an adjacent segment using existing distribution, and a transformational bet on an entirely new product category. Scored against value (35% weight), feasibility (25%), risk (25%), and strategic fit (15%), the adjacency expansion wins with the base weighting. A sensitivity check shows that if the risk weight were raised from 25% to 40% — a reasonable alternative view given the company's current cash position — optimizing the core would rank first instead. The recommendation: pursue adjacency expansion, but default to optimizing the core if capital availability tightens before the next funding decision point.

## Common pitfalls
- Presenting only one seriously developed option alongside two token alternatives included to create the appearance of choice.
- Setting criteria weights after seeing preliminary scores, which lets the weighting be reverse-engineered to justify a predetermined answer.
- Failing to test how sensitive the final ranking is to the most contested weights, presenting a single ranking as more certain than the underlying judgment calls actually support.
`;
