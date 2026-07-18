#!/usr/bin/env bash
# ── Proving recipe — SURFACE 2: sign-out is an affordance, never a message ──────
# Live evidence (2026-07-10): "Sign out" and bare email addresses typed into the
# composer landed in the family feed as room messages, because every composer
# submit goes to the Voyager with no auth gate. This bench proves a real sign-out
# affordance exists AND that using it creates NO message event. An LLM drives the
# REAL app via chh. Emits SIGNOUT_AFFORDANCE_BENCH_OK.
#
# Modes: runbook (default, no session id → print ritual, exit 2) · assertion (set
# SIGNOUT_BENCH_SESSION_ID after driving + readable ~/.supabase/access-token).
# NOTE (finding F8): verifier browser driver absent — LLM driver runs the runbook
# then re-runs in assertion mode.
set -euo pipefail
cd "$(dirname "$0")/.."

SESSION_ID="${SIGNOUT_BENCH_SESSION_ID:-}"
TOKEN_FILE="${SUPABASE_ACCESS_TOKEN_FILE:-$HOME/.supabase/access-token}"
PROJECT_REF="${SUPABASE_PROJECT_REF:-iesprdzzgjypnksoljym}"

print_runbook() {
  cat <<'RUNBOOK'
── SIGN-OUT AFFORDANCE — ritual (LLM driver via chh) ───────────────────────────
Setup: one magic-link account (A=isaacasamoah) in an active conversation on dev
(the header chrome is visible once you've typed at least once).

1. FIND THE AFFORDANCE. ASSERT: a real sign-out control is visible in the header
   chrome (account/avatar menu or button) — NOT a thing you have to type.

2. THE LEAK PROBE (adversarial, from the other side of the claim). BEFORE signing
   out, in the composer type exactly:  Sign out
   then send it. This is the exact string that leaked on 2026-07-10.
   ASSERT: whatever the app does with that TEXT, the real sign-out still only
   happens through the affordance in step 3 — note the room feed for later.

3. USE THE AFFORDANCE. Click the header sign-out control.
   ASSERT (browser): you are signed out (returned to the landing / magic-link
   screen). The CLICK created no chat bubble.

Then re-run with SIGNOUT_BENCH_SESSION_ID=<the session id> to assert the DB
backbone and emit SIGNOUT_AFFORDANCE_BENCH_OK.
────────────────────────────────────────────────────────────────────────────────
RUNBOOK
}

if [ -z "$SESSION_ID" ]; then
  print_runbook
  echo "signout-affordance-bench: no SIGNOUT_BENCH_SESSION_ID — drive the ritual, then re-run to assert." >&2
  exit 2
fi

[ -r "$TOKEN_FILE" ] || { echo "MISSING $TOKEN_FILE — cannot run the DB assertions" >&2; exit 2; }
ACCESS_TOKEN="$(cat "$TOKEN_FILE")"

q() { curl -sf -X POST "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query" \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d "{\"query\": $(printf '%s' "$1" | jq -Rs .)}"; }

fail() { echo "SIGNOUT_AFFORDANCE_BENCH_FAIL: $1" >&2; exit 1; }
esc="${SESSION_ID//\'/\'\'}"

# ── Assertion — the sign-out affordance emits NO persisted user turn ───────────
# The affordance calls supabase.auth.signOut() directly (client), never
# sendMessage — so clicking it writes ZERO knowledge_events. We assert no
# user-authored event in this session carries the sign-out signature (a bare
# "sign out" / "log out" / "sign me out"), which is what the composer path used to
# persist. (The step-2 leak probe is a KNOWN typed message; the claim is that the
# real sign-out in step 3 adds nothing — so the ONLY way this count is non-zero is
# a genuine affordance→message leak.)
leaked="$(q "
  SELECT count(*) AS n
  FROM public.knowledge_events e
  WHERE (e.metadata->>'session_id' = '$esc' OR e.source_ref->>'conversation_id' = '$esc')
    AND e.actor_type = 'user'
    AND lower(regexp_replace(coalesce(e.content,''), '[^a-z ]', '', 'gi')) ~ '(^| )(sign ?out|log ?out|sign me out)( |$)'
    AND e.created_at > now() - interval '10 minutes';" | jq -r '.[0].n')"
[ "${leaked:-1}" -eq 0 ] 2>/dev/null || fail "$leaked sign-out-shaped user message(s) persisted in the last 10 min — the affordance is still leaking into chat"
echo "✓ SURFACE 2 — the sign-out affordance created no persisted chat message"

echo "SIGNOUT_AFFORDANCE_BENCH_OK"
