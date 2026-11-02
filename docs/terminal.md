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

The first candidate renders an 80 by 24 text grid. Styling, dynamic resizing,
full input and selection behavior, and performance remain later work and are
not implied by the initial shell journey. A successful build is not acceptance.

`app/core-schema.cjs` extracts the used terminal run and attach types from the
installed Core 0.1.16 schema, checking its SHA-256 before generating the Rust
schema. `cargo` generates the Rust types from that checked schema. The VT
binding uses [libghostty-rs at 8363442](https://github.com/Uzaaft/libghostty-rs/tree/83634421c232385f9fd7c61f454961341453d661),
which builds Ghostty's VT library and requires the matching Zig toolchain.
Core protocol behavior is based on
[Core e07c2a1](https://github.com/herdrdev/herdr-core/tree/e07c2a1bedd62cf4787ee026ee23ee79c7d95491).
