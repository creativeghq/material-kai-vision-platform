# Shopify theme app extension (#258 Phase 3)

Puts `<materialkai-product>` on a Shopify product page as a **drag-in block** rather than a snippet
a merchant has to paste into theme code. That distinction is the whole point: most Shopify
merchants will not edit Liquid, and asking them to is where an embed integration quietly dies.

## What is here, and what is not

**Here:** the complete extension source — the block, its settings schema, and the cart bridge.

**Not here:** a deployed app. Publishing needs a **Shopify Partner account**, an app registered
against it, and `shopify app deploy`. Those are operator decisions with billing attached, not
something a repo can hold. Nothing in this directory runs until that exists.

```bash
npm i -g @shopify/cli @shopify/theme
shopify app dev      # develop against a dev store
shopify app deploy   # publish the extension version
```

## Mapping a Shopify product to a MaterialKai product

They are different rows in different systems, so something has to join them. In order of
preference:

1. **A `materialkai.product_id` metafield** on the Shopify product. Set the definition up once
   (Settings → Custom data → Products, namespace `materialkai`, key `product_id`, type
   single-line text) and every product carries its own id. Survives theme changes.
2. **The block's "MaterialKai product ID" setting.** Fine for one hero product; a maintenance
   burden for a catalog, because it lives in the theme rather than on the product.

With neither set the block renders **nothing** — a merchant mid-setup should not have a broken box
on a live storefront.

## The cart bridge

The widget does not take payment and does not own price. When a shopper adds to cart, the block
adds the **currently selected Shopify variant** and records the chosen finishes as line-item
properties:

| Property | Example | Visible to the shopper |
|---|---|---|
| `Fabric` | `Velvet Emerald` | yes — this is what the cart, order and picker read |
| `_materialkai_options` | `a1b2…,c3d4…` | no (underscore-prefixed) |
| `_materialkai_product_id` | `f31d…` | no |

Shopify keeps ownership of price, inventory and tax — a configurator that tried to own any of those
on someone else's storefront would be wrong about all three. The readable properties are what makes
a configured order fulfillable; the hidden ones let the exact configuration be reconstructed when
someone asks "which one did they actually order?".

## Before it works

The shop's domain must be on the embed key's **allowed websites** (Profile → Keys → Website Embed),
including any `*.myshopify.com` preview domain used while setting up. Without it the widget shows
"This website is not allowed to use this embed key" — which is the message it exists to give, and a
one-line fix.
