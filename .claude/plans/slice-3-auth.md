# Slice 3: Auth and Identity — Implemented State

**Status:** Implemented

This path began as a pre-implementation auth plan. The phased estimates and
missing-feature checklist were historical intent; they are not the current
work plan.

## Current truth

- Voyager uses passwordless magic-link authentication.
- The landing and inline email UI can request a link, show delivery and expiry
  states, and complete the signed-in transition.
- The server generates the magic link, the auth callback verifies either the
  callback code or token hash, and the completion page returns the user to the
  application.
- The auth provider owns client session state and sign-out. Middleware refreshes
  Supabase sessions.
- Protected API routes resolve the authenticated user through the shared auth
  boundary and reject unauthenticated requests. Conversation, chat, feed, room,
  voyage, sharing, and connection routes use the authenticated user identity
  rather than a placeholder user.

## Authorization shape

Authentication establishes who the caller is; each server boundary still
authorizes the requested operation.

- Session reads and mutations go through the typed canonical session RPC
  boundary in `lib/conversation/session-authority.ts`.
- Owned-session RPCs enforce session ownership and active voyage membership.
- Room mutations additionally require current effective room membership.
- A retained session space pointer is history, not room capability.
- Knowledge, messaging, voyage, and connection operations retain their own
  scoped authorization boundaries.

The server admin client is used for specific trusted server operations. It is
not a statement that the application bypasses RLS everywhere: access is
constrained by route authentication, narrow security-definer RPCs, table
privileges, RLS where applicable, and domain-specific checks.

## Deferred product work

The following items are intentionally separate from the implemented auth slice:

- first-run conversational onboarding;
- deeper personalization flows;
- subscription and billing;
- authentication methods beyond magic links.

These are not missing steps in the current auth implementation. Each requires a
new scoped brief before work begins.
