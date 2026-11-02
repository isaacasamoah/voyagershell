# Native terminal candidate

Herdr Core owns the shell process and canonical terminal state. Voyager stores a
Core terminal address on a content instance, separate from its placement. Its
single framed Core connection carries RPC, viewer data, input, focus and credit.
Closing a viewer sends CLOSE; it does not stop the terminal. Closing the app
closes its connection, not the Core server.

Before requesting a new terminal, the application saves an operation identity
in the versioned workspace document and supplies the same identity as a Core
terminal label. A known refusal clears the marker through a confirmed document
write. An uncertain start or a failed subsequent layout save retains the marker
and reports the address or label for inspection. The app does not repeat the
start automatically, including after reopening the profile.

A confirmed marker-save refusal occurs before any terminal start and remains a
known refusal. If Core has already started and saved a terminal but refuses its
attachment, the response retains that refusal and the actual terminal address.
An attachment transport failure remains unconfirmed. The view retries a known
refusal only after an explicit Refresh has obtained a fresh workspace snapshot;
it does not use Refresh to replay an uncertain start.

The generated terminal request carries a request ID, content ID and expected
workspace revision. The response returns both identities and a typed applied,
rejected or uncertain outcome. This separate request is needed because an
applied attachment yields a native viewer retained by Rust, not a serializable
layout value. The application retains the latest 32 terminal requests and their
outcomes in memory. An identical request returns its retained outcome; the same
identity with changed fields is refused. That bounded memory is not durable
deduplication; the saved pending-start marker is the restart guard. After each
successful open, the UI inspects the current layout before another workspace
effect so that both pending and binding saves are reflected in its revision.

An old successful receipt can outlive the viewer it originally attached. Before
replacing a native viewer, the host checks the returned channel while holding
the viewer-map lock. An expired channel cannot close a newer viewer. The host
reports that the original attachment applied but subsequently expired; it does
not reattach or repeat that request. Repeating a receipt for the still-current
open channel keeps the viewer in place.

The viewer uses libghostty-vt on the UI thread to interpret Core's VT stream.
It returns credit after parsing, not on receipt. The connection bounds buffered
output to 1 MiB per viewer and 16 MiB in aggregate, separately from the Core
frame limit. A dispatch parses at most 64 KiB in chunks of 4 KiB while checking
the 2 ms budget between chunks. One parse call cannot be preempted. Replies to
forwarded terminal queries are bounded and sent through the same viewer. The
current view does not render Kitty graphics and does not acknowledge them as
displayed. Core owns focus reports; Voyager sends the FOCUS frame once per
focus transition.

The grid candidate retains Ghostty's cell graphemes, colors, styles and cursor
state. Its measured monospace cell size and painted pane bounds determine the
local grid. A deferred resize queues Core RESIZE and display FACTS on the same
viewer; queue pressure retains the latest size for a nonblocking retry. The
existing 64 KiB and 2 ms limits govern VT parsing, not complete snapshot or
paint time. Ghostty's dirty-row flags and row identities retain unchanged cell
arrays and shared text across updates. A full snapshot is prepared before dirty
flags are cleared; presentation then reads the retained data. Blink, overline
and exact underline variants are not yet rendered.

Initial terminal colors and the eight named ANSI colors follow the existing
Electron reference. Faint text blends its foreground at the reference renderer's
50 percent opacity while preserving the cell background. Ghostty's cell color
queries resolve the stored foreground and background independently; Voyager
applies the inverse attribute after those queries. The cursor uses its reported
color, including the reference default.

The initial release demonstrated a shell's colored wide Unicode glyph in the
alternate screen, native window resize from 101 by 41 to 88 by 35, and the same
terminal address and numeric PID. That result remains bounded: it did not prove
all full-screen applications, a coding agent, selection, clipboard, IME, hidden
output, compositor timing, another platform or the complete terminal module.
Its proof-size gate remains held.

The continuation separates native stream/focus/resize mechanics in terminal.rs,
the VT screen and cache in terminal_screen.rs, presentation and pointer routing
in terminal_view.rs, and operating-system text composition in terminal_input.rs.
These are private native implementation modules behind the same registration
boundary. No application contract, process owner or terminal parser was added.

Selection uses Ghostty's tracked grid references and gesture operations. A
selection change updates the selected column ranges separately from the retained
cell arrays. The native background uses the reference selection color
#53506a88. Copy formats the selected terminal text with wrapping removed; paste
uses Ghostty's current bracketed-paste mode and sanitization. Linux uses
Ctrl+Shift+C and Ctrl+Shift+V, while macOS uses its Command key. Clipboard text
whose encoded form exceeds the existing 64 KiB terminal input limit is refused
before invoking the input callback. Bracketed-paste markers count toward that
limit. One accepted callback is not a claim of an atomic PTY write. Ctrl+C continues to be terminal input. Wheel input preserves fractional
scroll movement; typing returns the viewport to the current screen.

GPUI's native input handler retains a local UTF-16 composition preview and draws
it at the actual terminal cursor. The running program receives only committed UTF-8
text. Composition is limited to 64 KiB and one preview line, and candidate-window
positioning uses the same font shaping as the preview. Terminal output is not
an editable document: native replacement ranges refer to the active preview,
and committed text goes to the existing terminal input path. Blur cancels the
local preview. Operating-system IME activation and composition still require a
real input-method journey; reducer tests and Unicode keysyms cannot prove it.

Hidden terminal entities keep consuming the same bounded stream into their VT
state. Output no longer constructs cell arrays in the stream callback. The next
visible render snapshots the current screen, retaining unchanged rows. A pending
geometry change can finish its one resize snapshot, but hidden output does not
run a repeating snapshot or paint loop. Input and control retain their existing
separate bounded queues. This is a source mechanism, not a measured latency or
memory result.

Each continuing pump iteration explicitly suspends its foreground future once
before consuming another ready token. A queued token alone does not suspend an
async task. The one-shot yield wakes its continuation and returns Pending once;
it adds no idle polling or timer. Disconnect and completion return directly.
This gives the event loop an opportunity to handle input and frames, but actual
saturated-output responsiveness and latency still require native evidence.

The extended maintained terminal-grid journey is prepared for native selection,
copy/paste, continued hidden output, focused input in another Fleet, restored
input to the same terminal, and actual split sizing. It has not run against the
continuation source. The first corrective release remains pending independent
source review. Performance, native agent behavior, additional terminal styles,
complete lifecycle and platform acceptance remain open.

`app/core-schema.cjs` extracts the used terminal run and attach types from the
installed Core 0.1.16 schema, checking its SHA-256 before generating the Rust
schema. `cargo` generates the Rust types from that checked schema. The VT
binding uses [libghostty-rs at 8363442](https://github.com/Uzaaft/libghostty-rs/tree/83634421c232385f9fd7c61f454961341453d661),
which builds Ghostty's VT library and requires the matching Zig toolchain.
Core protocol behavior is based on
[Core e07c2a1](https://github.com/herdrdev/herdr-core/tree/e07c2a1bedd62cf4787ee026ee23ee79c7d95491).
