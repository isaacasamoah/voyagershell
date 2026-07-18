-- One handle per owner per kind — the invariant claimHandle()/getOwnVoyagerIdentity()
-- already ASSUME (lib/messaging/handles.ts reads the caller's single row of a kind
-- with .maybeSingle()), now enforced at the DB level.
--
-- Without it, two concurrent name_voyager calls both pass claimHandle's
-- check-then-act SELECT (each sees no existing row) and both INSERT distinct
-- kind='voyager' rows for one owner. The next getOwnVoyagerIdentity() then matches
-- two rows, .maybeSingle() errors, and the fail-closed read returns handle=''
-- — silently bricking that user's named asides until manual cleanup. This CAS at
-- the DB makes the second concurrent INSERT lose on 23505 instead.
ALTER TABLE public.handles
  ADD CONSTRAINT handles_owner_kind_unique UNIQUE (owner_user_id, kind);
