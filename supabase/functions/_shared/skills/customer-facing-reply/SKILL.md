---
name: Customer-Facing Reply
slug: customer-facing-reply
description: Send something a stranger will read — a social post, a WhatsApp message, an inbox reply, a public review response — without publishing it before the user has seen the words. Use whenever the outcome of a turn is text leaving the workspace under the workspace's name.
agents: [kai, social-media]
tags: [social, messaging, inbox, reviews, confirm]
---

# Customer-Facing Reply

Every tool in this set does the same dangerous thing: it puts words in front of someone outside the workspace, signed by the workspace. A published post, a sent WhatsApp, a public reply to a bad review — none of them can be taken back, and all of them are one tool call away.

`manage_social`, `manage_messaging`, `manage_inbox` and `manage_reviews` all carry a `confirm` flag for this reason. **`confirm` is the human-in-the-loop gate. It is never yours to set on the user's behalf.**

## The shape of every one of these turns

```
1  draft      show the exact words, in full
2  target     name who sees it, on which account/channel/thread
3  wait       the user approves, edits, or drops it
4  send       the same call, with confirm: true
```

Step 1 is not a summary. "I'll post something about the new range" is not a draft — the user cannot approve words they have not seen. Show the caption, the hashtags, the message body, verbatim, and let them read it.

## Rules

**1. Never invent the audience.**
`manage_social` publishes to an ALREADY-CONNECTED account. Call `list_accounts` first and use a real `account_id`. Do not guess a platform because the user said "post this" — if two accounts are connected, ask which, or offer both explicitly.

**2. A review reply is permanent and public. Slow down.**
`manage_reviews` with `action: 'reply'` writes where the reviewer, and everyone reading their review, will see it forever. For anything negative: draft, show it, and say plainly that it is public and permanent before you ask. Never argue with the reviewer's account of what happened, never mention anything about them the review did not, and prefer short. `only_unanswered: true` is how you find what actually needs attention.

**3. An inbox reply goes to a real customer mid-conversation.**
`manage_inbox` `reply` is customer-facing; `internal_note: true` is not. If the user's intent is to leave a note for a colleague, the flag is the whole difference between a private annotation and a message to the customer. When it is ambiguous — "add that we can do Tuesday" — ask which. Getting this wrong sends a half-formed internal thought to the person you are trying to serve.

**4. `handover` is a decision about who is answering.**
Setting `agent_state: 'off'` hands the thread back to a human, `'active'` gives it to the assistant. Do not toggle it as a side effect of doing something else — say what you are doing and why.

**5. Scheduling is not a softer send.**
`action: 'schedule'` with `scheduled_at` still publishes, just later, and usually when nobody is watching. Confirm it exactly as you would an immediate post, and repeat the date and time back in the user's own terms ("Tuesday the 26th, 9am") — an ISO timestamp is easy to approve and hard to actually check.

**6. Generated content is a draft, not an output.**
`generate_content` and `generate_image` produce a candidate. Show it, offer to change it, and never chain straight from generation into `publish`. A generated caption the user never read is the exact failure this skill exists to prevent.

## What does not need confirming

Reading is free and safe: `list_accounts`, `account_insights`, `post_analytics`, `best_time`, `manage_inbox` `list`, `manage_reviews` `list`, `manage_messaging` `list_channels`. Run those without asking — the doctrine is act-then-refine, and stopping to request permission to LOOK at the workspace's own analytics is the other failure mode. The gate is on publishing, not on knowing.

**`best_time` before scheduling.** When the user wants a post out "sometime this week", it answers the question with the account's own data rather than a guess about when engagement peaks.
