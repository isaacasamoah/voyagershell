# Native proving fixture

The repository's `prove.py` is the single entry. Select one route explicitly:

- `--foundation` runs current native product journeys with this launcher and these helpers.
- `--reference` runs the retained Electron fixture.
- `--native-mod-host` uses this shared launcher with the historical native-content working directory and its retained header/Notes journeys.
- `--native-avatar` runs the original avatar experiment's own historical driver.

Root help lists the choices. Route help lists that driver's options:

```sh
python prove.py --help
python prove.py --foundation --help
python prove.py --reference --help
python -m unittest discover -s tests/native -p test_routes.py
```

The route/path checks do not launch an app, model, Core or desktop-input session.
Compile or inspect input scripts without importing them: the native input script
opens a desktop session when executed. Native journeys still require the actual
candidate binary, a unique session/profile/evidence path and serialized input.

The migrated helper source retains binary/profile/session, process/window and
input-target identity checks. Foundation app cwd is the repository root; legacy
native-content cwd remains experiments/native-content. Binary resolution retains
the existing caller-relative --binary behavior, so use an explicit binary path.
Moving source does not reaccept an old journey or prove the migrated native path.
Keep historical failures and separately gated product behavior in their existing
records. Root coordinates the next actual native verification.

`--foundation --journey feedback-ux` checks the reviewed rename, sidebar/chat,
voice-control placement and Portal-menu changes. `rename-typing` runs only its
rename comparison. Both use the same launcher, pointer and cleanup helpers.
Rename typing sends ordinary keys without Ctrl+A or a per-character delay.
The recorder reuses the actual Mutter capture stream and measured crop, writes
a bounded video, and records its decoded frame count. Its resampled 30 fps video
supports visual review; it does not measure input-to-paint latency. Preserve the
recorded monitor scale and window origin for a matched comparison. A capture on
another scaled monitor is not a pixel-matched result.

Use `--foundation --review --launch --compositor` with the same explicit binary,
session, evidence and desktop environment to leave a review app open. This mode
captures the window and closes its input helper. It retains the app and its
processes, records no passed journey, and marks `reviewOnly` in its receipt.

`--foundation --journey session-quit` uses a fresh dedicated session and profile.
It checks warm close/restore, normal Ctrl+Q detach, and deliberate reopening of
that same profile and Core session. The journey verifies the original Core and
shell PID/start identities, retained layout and fresh terminal output after
reopening. On the successful path it explicitly exits its fixture shell, verifies
no live fixture terminals remain, and stops only the dedicated Core. A failed or
uncertain journey records its last observations without replaying an effect.
It does not exercise private-provider conversation or voice.

The `notes-configuration` native journey still checks the former heading and
cold-Quit behavior. Its runtime acceptance is pending an update for the current
Notes and detach requirements. Passing route checks only confirms routing and
fixture source checks; it does not accept that journey.
