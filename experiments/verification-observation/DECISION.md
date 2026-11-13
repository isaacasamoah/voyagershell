# Decision: how the verifier aims input and reads state

Status: prototype result, 13 November 2026. Throwaway code. Not for merge as is.

## Goal

Isaac wants a verification environment at least as reliable as the app. Today
the verifier clicks fixed offsets from the window origin and compares a fixed
crop. Any layout change breaks it without a product defect. This prototype
settles how the verifier should find elements and read state instead.

## What was built

Both candidates run inside the hermetic sandbox (`tests/native/src/sandbox.rs`)
in one journey, `--journey observation`, so they see the same app, layout and
noise.

- AT-SPI. The sandbox's private D-Bus session activates `at-spi-bus-launcher`
  on demand. The script sets `org.a11y.Status.IsEnabled` and walks the app's
  tree with `gi.repository.Atspi`, matching by role and name.
- Inspection endpoint. `desktop/src/inspect.rs` adds an `Inspect` marker
  component. It is an absolutely positioned `canvas` that records its parent's
  bounds during prepaint. When `VOYAGER_INSPECT=<path>` is set, a writer thread
  writes `{elements, state}` to that file at most every 16 ms when something
  changed. Without the variable the marker is an empty absolute `div` and no
  thread starts. Markers sit in the shared `action()` helper (Fleet tabs,
  Voyage rows, Vessel titles), `splitControl`, the sidebar toggle, the Notes
  menu item and the avatar. The avatar also reports its scope, dock size and
  position as state.
- Persistent X11. `tests/native/src/observation.rs` opens one `x11rb`
  connection to the sandbox display and times XTEST motion, press and release
  plus a round trip, and `GetImage` of the window. It times the current
  `xdotool` and `import` processes alongside.

Each run does the following. It creates a Notes Vessel by locating the first
Vessel's split button and the "Create Notes Vessel" item with the endpoint. It
locates the four targets ten times at 1450 by 940 with the sidebar open
(layout A). It resizes the window to 1180 by 820 and collapses the sidebar
(layout B), then locates them ten times again. It clicks the located split
button in layout B and confirms in Core's layout document that a Vessel was
added. Only then does it enable AT-SPI, locate the four targets ten times in
layout B, restore layout A, and locate them ten times again. Every AT-SPI box
is compared with the endpoint's box for the same element in the same state.

The four targets are the Fleet tab ("Fleet 1"), the first Vessel's "split
right" button, the Notes Vessel's title, and the avatar.

## Results

Ten sandbox runs, one after another, on 13 November 2026. All ten verifier
verdicts passed. `aggregate.py` prints the table below from the evidence
directories. Values are the median of per-run medians, with the range across
runs in brackets. All observed unless marked inferred.

| Question | Inspection endpoint | AT-SPI |
| --- | --- | --- |
| All four found, layout A (1450x940, sidebar open) | 10/10 runs, 10/10 lookups each | 7/10 runs (after restoring layout A) |
| All four found, layout B (1180x820, sidebar collapsed) | 10/10 | 10/10 |
| Same boxes as the other approach | Layout B 10/10. Layout A 7/10, the other 3 runs had no AT-SPI result. | Same |
| Located split button works after the change | 10/10. Clicking it and "Create Notes Vessel" added a Vessel in Core's layout. | Not exercised |
| Failures | 0 | 3/10 runs raised `atspi_error: Unknown object` while walking the tree during the resize back to layout A. The old Python fixture retried the same error. |
| One lookup of all four | 0.047 ms (0.021 to 0.065). File read and parse. | 28.4 ms (26.8 to 32.8). Full tree walk, about 50 nodes, from Python. |
| Time from layout change to stable boxes | 0.31 s (A to B), 0.35 s (B to A) | 0.35 s (B to A). Both approaches settle together, so the app's relayout bounds this, not the locator. |
| One-time activation | None | 0.095 s (0.092 to 0.107) to a populated tree |

The original fixed offsets stopped working. In every run, none of the four
layout-A centres fell inside the same element in layout B (0 of 4, 10/10 runs).

Persistent input and capture inside the sandbox work. `x11rb` connects to the
sandbox's Xvfb from inside bubblewrap (observed). Twenty samples per run:

| Action | Process per action (today) | One `x11rb` connection |
| --- | --- | --- |
| Pointer click | 104.4 ms (103.8 to 105.6) for `xdotool mousemove … click 1`. A bare `xdotool mousemove` takes 3.6 ms, so about 100 ms is xdotool's own click delay. | 0.16 ms (0.14 to 0.23) for XTEST motion, press, release and a `GetInputFocus` round trip |
| Verified key (`Native::key`: owner, title, focus checks, then the key) | 24.6 ms (22.8 to 28.7), five processes | Not built. Inferred well under 1 ms with property reads. |
| Window capture | 123 ms (93 to 181) for `import -window` to PNG, then decode | 17.1 ms (14.5 to 24.4) for `GetImage` of 1450x940, raw pixels, no PNG |

Neither column waits for the app to react. Both measure delivery to the X
server only.

Accessibility changes the app's rendering. The redraw probe's
`terminal_canvas_rows` was above zero in 10/10 runs while accessibility was
off and zero in 10/10 runs after AT-SPI activated, while `terminal_renders`
continued (1557 off, 1807 on). Burst CPU during 300 lines of terminal output
was 10.2 CPU-seconds per 4 s off and 9.8 on, with ranges that overlap and one
broken sample (0.18), so CPU shows no measurable difference here.

