-- Add 'conversation' to valid_event_type CHECK constraint
-- Commit 8693090 changed chat turns from eventType 'message' to 'conversation'
-- to distinguish conversation turns (Cartographer enriches) from inter-user messages
-- (resolve_mention, skip Cartographer). The CHECK constraint was not updated.

ALTER TABLE knowledge_events DROP CONSTRAINT valid_event_type;

ALTER TABLE knowledge_events ADD CONSTRAINT valid_event_type CHECK (
  event_type = ANY (ARRAY[
    'conversation',
    'message',
    'document',
    'slack_message',
    'jira_update',
    'explicit',
    'quieted',
    'activated',
    'pinned',
    'unpinned',
    'importance_changed',
    'summary',
    'connection',
    'superseded'
  ])
);
