# Native SDK patch

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
