// Source of truth for the competitive-intel skill.
// DO NOT EDIT — generated from SKILL.md by scripts/gen-skill-ts.mjs. Edit the markdown.

export default `---
name: Competitive Intel
slug: competitive-intel
description: Models rival capabilities and structural incentives to predict competitors' most likely next moves, and pre-commits your response before they act.
agents: [kai, product-business, marketing]
tags: [strategy]
---

# Competitive Intel

## When to use
Use this when a decision hinges on what a competitor will do next — a pricing move, a product launch, an entry into your core segment — and the current view of competitors is a list of facts about them rather than a prediction about their behavior. It is also the right tool ahead of a major strategic move of your own, since launching without a view of the likely competitive response means reacting after the fact instead of planning for it. The signal to use it now: a competitor did something surprising and the room's explanation is "they're crazy" rather than "here's the incentive that made this rational for them." Without structured competitive modeling, teams either ignore competitors until they're blindsided or become reactive to every rumor without any read on which moves are actually likely.

## What it does
This skill combines a structural read of industry economics with rival-specific capability and incentive analysis to produce a ranked, falsifiable prediction of what each key competitor is likely to do next — not just a description of what they have done. It closes with a pre-committed response plan so your organization reacts on a pre-agreed logic rather than improvising under pressure when the move actually happens.

## Method
1. Frame the structural pressures in the industry: map the bargaining power of buyers and suppliers, the threat of substitutes, the threat of new entrants, and the intensity of rivalry among existing players. This sets the backdrop that makes any single rival's move rational or irrational.
2. Define a three-ring competitive set: direct rivals competing for the same customers today, adjacent players who could pivot into your space with modest effort, and potential entrants (well-capitalized outsiders, new business models) who could reshape the game entirely. Avoid the common mistake of only tracking direct rivals — the biggest threats often come from ring two or three.
3. Build a force-ranked capability matrix across the 4-6 dimensions that actually decide competitive outcomes in this market (for example: cost position, distribution reach, brand trust, technology lead, capital access, regulatory relationships) — not a generic SWOT list.
4. For each key rival, identify their strategic incentive: what does their cost structure, ownership pressure (public market expectations, private equity hold period, founder control), and current market position push them toward doing next, regardless of what they say publicly.
5. Write a one-paragraph behavioral thesis per key rival that names their two most probable next moves, ranked by likelihood, and states the specific evidence or leading indicator that would confirm each move is starting.
6. Stress-test each thesis against the rival's historical pattern of behavior — has this competitor moved on price, product, or channel in the past under similar pressure? Weight predictions toward established patterns over hypothetical new behavior unless there's a clear reason (new leadership, new capital, new ownership) to expect a break from pattern.
7. Pre-commit your response logic to the top two most likely moves per key rival: define in advance what you will do if the move happens, so the decision is made calmly now rather than reactively later.
8. Set a monitoring cadence and name the specific signals (pricing pages, job postings, patent filings, executive moves, earnings call language) that would provide early warning of the predicted move.

## Inputs
- A list of named competitors, segmented into direct/adjacent/entrant rings
- Each competitor's last two to three public moves (pricing changes, launches, M&A, leadership changes)
- Your own capability position on the same dimensions used to score rivals
- Any available data on competitor cost structure, funding position, or ownership pressures

## Output format
An industry structural-pressure summary, a three-ring rival map, a force-ranked capability matrix scoring you against each rival, a one-paragraph behavioral thesis per key rival naming their top two likely moves with supporting evidence, and a pre-committed response plan with monitoring signals for each predicted move.

## Example
An incumbent software vendor facing margin pressure analyzes its #2 rival, a well-funded challenger two years past its last funding round with investor pressure to show growth. The capability matrix shows the challenger is weak on enterprise trust but strong on price aggressiveness. The behavioral thesis concludes the challenger's most likely move within two quarters is a mid-market price cut of 15-20% to drive logo growth ahead of a follow-on raise, evidenced by recent job postings for a "growth pricing" role. The pre-committed response: rather than matching price, the incumbent commits in advance to bundling a premium support tier at the current price point if the cut materializes, avoiding a reactive price war.

## Common pitfalls
- Cataloging competitor facts (headcount, funding, feature lists) without converting them into an incentive-based prediction of what they'll do next.
- Ignoring adjacent players and new entrants because they don't show up in today's competitive win/loss data.
- Reacting to a competitor move in real time instead of pre-committing the response logic, which leads to panicked, inconsistent decisions under time pressure.
`;
