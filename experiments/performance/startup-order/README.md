# Paired viewer comparison support

A single-viewer trial cannot test whether starting another application changes typing response. The comparison needs both viewers to stay present while launch order and measurement order vary independently.

`fixture.patch` preserves the tested extension to the maintained native fixture. It does not change application or renderer behavior.

The extension:

- Starts a fresh Voyager and Herdr pair, then retains both until both typing observations finish.
- Balances launch order and measurement order across four pairs.
- Places both client windows at measured, non-overlapping positions on one fixed display.
- Checks retained application, Core, workload and connection-helper identities before and after each observation.
- Includes both viewers and their verified connection helpers in the resource roster.
- Preserves the user preview through the existing hide, graphics-quiet and exact-restore checks.

Window placement uses the existing stable-geometry helper and one measured compensation. The helper moves into the common native control module; the older avatar comparison imports it there. Connection helpers are identified by their actual Core executable, connection arguments and session environment, including when the `hc` command resolves to `herdr-core`.

The patch is archived against the fixture source in the ordinary experimental release whose binary SHA-256 begins `cbb0bc559f76695d`. Those foundation fixture prerequisites are not all present in this public stack. This record does not install a runnable fixture on its own. Apply it with `git apply --unidiff-zero` only against the matching source.

The archive was applied to its frozen four-file baseline and reproduced the current fixture bytes exactly. Validation includes 15 frame checks, 30 route checks, independent order/lifetime/identity/geometry controls and eight real native typing observations. Each observation verifies all twelve characters. Wrong-character, capture-clock and frame-sequence controls remain required.

The experiment uses a constructed dense terminal page and ordinary releases. It does not establish real-Codex performance, cold-start behavior, another operating system or completed foundation acceptance. Both scratch viewers use X11; the user's original Herdr viewer used Wayland. Raw measurements, profiles, screenshots, task plans and the maintained HTML explanation stay outside Git.
