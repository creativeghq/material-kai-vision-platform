# Supplier Orders API (partner / ERP)

Lets a **claimed supplier's own ERP** read the purchase orders sent to it across every buyer on the platform and post acknowledge/ship status back. Same `kai_*` api-key model as the price / mention / job partner APIs. Part of Workstream F (#247).

- **Endpoint:** `POST` or `GET` `https://<project>.supabase.co/functions/v1/supplier-orders-api`
- **Auth:** `Authorization: Bearer kai_…` (a key from `api_keys`, created in the supplier's workspace). The key's workspace **must hold an operator-approved supplier-identity claim** (`platform_suppliers.claimed_workspace_id`), otherwise `403`.
- **Gateway:** `verify_jwt = false` (the function validates the partner key itself).

## Visibility contract
Only the **PO header + line items + buyer workspace name** are returned. Never the buyer's catalog, pricing, margins, internal notes, other suppliers, or any PO not addressed to the caller's claimed identity.

## List inbound orders
`GET /supplier-orders-api` — or — `POST { "action": "list_orders" }`

```json
{
  "orders": [
    {
      "order_id": "uuid",
      "order_number": "string",
      "status": "confirmed | partially_fulfilled | fulfilled",
      "currency": "EUR",
      "total": 1234.50,
      "created_at": "ISO-8601",
      "buyer_name": "Buyer workspace name",
      "supplier_status": "acknowledged | shipped | null",
      "supplier_eta": "date | null",
      "lines": [
        { "description": "string", "quantity": 10, "unit_price": 12.34, "line_total": 123.40 }
      ]
    }
  ]
}
```
Only orders that have actually been **placed** (status `confirmed` / `partially_fulfilled` / `fulfilled`) appear — drafts do not.

## Post status back
`POST { "action": "update_order", "order_id": "uuid", "status": "acknowledged" | "shipped", "eta": "YYYY-MM-DD"?, "note": "string"? }`

```json
{ "order_id": "uuid", "ok": true }
```
- `status` must be `acknowledged` or `shipped` (else `400 invalid status`).
- The order must be addressed to one of the caller workspace's claimed identities (else `403`).
- Writes `orders.supplier_status` / `supplier_eta` / `supplier_note` / `supplier_acknowledged_at` — it does **not** change the buyer's own order lifecycle (receiving stays the buyer's action).

## Errors
| Status | Meaning |
|---|---|
| 401 | Missing/invalid `kai_*` key |
| 403 | Key not bound to a workspace · workspace has no approved claim · order not addressed to your identity |
| 400 | Missing `order_id` · invalid `status` |

## Notes
- The interactive equivalent is the **supplier portal** (`/supplier-portal`) — same data, same write-backs, for humans.
- Backed by service-role RPCs `get_supplier_inbound_orders_svc` / `supplier_update_inbound_order_svc` (the api-key is the auth; the claimed-identity gate is enforced in-RPC).
- Related: [docs/sourcing-fulfillment.md](sourcing-fulfillment.md), #247, #237.
