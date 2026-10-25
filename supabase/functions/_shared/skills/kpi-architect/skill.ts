// Source of truth for the kpi-architect skill.
// DO NOT EDIT — generated from SKILL.md by scripts/gen-skill-ts.mjs. Edit the markdown.

export default `---
name: Kpi Architect
slug: kpi-architect
description: Designs a metrics system linking one north-star outcome down through a MECE driver tree to operational KPIs, with action thresholds and proxy-failure checks.
agents: [kai, product-business, erp]
tags: [strategy]
---

# KPI Architect

## When to use
Use this when a team is tracking a long dashboard of metrics that move up and down every week without anyone being able to say which ones actually predict the strategic outcome, or when goals are set in vague language ("improve engagement," "grow the pipeline") that can't be operationalized into a specific number someone is accountable for. It's also the right tool after a metric has clearly been gamed — a target was hit but the underlying business didn't improve — because that's a sign the metric was a poor proxy for the outcome it was meant to represent. The signal to use it now: a metrics review meeting spends more time debating what a number means than deciding what to do about it. Without a designed metrics system, organizations either drown in vanity metrics that don't drive decisions or optimize hard for a number that can be gamed without moving the real outcome.

## What it does
This skill defines a single north-star metric tied to the strategy, decomposes it into a clean driver tree down to metrics that operational teams can actually influence day to day, and sets explicit thresholds that trigger action rather than just observation. It also pressure-tests every metric in the system for how it could be gamed, so the system rewards real progress rather than metric manipulation.

## Method
1. Define the one north-star metric that the strategy is ultimately trying to move — a single outcome metric, not a bundle of several, that is specific enough to be unambiguous (for example, "net revenue retention" rather than "customer success").
2. Run a driver-tree decomposition: break the north-star metric down into the multiplicative or additive components that mathematically determine it (for example, retention = 1 - churn; churn = function of onboarding completion, support response time, and feature adoption), continuing until you reach metrics that a specific team actually controls.
3. Check the decomposition for MECE structure: the driver tree's branches should not overlap (double-counting the same underlying behavior under two different metrics) and should not leave a material gap (a real driver of the north-star metric that isn't represented anywhere in the tree).
4. Organize the resulting metrics into three layers: outcome metrics (lagging, strategic, reported upward), driver metrics (the operational levers teams manage weekly), and health metrics (guardrails that shouldn't be sacrificed to hit driver metrics, such as quality or customer satisfaction).
5. For each driver metric, set an explicit action threshold — the specific value that triggers a defined response — rather than leaving metrics as passive dashboard numbers. A metric without a threshold is not a KPI, it's a chart.
6. Stress-test every metric for proxy failure: ask specifically how a team could hit this number without actually improving the underlying outcome (for example, "resolve support tickets faster" can be gamed by closing tickets prematurely). Where a plausible gaming path exists, pair the metric with a health-metric guardrail that would catch it.
7. Assign ownership: every driver and health metric should have one accountable owner, and the KPI system should make clear which team's metrics roll up into which higher-level outcome, avoiding shared metrics with no clear owner.
8. Set a review cadence matched to each layer's natural update frequency — health and driver metrics reviewed weekly or biweekly, outcome metrics reviewed monthly or quarterly — and avoid the common failure of reviewing lagging outcome metrics so frequently that teams overreact to noise.

## Inputs
- The strategic objective or outcome the organization is trying to move
- The current metrics being tracked, if any, and known complaints about them (gamed, lagging, unclear ownership)
- The operational levers and teams available to influence outcomes
- Any historical data showing the relationship between candidate driver metrics and the north-star outcome

## Output format
A one-line north-star metric definition; a MECE KPI driver tree from north-star down to operational metrics; a three-layer metric table (outcome/driver/health) with owner, cadence, and action threshold for each; and a proxy-failure note for every driver metric identifying its gaming risk and the guardrail metric that catches it.

## Example
A company with a vague goal of "improve engagement" defines a north-star metric of activated accounts (accounts reaching a defined value milestone within 30 days). The driver tree breaks this into onboarding completion rate, time-to-first-value, and feature adoption breadth, each owned by a specific team. An action threshold is set on time-to-first-value: if it exceeds 5 days for two consecutive weeks, the onboarding team triggers a review. The proxy-failure check flags that onboarding completion rate could be gamed by shortening the onboarding flow itself, so it's paired with a health metric tracking 90-day retention of accounts that completed onboarding, to confirm shortening the flow isn't just moving churn downstream.

## Common pitfalls
- Tracking a wide dashboard of metrics with no explicit link to a single north-star outcome, so teams can't tell which numbers actually matter.
- Setting metrics without action thresholds, turning KPIs into passive charts nobody is accountable for acting on.
- Failing to pressure-test metrics for gaming, which lets teams hit their number while the underlying outcome quietly gets worse.
`;
