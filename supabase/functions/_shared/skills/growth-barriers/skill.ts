// Source of truth for the growth-barriers skill.
// DO NOT EDIT — generated from SKILL.md by scripts/gen-skill-ts.mjs. Edit the markdown.

export default `---
name: Growth Barriers
slug: growth-barriers
description: Decomposes stalled growth arithmetically and through the funnel to isolate the single binding constraint, rather than treating the loudest symptom as the cause.
agents: [kai, product-business]
tags: [strategy]
---

# Growth Barriers

## When to use
Use this when growth has stalled or decelerated and leadership is debating half a dozen competing theories at once — pricing is too high, the sales team isn't hunting, marketing spend is down, the product has a gap — without any of them being tested against the data. It is also the right tool when a single fix has already been tried (more ad spend, a new sales hire, a price cut) and growth didn't respond, which usually means the team treated a symptom rather than the actual constraint. The signal to use it now: the loudest voice in the room, not the data, is currently driving the growth diagnosis. Without this discipline, organizations chase the most visible or most politically convenient explanation, spend a quarter fixing the wrong thing, and are surprised when growth still doesn't move.

## What it does
This skill decomposes growth into its arithmetic and behavioral components to locate exactly where the deceleration is happening, then traces that location back to a structural root cause rather than stopping at the first plausible story. It produces a single, evidenced binding constraint — the one thing that, if fixed, would unlock the most growth — plus the next analysis needed to confirm it before resources are committed.

## Method
1. Decompose top-line growth arithmetically into its component parts: new customer revenue, expansion revenue, churned revenue, and contraction revenue. Compute each as a distinct time series rather than looking only at the net number — a flat top line can hide new-business strength being offset by a churn problem, or vice versa.
2. Date the precise inflection point where the growth curve bent, to the month or quarter if data allows, and line it up against a timeline of internal changes (pricing changes, org changes, product releases, market events) to generate hypotheses grounded in what actually changed, not speculation.
3. Walk the acquisition-to-retention funnel as a waterfall — leads, qualified opportunities, closed deals, onboarded accounts, retained accounts, expanded accounts — and calculate the conversion rate at each stage against its historical baseline. Locate the stage with the largest deviation from baseline; that is where the leak is, and it is often not the stage generating the most internal complaints.
4. Read cohort retention curves by signup or purchase vintage to distinguish structural decay (a permanent step-down in the curve starting at a specific cohort, indicating something changed for everyone after that point) from cyclical or seasonal decay (a recurring pattern that self-corrects). Only structural decay indicates a fixable binding constraint; cyclical patterns should not be treated as a crisis.
5. Once the leaking stage and its structural nature are confirmed, apply a five-whys root-cause trace: ask why that stage degraded, then why the answer to that is true, repeatedly, until you reach a root cause that is structural (a process, policy, or product change) rather than a restatement of the symptom.
6. Cross-check the root-cause hypothesis against a segment cut: does the deceleration show up uniformly across all customer segments and geographies, or is it concentrated in one? A concentrated pattern (for example, only one onboarding cohort or one sales region) sharply narrows the causal candidates and should be weighted more heavily than a diffuse pattern.
7. Avoid the common trap of stopping at the first plausible correlation — a change in marketing spend that coincides with the inflection point is a hypothesis, not proof, until the funnel and cohort data confirm the mechanism.
8. State the single binding constraint in one sentence, rank the confidence level in that conclusion, and name the specific next analysis (a cohort deep-dive, a customer interview round, an A/B test) that would confirm or kill the hypothesis before a fix is funded.

## Inputs
- Revenue and customer count time series broken out by new, expansion, churn, and contraction
- Full-funnel conversion metrics from lead to retained/expanded account, with historical baselines
- Cohort retention data by signup or purchase vintage, if available
- A timeline of internal changes (pricing, product, org, process) over the period in question

## Output format
A growth decomposition chart (new/expansion/churn/contraction over time), a funnel waterfall with conversion rates and deviation from baseline flagged, a cohort retention chart distinguishing structural from cyclical decay, a one-sentence statement of the binding constraint with a confidence level, and a named next analysis to confirm it.

## Example
A B2B software company sees flat year-over-year growth and initially suspects weak new-customer acquisition. The decomposition shows new-logo revenue is actually up 12%, but expansion revenue has collapsed by 40% since a specific quarter. Lining that inflection up against the change timeline shows it coincides exactly with an onboarding process change three months prior. The cohort view confirms structural decay starting precisely with the cohort onboarded after the change, concentrated in the mid-market segment. The binding constraint: the new onboarding flow broke feature adoption for mid-market accounts, capping expansion — not an acquisition problem at all. Next analysis: cohort-level feature adoption comparison pre- and post-onboarding change.

## Common pitfalls
- Diagnosing growth problems from the net top-line number alone, which hides offsetting movements between new business, expansion, and churn.
- Accepting the most politically convenient or loudest explanation (usually "sales isn't performing") without testing it against funnel and cohort data.
- Stopping the root-cause trace at the first symptom found in the funnel instead of tracing it back with five-whys to a structural, fixable cause.
`;
