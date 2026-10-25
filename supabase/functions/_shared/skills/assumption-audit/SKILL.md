---
name: Assumption Audit
slug: assumption-audit
description: Surfaces the unstated beliefs a strategy rests on, grades the evidence behind them, and pressure-tests the ones that would break the plan if wrong.
agents: [kai, product-business]
tags: [strategy]
---

# Assumption Audit

## When to use
Reach for this before a strategy, business case, or investment decision is locked in — especially when a plan has sailed through review because everyone agrees on the conclusion without anyone stating what has to be true for it to work. It is also the right move when a plan has been running for a while but performance is lagging expectations and no one has gone back to ask which of the original beliefs quietly turned out to be wrong. The signal to use it now: someone says "well, obviously X will happen" and no one can point to the evidence for X. Without this discipline, strategies fail quietly — not because the logic was wrong, but because a load-bearing belief nobody examined turned out to be false, and it's only discovered after the money is spent.

## What it does
This skill extracts every belief a plan implicitly depends on, separates the ones that are merely convenient from the ones that are actually load-bearing, and directs scrutiny only at the latter. It produces a defensible view of exactly where a strategy is fragile, what evidence would resolve that fragility, and how the story ends if the fragile assumptions break.

## Method
1. Reconstruct the plan's logic as an explicit chain: "we will achieve [outcome] because [assumption 1] and [assumption 2] and [assumption 3] are true." Do this before touching any individual assumption — a plan's assumptions are usually implicit, and stating the chain out loud is what surfaces them.
2. Build a full assumption register from that chain: every belief about market behavior, customer response, internal capability, competitor behavior, cost, timing, and regulatory environment that the plan requires.
3. Classify each assumption as a fact (independently verifiable today), an inference (reasoned from related data), or a pure belief (no supporting data exists yet).
4. Plot every assumption on a 2x2 of importance (how much the outcome depends on it) versus confidence (how well-evidenced it is). The upper-left quadrant — high importance, low confidence — is where the strategy is genuinely fragile; deprioritize everything else regardless of how uncertain it feels emotionally.
5. Grade the evidence behind each fragile assumption on an A-F scale: A/B is validated by direct data or experiment, C is analogous evidence from a comparable situation, D is expert judgment alone, F is unexamined wishful thinking. Avoid the common trap of treating confident tone as evidence — a strongly held D-grade belief is still a D.
6. For each fragile, weakly graded assumption, design a specific kill-shot test: the cheapest, fastest experiment, data pull, or expert check that could prove the assumption false. State what result would kill it and what result would validate it before running the test, to avoid confirmation bias in reading results afterward.
7. Write a short pre-mortem: assume the strategy failed twelve months from now, and narrate backward which fragile assumption broke and how the failure cascaded.
8. Sequence the kill-shot tests by cost and cycle time, and flag any fragile assumption that cannot be tested cheaply before commitment — that is a risk to carry explicitly into governance, not to bury.

## Inputs
- The strategy, business case, or recommendation document in its current form
- Any market research, pilot data, or analogous case evidence already gathered
- Named owners for the plan who can be interviewed on the reasoning behind key claims
- The decision timeline (how much time exists to run validation tests before commitment)

## Output format
An assumption register (belief, category, importance, confidence, evidence grade) sorted by fragility; a plotted importance-confidence 2x2 with the fragile quadrant called out by name; a one-paragraph pre-mortem narrating the most likely failure path; and a prioritized test plan listing each kill-shot test, its cost/time, and the go/no-go threshold for interpreting its result.

## Example
A retailer's plan to enter a new geography rests on the belief that its existing loyalty program will transfer intact to new customers with no local competitor response. The audit surfaces that "loyalty program transfers as-is" is graded D (pure internal belief, no comparable market tested) and sits in the high-importance/low-confidence quadrant, while "warehouse capacity is sufficient" is graded A and safely deprioritized. The kill-shot test proposed: run the loyalty offer in one comparable adjacent market for 60 days before full launch. The pre-mortem shows that if local competitors match the loyalty discount within 90 days, the entire margin case collapses — exactly the scenario the test is designed to catch before the capital is committed.

## Common pitfalls
- Auditing every assumption equally instead of triaging to the few that are both important and unproven — this produces a long, unread document instead of a decision tool.
- Mistaking confidence or seniority of the person asserting a belief for evidence quality; the grading must be evidence-based, not authority-based.
- Running the kill-shot test but not pre-committing to what result would change the decision, which lets teams rationalize away inconvenient results after the fact.
