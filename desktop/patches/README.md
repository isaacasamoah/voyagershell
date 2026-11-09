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

`gpui-linux-mailbox.patch` and `gpui-linux-monitor-clock.patch` apply to the
checksum-pinned gpui-pre-linux 0.3.10 crate. The first requests the same Mailbox
presentation mode used by its Wayland implementation, with the renderer's
existing capability check and FIFO fallback. The second selects the existing
X11 timer's interval from the window's monitor, using cached RandR geometry
within the window's X root. It follows monitor changes without an animation
cap or display queries during frames.

The preparer verifies the registry archive, applies these patches in a separate
digest-named source cache and checks the complete prepared tree. It preserves
installed registry sources and unrelated build configuration. See
[terminal rendering](../../docs/terminal.md#native-presentation-preference) for
ownership and invariants. Measured performance, native UX and supported
platforms require their own recorded evidence.
