# Release design (P6) resume point

Status: the design is written and reported. Nothing was built, and no PR was opened.

## Where things are

- The design page is `explainer/design/release-and-daily-start.html` in the project's Obsidian folder. It is the source of truth, and these notes only point to it.
- The probe is `experiments/release-design/flip-probe.sh`, commit 55607fb3, "Probe that a build started through a flipped symlink keeps running". Run it with an empty folder as its argument, with the Core variables cleared. It showed two things. A process started through `current/` keeps running after `current` is flipped and after its folder is moved. Its `/proc/<pid>/exe` resolves to `builds/<v>/`, not `current/`.
- Read at VoyagerShell main 2c06d92a, Herdr Core c84d6e76 and Herdr App b67715e8.

## The design in brief

- Each build has its own folder under `~/.local/share/voyagershell/builds/`. The `current`, `previous` and `next` symlinks are the whole update record, and `start.json` holds the profile and session.
- `voyager update` only stages a verified build as `next`. `voyager start` is the one place that flips. If the new build exits before it is ready, start flips back. If it hangs, start reports the outcome as uncertain and launches no second app.
- Core is never restarted or updated, so programs survive through the `quit-keeps-programs` invariant.
- Releases follow Herdr's prepare and publish steps. Prepare opens a release PR. Publish tags only after `checks` passes on that commit. The tag workflow builds linux-x86_64 and publishes a GitHub Release with `latest.json` uploaded last, behind a `release` environment that Isaac approves.

## Seven open questions for Isaac, with the recommendations

1. Words per publish. Recommend two: he runs publish, and he approves the release environment.
2. Download in the background, then offer Restart. Recommend yes, as Herdr does.
3. A second `voyager start` focuses the running window through a new focus-only control socket, about 2 h. Recommend yes.
4. Rollback across a stored-shape change. Recommend documenting it in the CHANGELOG only, for 0.1.
5. Branch builds. Recommend `voyager update --from <dir>` only, with no `start --from`.
6. Daily profile default. Recommend `~/.local/share/voyagershell-profile`, outside the install.
7. Voice for friends. Recommend leaving it to the settings design. It must still be answered before friends get voice.

## What S23a needs first

1. Isaac's answers to questions 3, 5 and 6, and his approval of the shape changes listed in section 5 of the page.
2. Make `launch::command_path()` (`app/src/launch.rs` 105-108) return `<install>/current/voyager` when the executable is in an install's `builds/` folder. The probe shows `current_exe()` resolves to the build's own folder.
3. Add `voyager-shell --version`, a profile lock, and a ready signal that start can wait on.
4. Then add `start`, `update --from` and `rollback` in `app/src/bin/voyager.rs`, and the daily-start journey on VT5's second binary.

## Not checked

- Whether `hc connect` starts a Core server when none runs, and with which environment.
- The glibc floor of an `ubuntu-24.04` build.
- The text of plan requirement 16.
