# Notes

Notes is one content type. A Vessel places an instance inside a Fleet. A Portal
places an instance across its Voyage. Content identity, placement and the
selected Markdown file are separate.

The Rust application owner reads and writes ordinary UTF-8 Markdown in the
owning Voyage's `notes/` directory. Home uses the content's own working
directory. New chooses a non-overwriting filename. Open selects an existing
Markdown file. The first level-one heading supplies the title. Without one,
the filename stem is the displayed title and the entire file is the body.
Changing the title does not rename the file. Filesystem permissions and errors
are reported by the owner. A revision describes the actual file bytes. An
external change can reject a save and leaves the local draft intact; this is not
an atomic comparison against another editor.

An existing JSON-backed instance can be deliberately converted to a new
Markdown file. Conversion leaves the original JSON as a backup. A refused or
unconfirmed conversion is not repeated automatically. Inspect the result and
workspace binding before another deliberate action. Conversion requires an
identified owner and does not guess a directory.

`main.ts` is the checked shipped source; `main.js` is its emitted, editable native
package entry. The restricted script calls its retained SessionState and does
not receive general filesystem access. Rust retains the native title/body draft,
base revision, focus and save bookkeeping across supported source replacement.
Preview uses the same retained body. A broken source edit retains the previous
usable version where supported. Personal package source is seeded once and is
never implicitly overwritten.

The administrator and view use the same typed content operations and captured
content identity. List, New, Open, Convert, Inspect and Update retain request and
target identity. New, Open and Convert also require the original workspace
version. A selected filename is workspace configuration, not a second copy of
its contents. A lost confirmation is uncertain and is not automatically replayed.
The host binds callers outside their payloads. Retired views cannot initiate
new work, although previously accepted effects may still complete.

Run the repository's strict Notes TypeScript generation and tests when changing
this package. Native interaction, external edits, migration and application
lifecycle require their own real-application evidence; this guide does not claim
those journeys have passed.
