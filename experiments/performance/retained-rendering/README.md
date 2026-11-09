# Retained rendering experiment

This experiment tests whether the original animated Voyager avatar can update independently of the cached workspace. The existing avatar-redraw probe and coordinator supply measurements. Their earlier relocation stayed inside the outer cached Header and showed no useful gain.

The SDK patch applies to GPUI Kit revision `944803984cf0ba3111861d6e1aa9d6265c109ff9`. It adds one optional native view to ShellRoot, after cached application content and before sheets and dialogs. The existing avatar controller and view use that slot. The SDK owns ordering; Voyager owns avatar policy, geometry, motion and sound.

Use a separately owned checkout of that exact SDK revision. Do not edit installed dependency checkouts. Override the SDK packages coherently, including gpui-base, and verify that the resolved graph contains one shared instance of each enabled SDK package. A shell-only override can split theme/input globals between different Base packages. Keep the explicit Cargo override and complete source/lock identity with each run.

The patch is an experimental dependency change, not an accepted distributed dependency setup. Keep its eventual maintained pin separate from measured CPU evidence. Existing project specifications, UX references, release-build requirements, native proving fixture and complete proof-size limits still apply. A faster build that changes animation, input, docking or overlay order fails.

The single foundation walkthrough records trial results, source identities, failed attempts and unresolved checks. No performance result is claimed by this source patch alone.

## Terminal background follow-up

The separate background patch tests drawing one default fill per row. It omits redundant default cell fills only before the first painted text in a row, including entirely blank rows. After text appears, it retains every later cell background in the original order. That preserves the old coverage of italic/fallback glyph ink extending into later columns without guessing glyph bounds or adding clipping. Explicit nondefault, selection and cursor backgrounds keep their existing order and colours.

These app patches target the recorded in-progress foundation source, not arbitrary main revisions. Preserve the complete source identity and apply the native-avatar patch only with the matching SDK extension. The existing diagnostic probe is separate from the product patches. The initial less conservative background artifact was not trialled; its source-review finding remains part of the experiment record.
