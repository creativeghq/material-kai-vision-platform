---
name: Value Realization
slug: value-realization
description: Tracks every benefit a business case promised through a value ledger with owners and measurement dates, and gates further funding on value actually being proven.
agents: [kai, product-business, erp]
tags: [strategy]
---

# Value Realization

## When to use
Use this immediately after a business case is approved and funded, before implementation begins, so the value tracking mechanism exists from day one rather than being bolted on after someone in finance asks, a year later, whether the promised benefits ever actually showed up. It's especially important for multi-phase programs where later funding depends on earlier phases proving out, and for any initiative where the approval was won partly on optimistic, unvalidated benefit estimates. The signal to use it now: a business case was approved with a headline benefit number, and there is currently no mechanism that would catch it if that number simply never materialized. Without disciplined value realization, organizations fund programs on projected benefits, declare success at launch, and never actually verify — sometimes for years — whether the promised value showed up in the P&L at all.

## What it does
This skill converts a business case's promised benefits into a detailed value ledger with a named owner, a measurement method, and an expected landing date for every line item, and sets stage gates that release further funding only when value from the prior stage is actually proven with data. It closes the loop with an ongoing governance cadence that reviews the ledger and reallocates or escalates the moment value tracking shows signs of stalling.

## Method
1. Extract every promised benefit from the approved business case into a value ledger — not just the headline total, but every individual line item that rolls up to it (specific cost reductions, specific revenue increases, specific efficiency gains), each stated as a discrete, measurable number.
2. Assign one named, accountable owner to each benefit line — the person actually responsible for the underlying operational change that would produce that benefit, not a program manager tracking the ledger passively.
3. Define exactly how each benefit will be measured: the specific data source, the calculation method, and — critically — the baseline it will be measured against, since a benefit claimed without a clearly defined "before" baseline can't be verified as real after the fact.
4. Set an expected landing date for each benefit, tied to the implementation milestone that should produce it, so the ledger can flag benefits that are late relative to plan rather than only being reviewed at the very end of the program.
5. Design stage gates for multi-phase programs: define the specific evidence threshold (a measured value realized, not just a milestone shipped) that must be met before the next phase is funded. Avoid the common failure of gating funding on activity completion (a system went live) rather than on value proof (the benefit that system was supposed to produce actually showed up).
6. Build in a triangulation check for benefits that are hard to measure precisely: cross-reference the primary data source against a second, independent signal (for example, checking a claimed cost reduction against both the finance ledger and the operational unit-cost data) before declaring a benefit realized.
7. Establish a recurring governance cadence — monthly or quarterly depending on program size — that reviews the value ledger against plan, explicitly flags any benefit tracking behind its landing date, and requires the accountable owner to explain the gap and propose a recovery plan or a formal write-down of the benefit.
8. When value stalls and a recovery plan doesn't close the gap within an agreed window, reallocate: redirect funding or attention away from the underperforming line rather than letting an unproven benefit remain quietly on the books indefinitely, inflating the program's apparent success.

## Inputs
- The approved business case with its full list of promised benefits and their sizing
- The implementation plan and its milestones, to align expected landing dates
- Access to the data sources needed to measure each benefit (finance systems, operational metrics, customer data)
- The funding structure of the program, including any phase-gate funding decisions

## Output format
A value ledger listing every promised benefit, its size, owner, measurement method, baseline, and expected landing date; a stage-gate definition tying phase funding to proven (not just delivered) value; a status view showing which benefits are on track, at risk, or already stalled against plan; and a governance cadence with escalation and reallocation triggers.

## Example
A $40M cost-reduction program's value ledger breaks the total into eleven discrete line items, the largest being a $14M procurement savings benefit owned by the head of procurement, measured against a defined pre-program spend baseline and expected to land by month nine. At the month-six governance review, the ledger shows procurement savings tracking at only 40% of plan against the interim milestone. Rather than waiting until the year-end to discover the shortfall, the recovery plan is triggered immediately, and phase-two funding — originally gated on 80% realization of phase-one's promised value — is held pending a revised recovery timeline.

## Common pitfalls
- Declaring a benefit realized because the associated project or system went live, without independently measuring whether the actual financial or operational benefit materialized.
- Tracking only the headline total benefit number instead of a detailed ledger of individual line items, which hides which specific benefits are on track and which are quietly failing.
- Gating phase funding on calendar milestones rather than on proven value, which allows a program to keep drawing funding even after its benefits have clearly stalled.
