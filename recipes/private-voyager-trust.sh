#!/usr/bin/env bash
# Proof of concept: the owner-only execution gate, private persistence, and the
# explicit content-only promotion of a private reply into a human room message.
set -euo pipefail
cd "$(dirname "$0")/.."
npx vitest run \
  lib/messaging/address.test.ts \
  lib/messaging/two-account-bench.test.ts \
  lib/messaging/share.test.ts \
  lib/messaging/share-migration.test.ts \
  lib/messaging/feed.test.ts \
  lib/messaging/feed-server-state.test.ts \
  lib/messaging/room.test.ts \
  lib/messaging/invites.test.ts \
  lib/messaging/feed-types.test.ts \
  lib/messaging/handles.test.ts \
  components/chat/AssistantMessage.test.tsx \
  components/ui/hooks/useStreamingReply.test.ts \
  app/api/messages/share/route.test.ts \
  lib/harness/room-turn.test.ts \
  lib/harness/run-turn.test.ts \
  lib/knowledge/scope.test.ts \
  lib/retrieval/tools.background.test.ts \
  --reporter=dot

MIGRATION="supabase/migrations/053_atomic_private_reply_promotions.sql"
rg -q 'PRIMARY KEY \(source_event_id, sharer_user_id, destination_space_id\)' "$MIGRATION"
rg -q 'DEFERRABLE INITIALLY DEFERRED' "$MIGRATION"
rg -q 'ALTER TABLE public.private_reply_promotions ENABLE ROW LEVEL SECURITY' "$MIGRATION"
rg -q 'GRANT EXECUTE ON FUNCTION public.promote_private_voyager_reply\(UUID, UUID, UUID\) TO service_role' "$MIGRATION"
! rg -q 'CREATE POLICY' "$MIGRATION"
! rg -q 'createMessageEvent|fanOutDeliveries|getActiveMemberIds' lib/messaging/share.ts
! rg -q 'setShared\(' components/chat/AssistantMessage.tsx
! rg -q 'pickOwnVoyagerHandle|voyagerCustomName' lib components app
rg -q '^ROLLBACK;$' recipes/private-reply-promotion-proof.sql

echo "PRIVATE_VOYAGER_TRUST_GREEN"
