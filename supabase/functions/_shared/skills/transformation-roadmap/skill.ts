// Source of truth for the transformation-roadmap skill.
// DO NOT EDIT — generated from SKILL.md by scripts/gen-skill-ts.mjs. Edit the markdown.

export default `---
name: Transformation Roadmap
slug: transformation-roadmap
description: Sequences a prioritized initiative set into phased execution with named owners, milestones, and a concretely detailed first 90 days.
agents: [kai, product-business]
tags: [strategy]
---

# Transformation Roadmap

## When to use
Use this once a strategy and its priority initiatives have been decided but before execution begins, when the plan currently exists only as a list of initiatives with no phasing, no named owners, and no answer to "what happens in week one." It's also the right tool when a previous transformation stalled because everything was scheduled to start simultaneously, overwhelming the organization's real delivery capacity. The signal to use it now: a steering committee approves a strategy and the very next question — "okay, so what happens Monday?" — has no concrete answer. Without a disciplined roadmap, even a well-prioritized strategy loses momentum in the handoff to execution, because a list of initiatives is not a plan for who does what, in what order, starting when.

## What it does
This skill converts a prioritized initiative list into a phased roadmap with clear objectives and exit criteria for each phase, places every initiative into the phase where its dependencies and the organization's real capacity allow it to actually succeed, and assigns single accountable owners to each workstream. It closes by detailing the first 90 days concretely enough that visible momentum starts immediately rather than in a vague "planning phase."

## Method
1. Define the phases of the transformation based on logical objectives, not arbitrary time blocks — each phase should have a clear purpose (for example, "stabilize the core," "build new capability," "scale") and explicit exit criteria that must be met before the next phase begins.
2. Place every initiative from the prioritized list into the phase where it belongs, respecting two constraints simultaneously: dependency logic (an initiative that requires another to complete first cannot be scheduled earlier) and realistic organizational capacity (how many major initiatives the relevant teams can actually deliver well in parallel, based on past delivery record, not aspirational headcount).
3. Where an initiative's ideal timing (by attractiveness) conflicts with its dependency or capacity constraint, resolve in favor of the constraint — sequencing for dependencies and cash flow rather than for pure attractiveness is what prevents a roadmap that looks good on a slide but collapses under real delivery conditions.
4. Assign one single accountable owner per workstream, not a committee — a workstream with shared ownership among peers of equal seniority is a common structural cause of stalled transformations, since no one has the standing to force trade-offs when priorities conflict.
5. Define specific, dated milestones within each phase, each with a clear "done" definition (a shipped capability, a measured outcome, a completed decision) rather than a vague activity description ("continue work on X").
6. Build the first 90 days in far greater granularity than later phases — week-by-week or even day-by-day for the first month — because the first 90 days determine whether the organization believes the transformation is real; a vague first quarter kills credibility before the harder later phases even begin.
7. Identify the top execution risks specific to the sequencing itself (not just the generic strategic risks already covered elsewhere): which milestone, if missed, would cascade delays through dependent initiatives in later phases, and what contingency exists if that milestone slips.
8. Build in a formal checkpoint at the end of each phase to test exit criteria before advancing, rather than sliding into the next phase by calendar default — avoid the common failure of treating phase transitions as automatic rather than gated on actually meeting the stated objective.

## Inputs
- The prioritized initiative list with rough sizing, owners, and known dependencies
- Realistic team capacity and historical delivery track record
- Any hard external constraints (budget cycles, regulatory deadlines, board reporting dates)
- The organization's tolerance for parallel change versus need for early, visible wins

## Output format
A phased roadmap (typically 3-4 phases) with a stated objective and exit criteria for each; initiatives placed into phases with dependency logic shown; a named accountable owner and dated milestones per workstream; a sequencing-risk list with contingencies; and a detailed, week-by-week first-90-days plan.

## Example
A company with four prioritized initiatives — a platform migration, a new pricing model, a sales reorganization, and a customer success buildout — sequences the roadmap into three phases over twelve months: phase one stabilizes the platform migration (a hard dependency for the pricing model, which requires the new billing system), phase two launches the pricing model and sales reorg in parallel since they don't conflict for the same team's capacity, and phase three builds out customer success once the new pricing model's renewal data exists to inform it. The first 90 days detail the platform migration's week-by-week cutover plan, including a named contingency if the cutover date slips past week 6, which would cascade a two-month delay into the pricing launch.

## Common pitfalls
- Scheduling initiatives by attractiveness alone without checking real dependency and capacity constraints, producing a roadmap that cannot actually be delivered as sequenced.
- Assigning workstream ownership to a committee or co-owners of equal seniority, which removes the single point of accountability needed to force trade-offs under pressure.
- Leaving the first 90 days as vague as later phases, which fails to generate the early visible momentum that sustains organizational belief in the transformation.
`;