## What each approach can see

| | AT-SPI | Endpoint (prototype) |
| --- | --- | --- |
| Element bounds by name or role | Yes, for every element with a role and label | Only where a marker is placed |
| Stable identity | No. Labels repeat: three "Split Vessel right" buttons with three Vessels. The verifier must break ties by geometry or tree position. | Yes. Keys carry placement, Fleet and Voyage ids, for example `split-placement-3-right`. |
| Terminal grid text | No. The `terminal` node has no Text interface (observed). Core `terminal.read` already gives it. | No. Core `terminal.read` already gives it. |
| Notes text | No. "Note title" and "Note text" entries have no Text interface after typing (observed). | No, unless a marker reports it. The note is a file and Core content. |
| Avatar dock state | Name, description and bounds only | Scope (`workspace`, Voyage, Fleet, Vessel), floating, dragging, diameter, position (observed) |
| Removed elements | Disappear from the tree | Prototype keeps stale entries. The closed menu item and a startup "Refresh" action stayed in the file with an old `seenMs` (observed). |
| Effect on the app | Switches the app to its accessibility render path (see below) | None observed. Inferred to be one extra empty canvas per marker. |

## Why AT-SPI is the wrong default locator

When an AT client activates accessibility, GPUI's `window.is_a11y_active()`
becomes true. The app then stops caching the header content view
(`desktop/src/host.rs`), turns off terminal row painting
(`desktop/src/terminal_view.rs`) and invalidates Notes on every root change.
The redraw probe shows this in every run: `terminal_canvas_rows` counts appear
while accessibility is off and drop to zero after activation, while
`terminal_renders` continues. So an AT-SPI-driven journey verifies a render
path that users without assistive technology never run, and a performance
baseline taken under it is not the product's baseline.

## Recommendation

Use the inspection endpoint as the verifier's locator and state reader. Use
one persistent `x11rb` connection for input and capture. Keep AT-SPI as one
dedicated accessibility journey that checks roles and labels, not as the way
every journey aims input.

## Smallest production change for each option

Endpoint:

1. Promote `inspect.rs`. Gate it on an explicit `--inspect PATH` flag instead of
   an environment variable, so the tested binary is the shipped binary and the
   file is written only on request. It reads layout bounds and avatar state. It
   accepts no input and grants no authority.
2. Prune entries that were not prepainted in the latest frame (keep a frame
   generation, drop older entries at frame end). The prototype's stale entries
   make "is it gone" unanswerable.
3. Put the marker in the TypeScript sources (`main.ts`, `creation.ts`), export
   its declaration through `script_types`, and keep it in shared helpers so
   coverage follows new controls. The prototype edited the generated `.js` only.
4. Verifier: read the file, wait for a sequence newer than the action, match by
   key. No new dependency.

AT-SPI:

1. App: nothing for bounds. Unique labels or a Vessel-qualified label would be
   needed to avoid geometry tie-breaks. Text for terminal and Notes needs Text
   interface support in GPUI and gpui-kit inputs, which is upstream work.
2. Verifier: an AT-SPI client in Rust (`atspi` 0.29 and `zbus` are in the local
   registry; not built), enabling `IsEnabled` and walking the tree.
3. It cannot avoid the accessibility render path.

Persistent input and capture:

1. Add `x11rb` with `xtest` to `tests/native` (done here, offline build works).
2. Replace each `xdotool` and `import` call in `native.rs` with one connection:
   XTEST for input, `GetImage` for capture, `_NET_WM_PID` and `WM_NAME` reads
   for the per-action identity checks. Encode PNG only when evidence is saved.

## Limits of this evidence

- Sandbox is Xvfb with Mesa software rendering and no window manager. A real
  compositor was not tested.
- The host was shared with other builds. Load average ranged from 3 to 150
  during the session. A readiness timeout in `system.rs` was raised from 12 s
  to 45 s on this branch after two runs timed out before the journey started.
- The accessibility-off CPU sample always runs before the accessibility-on
  sample, so the CPU comparison is not alternated.
- AT-SPI lookups were timed in Python. Per-node D-Bus calls are inferred to
  dominate, so a Rust client is inferred to be similar. Not measured.
- Endpoint lookup time is a file read and JSON parse of about 2 KB. It does
  not include the wait for the app's next frame, which the settle numbers
  cover.

## Reproduce

```sh
python3 desktop/prepare-sdk.py
cargo build --release --locked -p voyager-desktop --bin voyager-shell
cargo build --manifest-path tests/native/Cargo.toml --offline
candidate="$PWD/target/release/voyager-shell"
tests/native/target/debug/voyager-verification run --journey observation \
  --script "$PWD/experiments/verification-observation/obs.py" \
  --binary "$candidate" --sha256 "$(sha256sum "$candidate" | cut -d' ' -f1)" \
  --hc-sha256 "$(sha256sum "$(command -v hc)" | cut -d' ' -f1)" \
  --assets "$PWD/desktop/assets" --evidence "$(mktemp -u -d /var/tmp/obs-XXXXXX)"
python3 -I experiments/verification-observation/aggregate.py EVIDENCE_DIRS...
```

`aggregate.py` first runs two negative controls: a shifted AT-SPI box must be
reported as a disagreement, and a missing endpoint lookup must not count as
found.
