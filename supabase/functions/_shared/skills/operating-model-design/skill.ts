// Source of truth for the operating-model-design skill.
// DO NOT EDIT — generated from SKILL.md by scripts/gen-skill-ts.mjs. Edit the markdown.

export default `---
name: Operating Model Design
slug: operating-model-design
description: Translates a chosen strategy into the specific capabilities, org structure, decision rights, and process hand-offs required to actually deliver it.
agents: [kai, product-business]
tags: [strategy]
---

# Operating Model Design

## When to use
Use this once a strategy has been decided but before it's been translated into how the organization will actually operate day to day — the moment when a strategy document exists and everyone nods, but nobody has changed who reports to whom, who decides what, or which team owns which process. It's also the right tool when a strategy shift has been announced but is failing to take hold six months in, which is often a sign the org structure and decision rights were left as they were under the old strategy. The signal to use it now: people keep asking "so who actually owns this?" and get a different answer depending on who's asked. Without deliberate operating model design, a new strategy sits on top of an old organization that structurally cannot deliver it, and the strategy quietly reverts to what the existing structure was built to do.

## What it does
This skill works backward from the strategy to the small number of capabilities it actually requires, designs the organizational structure and governance needed to build and own those capabilities, and assigns explicit decision rights so accountability for key calls is unambiguous. It closes by mapping the core processes end to end to find the hand-offs most likely to break under the new model, before they break in practice.

## Method
1. Start from the strategy, not the current org chart: list the specific outcomes the strategy requires the organization to be able to do that it cannot reliably do today.
2. Derive the few capabilities (typically 3-6) the strategy actually needs — a capability being a durable combination of people, process, and technology, not a project or a single team's task list. Avoid the common trap of listing every function in the business as a "capability"; only list the ones the strategy specifically depends on.
3. For each required capability, assess the current state: does it exist today, is it partially built, or does it not exist at all? This gap assessment determines whether the design task is to reorganize existing capability, build new capability, or acquire/partner for it.
4. Design the organizational structure and governance needed to own each capability — this may mean a new team, a cross-functional pod, a center of excellence, or a change in reporting lines — sized to the capability's importance, not to preserve existing headcount or titles.
5. Assign decision rights explicitly using a structured framework such as a RACI (who is Responsible, Accountable, Consulted, Informed) or a RAPID-style rights map (who Recommends, who Agrees, who has input, who Decides, who is responsible for execution) for every decision that was previously ambiguous or contested. Name actual roles, not just functions, so there's no room for the same confusion to persist under a new label.
6. Map the core end-to-end processes the new operating model depends on, and identify every hand-off between teams or capabilities — hand-offs are where operating models most often break down in practice, not within a single team's own work.
7. For each high-risk hand-off (typically where responsibility crosses a reporting line, a system boundary, or a physical/time-zone gap), specify the trigger, the artifact being passed, and the service-level expectation, so the hand-off has a defined contract rather than relying on informal goodwill.
8. Sequence the transition: decide which structural and decision-rights changes must happen before others can work, and avoid the failure mode of launching a new governance model before the underlying capability or team actually exists to staff it.

## Inputs
- The chosen strategy and its specific execution requirements
- The current org chart, at least two levels deep, and current governance/decision-making practices
- A list of decisions that have recently been contested, duplicated, or stalled due to unclear ownership
- Known process pain points or hand-off failures under the current model

## Output format
A capability requirement list with current-state gap assessment for each; a target org and governance design showing where each capability sits; a decision-rights map (RACI or RAPID-style) naming specific roles for the previously contested decisions; and a process/hand-off map flagging the highest-risk hand-offs with their defined triggers and service-level expectations.

## Example
A company shifting from product sales to solutions selling identifies three capabilities it lacks today: multi-product bundling expertise, a consultative sales motion, and post-sale success management. The design creates a cross-functional "solutions pod" combining sales, solutions engineering, and success roles, and assigns pricing-exception decisions to a RAPID map where the pod lead recommends, the sales VP decides, and finance has input rights but not veto. The process map flags the hand-off between sales close and success onboarding as the highest-risk point, since the current CRM has no defined trigger for when that hand-off should occur, and specifies a same-day handoff SLA with a named artifact (a account transition brief).

## Common pitfalls
- Designing an operating model around the existing org chart and titles rather than working backward from what the strategy actually requires the organization to do.
- Assigning decision rights only to functions or committees rather than named roles, which reproduces the same accountability gap under new terminology.
- Focusing on structure and org charts while ignoring the process hand-offs between teams, which is where most operating model failures actually occur.
`;
