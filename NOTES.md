# Layouts guide: blocked

This branch holds a plain-style rewrite of `docs/layouts.md`. It is prose only:
no rule, declared invariant or behaviour changes.

The feature map gate names `layouts` and `workspace-ux` for the Layouts and
Home feature, and both are Python-only journeys with no native runner. A Python
journey is not run for this change. The branch waits for the Layouts and Home
gate to be retargeted to a native journey, which issue #413 tracks. When that
lands, rebase on main, run the journeys the gate then names, add the
`Journeys run:` line to the pull request description before the push that CI
reads, and delete this file.

The layouts guide stays as it is on main for release 0.1. This branch waits
until after 0.1.
