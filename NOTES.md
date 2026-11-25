# Gated style edits

This branch holds the plain-style edits to `docs/voice.md`, `docs/layouts.md` and
`docs/arrangement.md`. They were taken out of the main style pass because the
feature map gate names journeys for them, and those journeys need a recorded run
before the edits can merge:

- `docs/voice.md` names `voice`, `voice-talk-over` and `voyager-command`.
- `docs/layouts.md` names `layouts` and `workspace-ux`.
- `docs/arrangement.md` names `arrangement`.

The edits are wording only. Before opening a pull request, rebase this branch on
main after the main style pass merges, so that only these three files and this
note differ.
