-- Voyage invites: authorization record for invite-as-magic-link flow.
-- URL carries routing intent (voyage slug), token_hash provides auth,
-- this table provides authorization (captain actually invited this email).

CREATE TABLE voyage_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voyage_id UUID NOT NULL REFERENCES voyages(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ
);

CREATE INDEX idx_voyage_invites_email ON voyage_invites(email, status);
CREATE INDEX idx_voyage_invites_voyage ON voyage_invites(voyage_id);
CREATE UNIQUE INDEX idx_voyage_invites_unique ON voyage_invites(voyage_id, email) WHERE status = 'pending';
