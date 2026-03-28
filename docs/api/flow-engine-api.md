# Flow Engine API

**Function:** `flow-engine`
**Base URL:** `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/flow-engine`
**Auth:** Authenticated users (JWT required)

Full documentation: [flow-engine.md](../flow-engine.md)

---

## Execute a flow

```
POST /functions/v1/flow-engine
{
  "action": "execute-flow",
  "flow_id": "uuid",
  "trigger_data": { "key": "value" }
}
```

## Test a flow (dry-run)

```
POST /functions/v1/flow-engine
{
  "action": "test-flow",
  "flow_id": "uuid",
  "trigger_data": { "key": "value" }
}
```

Returns resolved configs without firing real actions.

## Trigger by event type

```
POST /functions/v1/flow-engine
{
  "action": "trigger-event",
  "event_type": "quote.submitted",
  "event_data": { ... }
}
```

Dispatches all enabled flows listening for this `event_type`.

---

## Response

```json
{
  "success": true,
  "run_id": "uuid",
  "nodes_executed": 4,
  "duration_ms": 320,
  "result": { ... }
}
```

## Errors

| Status | Meaning |
|---|---|
| `400` | Missing `flow_id` or invalid action |
| `401` | Missing / invalid JWT |
| `404` | Flow not found |
| `500` | Execution error (check `error` field for failing node) |
