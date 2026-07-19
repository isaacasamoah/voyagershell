#!/usr/bin/env bash
# ── Proving recipe — the public voice, the user's ritual automated (cut ④) ─────
# THE PRIMARY TEST-GATE RECIPE. An LLM drives the REAL app through the chh browser
# bench with TWO accounts (isaacasamoah + elisheya) in one fambam room, dev
# magic-link auth. This script is the shell-runnable entry the browser adapter
# invokes: it (1) prints the exact ritual runbook the LLM driver follows, and
# (2) runs the DETERMINISTIC DB/trace assertions that back the ritual once it has
# driven. judge=llm is used only where interpretation is genuinely needed (does
# the reply draw on room context; did it land whole for the non-summoner). Unit
# tests (public-reply.test.ts, feed.test.ts, run-turn.test.ts) support this — they
# never replace it. Emits PUBLIC_VOICE_ROOM_BENCH_OK.
#
# Modes:
#   • Assertion mode (deterministic backbone): set PUBLIC_VOICE_BENCH_SESSION_ID
#     to the fambam room's session/conversation id AFTER the ritual has driven,
#     with a readable ~/.supabase/access-token. The recipe verifies the DB state
#     and emits the marker.
#   • Runbook mode (default, no session id): prints the ritual + the assertion
#     contract for the LLM driver and exits 2 (needs driving) — this is a browser
#     bench, not a headless unit test.
set -euo pipefail
cd "$(dirname "$0")/.."

SESSION_ID="${PUBLIC_VOICE_BENCH_SESSION_ID:-}"
TOKEN_FILE="${SUPABASE_ACCESS_TOKEN_FILE:-$HOME/.supabase/access-token}"
PROJECT_REF="${SUPABASE_PROJECT_REF:-iesprdzzgjypnksoljym}"

print_runbook() {
  cat <<'RUNBOOK'
── PUBLIC VOICE — two-account fambam ritual (LLM driver via chh) ───────────────
Setup: two magic-link accounts (isaacasamoah + elisheya) join ONE fambam room on
dev. Name Isaac's voyager "wren" (composer: "call you wren", confirm the naming
line). Keep BOTH browser panes open side by side.

