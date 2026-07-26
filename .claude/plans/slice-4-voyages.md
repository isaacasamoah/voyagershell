# Slice 4 Voyages — Historical Outcome

**Status:** Closed and superseded as an implementation plan.

## Durable outcome

Voyages remain Voyager's shared collaboration scope. Their durable intent is
membership-bound access, shared context, and server-authoritative isolation
between personal, voyage, and room activity.

This record does not define current interfaces, routes, UI, database work, or
delivery criteria.

## Current sources of truth

- [README.md](../../README.md) describes the current product and repository.
- [ARCHITECTURE.md](../../ARCHITECTURE.md) owns the current system boundaries.
- [Direct voyage modules](../../lib/voyage/) own voyage behavior.
- [Existing voyage API routes](../../app/api/voyages/) expose the current HTTP
  surface.
- [The session authority module](../../lib/conversation/session-authority.ts)
  is the application boundary for the database-owned session RPCs.

Current session authority represents scope with `voyage_id` and `space_id`
through that RPC-owned boundary, rather than the retired community-scoped
column.

## Historical sketches

[slice-4-voyages-flows.md](slice-4-voyages-flows.md) preserves early
interaction sketches only. It is historical design material, not a description
of the current UI or a promise of future work.
