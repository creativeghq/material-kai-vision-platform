// Source of truth for the business-case-builder skill.
// DO NOT EDIT — generated from SKILL.md by scripts/gen-skill-ts.mjs. Edit the markdown.

export default `---
name: Business Case Builder
slug: business-case-builder
description: Builds a driver-based economic model for a decision, with NPV/IRR, sensitivities, and the conditions required for the case to hold, fully exposed.
agents: [kai, product-business, erp]
tags: [strategy]
---

# Business Case Builder

## When to use
Use this when a decision — a new investment, a product launch, a build-vs-buy call, a cost program — needs to be justified in economic terms before capital is committed, and especially when the current "case" is really just a single top-line number with no visible logic behind it. It is also the right tool when a case has already been built but feels fragile: nobody can say which two or three inputs actually determine whether the number is positive or negative. The trigger is a sponsor asking "so what does this actually depend on?" and getting a shrug in response. Without a driver-based build, business cases either get rubber-stamped on optimism or rejected on suspicion, and both outcomes are avoidable with a transparent model.

## What it does
This skill constructs a fully driver-based financial model for a decision — every revenue, cost, capital, and timing assumption stated as an explicit, editable input rather than baked into a black-box total — and then computes the standard investment metrics on top of that transparent base. The output lets any reviewer trace the final number back to the two or three assumptions that actually drive it, and states plainly what would have to be true for the investment to clear its hurdle.

## Method
1. Define the decision precisely: what is being invested, over what time horizon, against what alternative (including the "do nothing" baseline, which is often skipped but changes the answer materially).
2. Build the driver tree: decompose revenue into volume x price x mix, cost into fixed versus variable and one-time versus recurring, and capital into upfront and maintenance requirements. State every driver as a named, sourced input rather than a hardcoded figure.
3. Establish the base case using the most defensible, evidence-backed value for each driver — pull from historical actuals or comparable launches where available, and flag any driver that is pure judgment.
4. Compute NPV, IRR, and payback period from the driver tree, and show the year-by-year build so a reviewer can audit each line, not just trust the final output.
5. Identify the two or three drivers with the largest effect on NPV by running a sensitivity/tornado analysis: flex each driver individually across a realistic range (for example, +/-30%) holding others constant, and rank by swing in NPV.
6. For the top two uncertain drivers, run a combined sensitivity (a simple data table or scenario grid) to find the breakeven threshold — the specific value below which the case turns negative. State this as a hard number ("the case requires attach rate above 18%"), not a vague caveat.
7. List the key risks to the plan and map each to the driver it would move; avoid the common failure of listing generic risks ("execution risk," "market risk") disconnected from the model — every risk should trace to a specific line.
8. State the decision logic explicitly: recommend proceed, proceed with conditions, or hold, and name exactly which threshold or evidence gap the recommendation depends on closing.

## Inputs
- The investment or initiative description and its time horizon
- Revenue drivers: expected volume, pricing, mix, and ramp assumptions
- Cost drivers: fixed costs, variable unit costs, and one-time implementation costs
- Capital requirements and the company's discount rate/hurdle rate
- Any comparable historical launches or benchmarks to anchor base-case assumptions

## Output format
A driver-based model summary (assumptions table with sourcing notes), the NPV/IRR/payback build shown year by year, a tornado chart ranking drivers by sensitivity, a breakeven statement for the top two uncertain drivers, and a risk list mapped to specific model lines with a final proceed/hold recommendation.

## Example
A software company evaluating a new usage-based pricing tier builds a five-year model with volume, average revenue per account, and infrastructure cost as the three core drivers. The base case shows NPV of $6.2M at a 12% discount rate, but the tornado analysis reveals that attach rate to the new tier (not infrastructure cost, as the team assumed) drives 70% of the NPV swing. The breakeven analysis shows the case only clears hurdle above an 18% attach rate within 18 months, versus a comparable launch's historical 14% — so the recommendation is proceed with a conditional gate at month 9 attach-rate checkpoint, not unconditional funding.

## Common pitfalls
- Presenting only the final NPV/IRR without the driver build, which makes the case unauditable and invites reviewers to distrust it regardless of its accuracy.
- Running sensitivities on every input equally instead of isolating the few drivers that actually move the outcome, which buries the real risk in noise.
- Treating the base case as the expected case rather than stating the specific threshold conditions required for it to hold.
`;