1. PUBLIC SUMMON (A → the room). Account A types:  wren, <a question about
   something B just said in this room>
   ASSERT (both panes): the reply renders  WREN ✦ (Isaac's Voyager)  on A AND on
   B — B sees it LAND WHOLE (no live stream). judge=llm: the reply visibly draws
   on what B said (room context reached the owner's brain).

2. CROSS-OWNER SUMMON (B → A's voyager). Account B types:  wren, <question>
   ASSERT: same fan-out — both panes show the attributed WREN ✦ reply; it ran on
   Isaac's brain/identity (attribution is "Isaac's Voyager", not Elisheya's).

3. LOOP GUARD (hard rule). After Wren's public reply lands in B's feed, ASSERT no
   SECOND voyager turn fires — no voyager-authored event caused by a
   voyager-authored event (DB assertion below). Two named Voyagers never answer
   each other unbidden.

4. ASIDE PRIVACY REGRESSION. During the SAME session, Account A types:
   @wren <a whisper>
   ASSERT: it stays participants=[A] only — B's feed never receives it, and it is
   NOT fanned (DB assertion below).

Then re-run this recipe with PUBLIC_VOICE_BENCH_SESSION_ID=<the room's session id>
to verify the deterministic DB backbone and emit PUBLIC_VOICE_ROOM_BENCH_OK.
────────────────────────────────────────────────────────────────────────────────
RUNBOOK
}

if [ -z "$SESSION_ID" ]; then
  print_runbook
  echo "public-voice-room-bench: no PUBLIC_VOICE_BENCH_SESSION_ID — drive the ritual, then re-run to assert." >&2
  exit 2
fi

[ -r "$TOKEN_FILE" ] || { echo "MISSING $TOKEN_FILE — cannot run the DB assertions" >&2; exit 2; }
ACCESS_TOKEN="$(cat "$TOKEN_FILE")"

# `q <sql>` → one read-only statement, JSON result. -f makes curl fail on HTTP
# error so set -e catches transport failures; the token stays in the header only.
q() { curl -sf -X POST "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query" \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d "{\"query\": $(printf '%s' "$1" | jq -Rs .)}"; }

fail() { echo "PUBLIC_VOICE_ROOM_BENCH_FAIL: $1" >&2; exit 1; }

esc="${SESSION_ID//\'/\'\'}" # single-quote escape for SQL literal safety

# ── Assertion 1 — public fan-out under the OWNER, attributed (C1 + C2) ─────────
# At least one knowledge_events row in this session that is a voyager-authored
# `message` event whose participants span ≥2 members and carries a
# sender_display_name — the fanned public reply, persisted under the owner.
fanout="$(q "
  SELECT count(*) AS n
  FROM public.knowledge_events e
  WHERE (e.metadata->>'session_id' = '$esc' OR e.source_ref->>'conversation_id' = '$esc')
    AND e.event_type = 'message'
    AND e.actor_type = 'voyager'
    AND coalesce(array_length(e.participants, 1), 0) >= 2
    AND e.metadata->>'sender_display_name' IS NOT NULL;" | jq -r '.[0].n')"
[ "${fanout:-0}" -ge 1 ] 2>/dev/null || fail "no owner-anchored voyager message fanned to the room (C1/C2)"
echo "✓ C1/C2 — $fanout public voyager reply(ies) persisted under the owner, attributed, fanned to ≥2 members"

# ── Assertion 2 — every fanned reply has delivery rows to the non-owners ───────
# Each fanned voyager message must have ≥1 message_deliveries row (the others get
# the settled reply). Zero deliveries on a fanned message = the fan-out silently
# failed.
undelivered="$(q "
  SELECT count(*) AS n
  FROM public.knowledge_events e
  WHERE (e.metadata->>'session_id' = '$esc' OR e.source_ref->>'conversation_id' = '$esc')
    AND e.event_type = 'message' AND e.actor_type = 'voyager'
    AND coalesce(array_length(e.participants, 1), 0) >= 2
    AND NOT EXISTS (SELECT 1 FROM public.message_deliveries d WHERE d.event_id = e.id);" | jq -r '.[0].n')"
[ "${undelivered:-1}" -eq 0 ] 2>/dev/null || fail "$undelivered fanned voyager message(s) have NO delivery rows (fan-out did not reach the room)"
echo "✓ deliveries — every fanned voyager reply has recipient delivery rows"

# ── Assertion 3 — the loop guard: no voyager reply chained off a voyager reply ─
# The hard rule, code-attested in run-turn but asserted end-to-end here: NO
# voyager-authored `message` event may be immediately preceded (in this session)
# by another voyager-authored event with no intervening human turn. If two
# voyager messages sit back-to-back, one Voyager answered another unbidden.
chained="$(q "
  WITH ordered AS (
    SELECT e.created_at, e.actor_type,
           lag(e.actor_type) OVER (ORDER BY e.created_at, e.id) AS prev_actor
    FROM public.knowledge_events e
    WHERE (e.metadata->>'session_id' = '$esc' OR e.source_ref->>'conversation_id' = '$esc')
      AND e.event_type IN ('message','conversation')
  )
  SELECT count(*) AS n FROM ordered
  WHERE actor_type = 'voyager' AND prev_actor = 'voyager';" | jq -r '.[0].n')"
[ "${chained:-1}" -eq 0 ] 2>/dev/null || fail "loop guard BROKEN — $chained voyager event(s) followed another voyager event with no human turn between (C3)"
echo "✓ C3 — loop guard holds: no voyager reply chained off another voyager reply"

# ── Assertion 4 — aside privacy regression: @wren stays participants=[asker] ───
# Any aside in this session (metadata.source = 'aside') must be scoped to a single
# participant and never fanned (zero deliveries). A widened aside is the §6.5
# confidentiality regression.
leaked_aside="$(q "
  SELECT count(*) AS n
  FROM public.knowledge_events e
  WHERE (e.metadata->>'session_id' = '$esc' OR e.source_ref->>'conversation_id' = '$esc')
    AND e.metadata->>'source' = 'aside'
    AND ( coalesce(array_length(e.participants, 1), 0) > 1
          OR EXISTS (SELECT 1 FROM public.message_deliveries d WHERE d.event_id = e.id) );" | jq -r '.[0].n')"
[ "${leaked_aside:-1}" -eq 0 ] 2>/dev/null || fail "$leaked_aside aside(s) widened past participants=[asker] or fanned out (privacy regression)"
echo "✓ privacy — asides stayed participants=[asker], never fanned"

echo "PUBLIC_VOICE_ROOM_BENCH_OK"
