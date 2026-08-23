---
name: Property Lead to Viewing
slug: property-lead-to-viewing
description: Take a real-estate enquiry from "do you have anything like this" to a booked viewing or a recorded offer, using the portfolio that exists rather than a described one. Use when the user asks about listings, buyers, valuations, viewings, offers, lettings or maintenance.
agents: [kai, property-advisor]
tags: [real-estate, leads, viewings, listings, cma]
---

# Property Lead to Viewing

`manage_real_estate` is one tool with sixteen actions, and the ones that read are cheap while the ones that write are consequential. The order that works:

```
1  find it     list_properties / get_property      what the workspace actually has
2  match it    find_leads                          who is already looking for it
3  price it    cma_report                          a comparable-based number, never yours
4  book it     schedule_viewing                    the point of the conversation
5  record it   manage_deal / complete_sale         what happened, in the pipeline
```

## Search the portfolio before you describe one

`list_properties` takes `status`, `property_type`, `transaction_type`, `town`, `price`, `area`. Filter with them and answer from what comes back. The failure this prevents is fluent and common: asked "do we have any two-beds in Glyfada under €300k", the model summarises what such a property would be like instead of listing the three the workspace owns.

If the filters return nothing, that is an answer — say the portfolio has none matching, and offer the nearest thing by widening ONE filter at a time (price, then town, then type). Do not report "no results" from a single narrow query as though the portfolio were empty.

## Never state a valuation you produced

`cma_report` is the comparable-market-analysis. It is the only source of a property value in this system.

A number you reason your way to — from the price per square metre of two other listings, from what the area "usually goes for" — is an appraisal, given to someone who will act on it, by something with no licence and no comparables. That it will sound reasonable is the danger, not the mitigation. Run `cma_report`, quote what it returns, and if it cannot produce one, say a valuation needs to be run rather than filling the gap.

The same rule applies to `sale_price` and `commission_pct` on `complete_sale`: those come from the deal that was actually agreed, never from your estimate of what it was worth.

## Match the lead you already have

`find_leads` searches registered buyer/tenant interest. Run it whenever a listing is the subject — the most valuable sentence in an estate agency conversation is "three people on our books are looking for exactly this", and it is one call away.

Going the other direction works too: given a buyer, `list_properties` filtered to their brief is the shortlist. Do both before proposing anything external.

## The writes, and what each one really does

| action | what it does to the world |
|---|---|
| `create_listing` | adds a property to the workspace portfolio |
| `publish_listing` | pushes it to the portals — **externally visible, treat as a send** |
| `schedule_viewing` | books a real appointment at `scheduled_at` for a real `crm_contact_id` |
| `log_maintenance` | opens a work order somebody will be dispatched on |
| `complete_sale` | closes the transaction and books commission |
| `manage_deal` | moves the deal's `stage` in the pipeline |

**`publish_listing` is publication.** Show the listing as it will appear — `draft_description` first if there is no copy yet — and get agreement before it goes to the portals. A listing published with the wrong price or the wrong photos is visible to the entire market within minutes.

**`schedule_viewing` needs a real contact and a real time.** `crm_contact_id` and `scheduled_at`, both confirmed with the user. Never invent a slot to be helpful — a viewing nobody agreed to is an agent standing outside a house.

**A deal stage is per deal type.** `manage_deal` validates `stage` against the deal's own type; a stage borrowed from a different pipeline is rejected. Take the stage from what the deal already offers rather than from what sounds like the next step.

## Lettings are a different clock

`list_lettings` covers tenancies, rent and maintenance — a running relationship, not a transaction that closes. When the subject is a tenancy, the useful questions are about renewal dates, arrears and open work orders, not about sale price. `log_maintenance` with `work_order_title` and `work_order_description` is how a reported problem becomes something a contractor can be sent to; a maintenance issue that ends as a sympathetic sentence in chat has not been recorded anywhere.

## Ending well

Every enquiry ends in one of: a booked viewing, a recorded offer or interest, a CMA the user can send, or a shortlist they asked for. An answer that ends in a description of the market has not moved anything — and unlike a lost search result, a lost property lead was a person who was ready to buy.
