#!/usr/bin/env bash
# ── Proving recipe — SURFACE 1: a whisper never LOOKS like a room message ───────
# THE user's ritual, automated. An LLM drives the REAL app through the chh browser
# bench with TWO accounts (isaacasamoah + elisheya) in one fambam room on dev,
# magic-link auth. (1) prints the exact ritual runbook the LLM driver follows,
# then (2) runs the DETERMINISTIC DB assertions that back it. Unit tests
# (feed.test.ts, public-reply.test.ts) support this — they never replace it.
# Emits ASIDE_PRIVACY_RENDER_BENCH_OK.
#
# Modes:
#   • Runbook (default, no session id): prints the ritual + assertion contract and
#     exits 2 (needs driving) — this is a browser bench, not a headless unit test.
#   • Assertion (deterministic backbone): set ASIDE_BENCH_SESSION_ID to the fambam
#     room's session/conversation id AFTER the ritual has driven, with a readable
#     ~/.supabase/access-token. Verifies the DB state and emits the marker.
#
# NOTE (finding F8): the verifier's browser driver is absent, so the LLM Test-gate
# driver runs the runbook by hand and then re-runs this in assertion mode.
set -euo pipefail
cd "$(dirname "$0")/.."

SESSION_ID="${ASIDE_BENCH_SESSION_ID:-}"
TOKEN_FILE="${SUPABASE_ACCESS_TOKEN_FILE:-$HOME/.supabase/access-token}"
PROJECT_REF="${SUPABASE_PROJECT_REF:-iesprdzzgjypnksoljym}"

print_runbook() {
  cat <<'RUNBOOK'
── ASIDE PRIVACY — two-account fambam ritual (LLM driver via chh) ──────────────
Setup: two magic-link accounts (A=isaacasamoah + B=elisheya) join ONE fambam room
on dev. Name A's voyager "wren" (composer: "call you wren"). Keep BOTH panes open.

1. WHISPER (A → own voyager). Account A types:  @wren how do I say this gently?
   ASSERT (A's pane): the whisper bubble carries the quiet mint 🔒 "private to
   you" marker — it does NOT look like an ordinary room line.
   ASSERT (B's pane): the whisper appears NOWHERE — B never receives it.

2. THE REPLY (Wren answers the whisper). Wait for Wren's reply on A's pane.
   ASSERT (A's pane): the REPLY bubble ALSO carries the 🔒 "private to you" marker
   (this is the gap the POC closed — the reply used to render as a room line).
   ASSERT (B's pane): the reply appears NOWHERE.

3. CONTRAST (A → the room, plainly). Account A types:  morning everyone
   ASSERT: this room line carries NO private marker on either pane; B sees it.

Then re-run with ASIDE_BENCH_SESSION_ID=<the room's session id> to verify the
deterministic DB backbone and emit ASIDE_PRIVACY_RENDER_BENCH_OK.
────────────────────────────────────────────────────────────────────────────────
RUNBOOK
}

if [ -z "$SESSION_ID" ]; then
  print_runbook
  echo "aside-privacy-render-bench: no ASIDE_BENCH_SESSION_ID — drive the ritual, then re-run to assert." >&2
  exit 2
fi

[ -r "$TOKEN_FILE" ] || { echo "MISSING $TOKEN_FILE — cannot run the DB assertions" >&2; exit 2; }
ACCESS_TOKEN="$(cat "$TOKEN_FILE")"

q() { curl -sf -X POST "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query" \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d "{\"query\": $(printf '%s' "$1" | jq -Rs .)}"; }

fail() { echo "ASIDE_PRIVACY_RENDER_BENCH_FAIL: $1" >&2; exit 1; }
esc="${SESSION_ID//\'/\'\'}"

# ── Assertion 1 — BOTH halves of the aside carry source:'aside' ────────────────
# The whisper (role user) AND the reply (role assistant) must be source='aside'.
# If only one row carries the marker, the reply half rendered as a room line — the
# exact bug this job fixes.
both="$(q "
  SELECT
    count(*) FILTER (WHERE source_ref->>'role' = 'user')      AS whisper,
    count(*) FILTER (WHERE source_ref->>'role' = 'assistant') AS reply
  FROM public.knowledge_events e
  WHERE (e.metadata->>'session_id' = '$esc' OR e.source_ref->>'conversation_id' = '$esc')
    AND e.metadata->>'source' = 'aside';")"
whisper="$(printf '%s' "$both" | jq -r '.[0].whisper')"
reply="$(printf '%s' "$both" | jq -r '.[0].reply')"
[ "${whisper:-0}" -ge 1 ] 2>/dev/null || fail "no whisper marked source='aside' (SURFACE 1 whisper)"
[ "${reply:-0}"   -ge 1 ] 2>/dev/null || fail "the aside REPLY is not marked source='aside' — it would render as a room line (SURFACE 1 reply, the POC gap)"
echo "✓ SURFACE 1 — whisper($whisper) + reply($reply) both marked source='aside'"

# ── Assertion 2 — every aside stays participants=[asker], never fanned ─────────
leaked="$(q "
  SELECT count(*) AS n
  FROM public.knowledge_events e
  WHERE (e.metadata->>'session_id' = '$esc' OR e.source_ref->>'conversation_id' = '$esc')
    AND e.metadata->>'source' = 'aside'
    AND ( coalesce(array_length(e.participants, 1), 0) > 1
          OR EXISTS (SELECT 1 FROM public.message_deliveries d WHERE d.event_id = e.id) );" | jq -r '.[0].n')"
[ "${leaked:-1}" -eq 0 ] 2>/dev/null || fail "$leaked aside(s) widened past participants=[asker] or fanned out (privacy regression)"
echo "✓ privacy — asides stayed participants=[asker], never fanned"

echo "ASIDE_PRIVACY_RENDER_BENCH_OK"
