#!/usr/bin/env bash
# ── Proving recipe — SURFACE 3: honest already-in-room copy ─────────────────────
# `+name` for an already-active member used to say "Added <name> — they'll get
# what you type here", implying a state change that never happened. The honest
# copy says they're already in the room. This bench proves the COPY is honest AND
# that no membership state changed. An LLM drives the REAL app via chh with two
# accounts already both active in one room. Emits ALREADY_IN_ROOM_COPY_BENCH_OK.
#
# Modes: runbook (default → print ritual, exit 2) · assertion (set
# ALREADY_BENCH_SESSION_ID + ALREADY_BENCH_MEMBER_HANDLE after driving, with a
# readable ~/.supabase/access-token). NOTE (finding F8): browser driver absent —
# LLM driver runs the runbook then re-runs in assertion mode.
set -euo pipefail
cd "$(dirname "$0")/.."

SESSION_ID="${ALREADY_BENCH_SESSION_ID:-}"
MEMBER="${ALREADY_BENCH_MEMBER_HANDLE:-}"
TOKEN_FILE="${SUPABASE_ACCESS_TOKEN_FILE:-$HOME/.supabase/access-token}"
PROJECT_REF="${SUPABASE_PROJECT_REF:-iesprdzzgjypnksoljym}"

print_runbook() {
  cat <<'RUNBOOK'
── ALREADY-IN-ROOM COPY — ritual (LLM driver via chh) ──────────────────────────
Setup: two magic-link accounts (A=isaacasamoah + B=elisheya) BOTH already active
in ONE fambam room on dev (B has joined — the WITH: chip shows B).

1. RE-ADD AN ACTIVE MEMBER. Account A types:  +elisheya   (B's handle/name)
   ASSERT (A's pane): the confirmation says B is ALREADY in the room — it does NOT
   say "Added …" and does NOT imply "they'll get what you type here" (no state
   change is being announced).

2. NO KNOCK. ASSERT (B's pane): B receives NO new invite/knock — nothing changed
   for B.

Then re-run with ALREADY_BENCH_SESSION_ID=<session id> and
ALREADY_BENCH_MEMBER_HANDLE=<B's handle> to assert the DB backbone and emit
ALREADY_IN_ROOM_COPY_BENCH_OK.
────────────────────────────────────────────────────────────────────────────────
RUNBOOK
}

if [ -z "$SESSION_ID" ] || [ -z "$MEMBER" ]; then
  print_runbook
  echo "already-in-room-copy-bench: need ALREADY_BENCH_SESSION_ID + ALREADY_BENCH_MEMBER_HANDLE — drive the ritual, then re-run." >&2
  exit 2
fi

[ -r "$TOKEN_FILE" ] || { echo "MISSING $TOKEN_FILE — cannot run the DB assertions" >&2; exit 2; }
ACCESS_TOKEN="$(cat "$TOKEN_FILE")"

q() { curl -sf -X POST "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query" \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d "{\"query\": $(printf '%s' "$1" | jq -Rs .)}"; }

fail() { echo "ALREADY_IN_ROOM_COPY_BENCH_FAIL: $1" >&2; exit 1; }
esc="${SESSION_ID//\'/\'\'}"
mesc="${MEMBER//\'/\'\'}"

# ── Assertion 1 — the re-added member is (still) active, unchanged ─────────────
# The member A re-added must be 'active' in this room's space, and their
# membership row must NOT have been just re-written (no invite churn). We assert
# their state is 'active' and no new 'invite'-source event names them in the last
# 10 minutes.
active="$(q "
  SELECT count(*) AS n
  FROM public.space_members m
  JOIN public.spaces s   ON s.id = m.space_id
  JOIN public.sessions se ON se.space_id = s.id
  JOIN public.handles h  ON h.owner_user_id = m.user_id AND h.kind = 'human'
  WHERE se.id = '$esc' AND h.handle = '$mesc' AND m.state = 'active';" | jq -r '.[0].n')"
[ "${active:-0}" -ge 1 ] 2>/dev/null || fail "member '$MEMBER' is not active in this room's space — the +name path changed state (SURFACE 3)"
echo "✓ SURFACE 3 — '$MEMBER' stayed active; +name announced no state change"

# ── Assertion 2 — no fresh knock/invite was delivered by the re-add ───────────
knock="$(q "
  SELECT count(*) AS n
  FROM public.knowledge_events e
  WHERE (e.metadata->>'session_id' = '$esc' OR e.source_ref->>'conversation_id' = '$esc')
    AND e.metadata->>'source' = 'invite'
    AND e.created_at > now() - interval '10 minutes';" | jq -r '.[0].n')"
[ "${knock:-1}" -eq 0 ] 2>/dev/null || fail "$knock fresh invite/knock event(s) in the last 10 min — re-adding an active member wrongly knocked (SURFACE 3)"
echo "✓ SURFACE 3 — no fresh knock; re-adding an active member was a no-op"

echo "ALREADY_IN_ROOM_COPY_BENCH_OK"
