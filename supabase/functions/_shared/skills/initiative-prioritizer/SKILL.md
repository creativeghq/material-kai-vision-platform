---
name: Initiative Prioritizer
slug: initiative-prioritizer
description: Cuts a long, competing initiative list down to the few the organization can actually execute, sequenced by dependency and capacity, with an explicit kill list.
agents: [kai, product-business]
tags: [strategy]
---

# Initiative Prioritizer

## When to use
Use this when a planning cycle has produced a list of 12, 20, or more initiatives, everyone believes their own initiative is critical, and the organization is quietly planning to fund most of them at reduced scope rather than making real trade-offs. It's also the right tool when last year's roadmap tried to do too much, most initiatives shipped late or watered-down, and leadership wants to avoid repeating that pattern. The signal to use it now: a planning document exists where every initiative is rated "high priority" — that's not a prioritization, it's an unresolved conflict. Without a forced-ranking discipline, organizations spread capacity across too many initiatives, everything slips, and the initiatives that would have mattered most get the same thin resourcing as the ones that don't matter at all.

## What it does
This skill forces a long initiative list through an explicit scoring and capacity-reality filter to identify the handful the organization can actually deliver well, sequences them by dependency and cash flow rather than by raw attractiveness, and produces a companion kill list with a stated reason for every cut. The output is a resourced, sequenced roadmap that acknowledges real constraints instead of a wish list.

## Method
1. Normalize the initiative list: ensure every initiative has a comparable estimate of impact (revenue, cost savings, strategic value), effort (cost and time), and any hard dependencies on other initiatives or teams. Reject vague entries ("improve platform") until they're specific enough to size.
2. Plot every initiative on a 2x2 of impact versus feasibility (a blend of effort, organizational risk, and confidence in the estimate), sizing each bubble by capital required — this visually separates true priorities (high impact, high feasibility) from initiatives that only look attractive until their difficulty is accounted for.
3. Apply a weighted scoring model if more than a simple 2x2 is needed for close calls: score each initiative on strategic fit, financial return, risk, and time-to-value with explicit weights agreed in advance (for example, 40% financial return, 30% strategic fit, 20% risk, 10% speed) — decide the weights before scoring, not after, to avoid reverse-engineering a preferred answer.
4. Model real capacity: estimate how many initiatives of this size and type the organization can actually run in parallel given current team bandwidth, not the idealized capacity in an org chart. If historical delivery shows the team completes 3 major initiatives per year, don't plan for 8 regardless of how the scoring ranks them.
5. Sequence the surviving initiatives by dependency logic first (what must happen before what) and cash flow second (which initiatives fund or enable later ones) — attractiveness rank alone is not a valid sequencing rule if a lower-ranked initiative is a hard prerequisite for a higher-ranked one.
6. Stress-test the resulting shortlist against a capacity ceiling: if the sequenced plan still exceeds realistic parallel capacity, cut further rather than compressing timelines — a plan that assumes unrealistic parallel execution is the single most common cause of a missed roadmap.
7. Write an explicit kill list: every initiative that didn't make the cut, with the specific reason (insufficient impact, infeasible given capacity, redundant with another initiative, dependency not yet met) — this is what makes the prioritization defensible and prevents the same initiatives from being silently re-added next cycle.
8. Revisit the kill list at the next planning checkpoint rather than treating it as permanent — some killed initiatives become viable once a dependency clears or capacity frees up.

## Inputs
- The full candidate initiative list with owner, rough impact estimate, and rough effort/cost estimate for each
- Known dependencies between initiatives or on external factors (regulatory approval, a platform migration, a hire)
- Realistic team capacity based on historical delivery, not budgeted headcount
- The strategic priorities the scoring weights should reflect

## Output format
An impact-vs-feasibility 2x2 with all initiatives plotted and capital sized by bubble; a weighted scorecard for the closely contested initiatives showing the weights used; a sequenced roadmap of the 3-5 funded initiatives with dependency logic shown; and an explicit kill list stating the specific reason each remaining initiative was cut.

## Example
A company enters planning with 14 candidate initiatives, all labeled high priority by their sponsors. After scoring on a weighted model (40% revenue impact, 30% strategic fit, 20% risk, 10% speed) and checking against a realistic capacity of 4 major initiatives per year based on last year's delivery record, the list narrows to 4: a pricing overhaul, a checkout redesign, an enterprise security certification, and a partner API. The security certification is sequenced first because the partner API cannot launch without it. Ten initiatives are killed, including a rebrand (high sponsor enthusiasm, scored low on financial return) and a mobile app rebuild (blocked on the checkout redesign completing first).

## Common pitfalls
- Scoring initiatives on attractiveness alone without checking them against real organizational capacity, producing a roadmap that looks good on paper and fails in execution.
- Letting scoring weights get set after seeing the initiative list, which lets sponsors reverse-engineer the weights to favor their own initiative.
- Cutting initiatives without stating a specific reason, which invites them to be silently re-added in the next planning cycle without new evidence.
