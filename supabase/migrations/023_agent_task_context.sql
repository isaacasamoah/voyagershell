-- Add context preservation columns to agent_tasks
-- Stores the original user query and conversation snapshot at spawn time
-- for accurate followup composition and pending context surfacing.

ALTER TABLE agent_tasks
  ADD COLUMN IF NOT EXISTS original_query TEXT,
  ADD COLUMN IF NOT EXISTS conversation_snapshot JSONB;

-- Index for pending context queries (used by loadPendingContext)
CREATE INDEX IF NOT EXISTS idx_agent_tasks_pending_context
  ON agent_tasks (conversation_id, status)
  WHERE status = 'complete';
