# Native SDK and platform patches

`gpui-shell-native-overlay.patch` applies to GPUI Kit revision
`944803984cf0ba3111861d6e1aa9d6265c109ff9` from
[longbridge/gpui-kit](https://github.com/longbridge/gpui-kit).

It adds `ShellRoot::with_native_overlay(AnyView)`, an optional retained native
view after cached application content and before sheets/dialogs/tooltips.
Voyager uses it for the existing avatar. The SDK owns drawing order; Voyager
owns motion, placement, context, input and sound.

Run `python3 desktop/prepare-sdk.py` from the repository root. It prepares the
exact source and shared crate overrides. The upstream checkout retains its
licences and notices. No installed dependency checkout is modified or upstream
implementation copied into the application.

Keep this patch small. When upstream provides an equivalent interface, review
that version and replace the patch through the normal dependency update. This
local build integration does not publish an SDK fork or establish support on
untested platforms.

`gpui-linux-mailbox.patch` applies to the checksum-pinned gpui-pre-linux
0.3.10 crate. It requests the same Mailbox presentation preference as its
Wayland implementation. The renderer keeps its existing capability check
and FIFO fallback. It changes frame queueing without changing application
state, terminal cells or avatar animation.

The preparer verifies the source archive and applies the patch in a separate
digest-named cache. It preserves installed registry sources, modified prepared
source and unrelated Cargo configuration. Only the exact earlier generated
SDK-only or Mailbox-only configuration can migrate; `--check` requires the
current configuration. An edit detected when rechecking the configuration
before writing is refused.

This preference alone did not meet the loaded Herdr response goal. It is a
reviewable part of the ongoing native performance investigation, not an
accepted performance result or a release. Other platforms need separate proof.

`gpui-linux-monitor-clock.patch` selects the existing X11 refresh timer interval
from cached monitor rectangles in the window's X root. RandR screen, CRTC and
output events update the cache. Each timer uses the largest window intersection,
preferring the previous interval among equally overlapping modes and retaining
it when no monitor overlaps. Window moves take
effect by the next tick without display queries in the frame/input path.

This corrects selecting the first active monitor's rate for every window on a
mixed-refresh desktop. It preserves the existing hidden-window behavior and
adds no animation cap, process owner or application contract. Native mixed-rate
evidence belongs to its recorded integrated build; this publication branch and
the complete response goal keep their separate verification requirements.
