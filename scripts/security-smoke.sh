#!/usr/bin/env bash
# Security smoke test (pentest #250) — validates the live fixes from outside.
# Usage: ANON_KEY=<supabase anon key> ./scripts/security-smoke.sh
# Exit non-zero if any check fails. DB-side checks (the guard, anon-exec matrix, RLS)
# live in check_security_invariants() / the SQL in this repo's notes — run those separately.
set -uo pipefail

MIVAA="${MIVAA_URL:-https://v1api.materialshub.gr}"
APP="${APP_URL:-https://app.materialshub.gr}"
SB="${SB_URL:-https://bgbavxtjlbvgplozizxu.supabase.co}"
ANON="${ANON_KEY:?set ANON_KEY}"
PASS=0; FAIL=0
ok(){ echo "  ✓ $1"; PASS=$((PASS+1)); }
bad(){ echo "  ✗ $1"; FAIL=$((FAIL+1)); }
code(){ curl -s -o /dev/null -w "%{http_code}" --max-time 25 "$@"; }

echo "── 1. MIVAA endpoints must reject anonymous callers (expect 401/403) ──"
for path in \
  "POST /api/internal/classify-images/x" \
  "POST /api/query/multimodal" \
  "POST /api/images/analyze" \
  "POST /api/segment/sam" \
  "GET  /api/admin/logs" \
  "POST /api/duplicates/merge" \
  "POST /api/v1/anthropic/test/claude-integration" ; do
  m="${path%% *}"; p="${path##* }"
  c=$(code -X "$m" "$MIVAA$p" -H 'content-type: application/json' -d '{}')
  { [ "$c" = "401" ] || [ "$c" = "403" ]; } && ok "$m $p → $c" || bad "$m $p → $c (expected 401/403)"
done

echo "── 2. Public-by-design still reachable (expect 200) ──"
c=$(code "$MIVAA/health"); [ "$c" = "200" ] && ok "/health → 200" || bad "/health → $c"

echo "── 3. App security headers ──"
H=$(curl -sI --max-time 25 "$APP")
echo "$H" | grep -qi "content-security-policy-report-only" && ok "CSP report-only present" || bad "CSP header missing"
echo "$H" | grep -qi "x-frame-options: *DENY" && ok "X-Frame-Options: DENY" || bad "X-Frame-Options missing"
echo "$H" | grep -qi "strict-transport-security" && ok "HSTS present" || bad "HSTS missing"

echo "── 4. CORS: wildcard origin must NOT be credentialed (A2) ──"
CH=$(curl -sI --max-time 25 -H "Origin: https://evil.example" "$MIVAA/health")
if echo "$CH" | grep -qi "access-control-allow-credentials: *true"; then bad "ACA-Credentials:true with wildcard"; else ok "no credentialed wildcard"; fi

echo "── 5. anon cannot call revoked SECURITY DEFINER functions (expect 42501) ──"
# NOTE: PostgREST only reaches the EXECUTE permission check when the body matches the
# function signature — so pass each function's real params (a fake uuid is fine; the
# permission denial happens BEFORE the body runs, so no mutation occurs). The authoritative
# check is `has_function_privilege('anon', <fn>, 'EXECUTE')` in SQL.
declare -A BODIES=(
  [increment_flow_run_stats]='{"p_flow_id":"00000000-0000-0000-0000-000000000000"}'
  [should_trigger_alert]='{"p_alert_id":"00000000-0000-0000-0000-000000000000","p_old_price":1,"p_new_price":2}'
  [resolve_brand_company]='{"p_workspace_id":"00000000-0000-0000-0000-000000000000","p_name":"x"}'
  [workspace_quota]='{"p_workspace_id":"00000000-0000-0000-0000-000000000000","p_key":"x"}'
  [get_cron_run_history]='{"p_jobname":"x","p_limit":5}'
  [tenant_purity_audit]='{}'
  [storage_orphan_summary]='{}'
)
for fn in "${!BODIES[@]}"; do
  r=$(curl -s --max-time 25 -X POST "$SB/rest/v1/rpc/$fn" -H "apikey: $ANON" -H "authorization: Bearer $ANON" -H 'content-type: application/json' -d "${BODIES[$fn]}")
  echo "$r" | grep -q "42501\|permission denied" && ok "anon denied: $fn" || bad "anon NOT denied: $fn → ${r:0:80}"
done

echo "── 6. anon reads on tenant tables return no cross-tenant rows ──"
for t in messaging_channels messaging_logs tracked_queries crm_companies; do
  r=$(curl -s --max-time 25 "$SB/rest/v1/$t?select=id&limit=3" -H "apikey: $ANON" -H "authorization: Bearer $ANON")
  { [ "$r" = "[]" ] || echo "$r" | grep -qi "permission denied\|42501"; } && ok "anon sees nothing on $t" || bad "anon read leaked on $t → ${r:0:80}"
done

echo "── 7. Webhooks fail closed without a valid signature (expect 401/403/503) ──"
for wh in email-webhooks zernio-webhook-handler; do
  c=$(code -X POST "$SB/functions/v1/$wh" -H "apikey: $ANON" -H 'content-type: application/json' -d '{}')
  { [ "$c" = "401" ] || [ "$c" = "403" ] || [ "$c" = "503" ]; } && ok "$wh → $c" || bad "$wh → $c (expected 401/403/503)"
done

echo ""
echo "════ RESULT: $PASS passed, $FAIL failed ════"
exit $((FAIL > 0 ? 1 : 0))
