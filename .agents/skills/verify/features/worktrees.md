# Create and remove a worktree

## Sub-features

Right-clicking the row of a Voyage on a git repository offers New worktree.
Its dialog takes a branch name. Escape closes it and makes nothing. Enter
makes the branch, checks it out in the repository's `.worktrees` folder and
opens a selected Voyage in that checkout with one terminal Vessel. The
worktree Voyage's row offers Remove worktree. The app refuses the removal while
a live program uses the checkout and keeps the dialog open with the reason.
After the shell exits, removal deletes the checkout folder, keeps the branch,
closes the worktree Voyage and leaves the repository's Voyage open.

## How to get to it (user POV)

Open the isolated fixture app with the sidebar open. Make a folder a git
repository with one commit. `cd` the first shell into it and create a Voyage.
Right-click the new row, choose New worktree, press Escape, then choose it
again, type `demo/proof` and press Enter. Right-click the `demo-proof` row,
choose Remove worktree and confirm while its shell runs, then cancel. Type
`exit` in that shell, choose Remove worktree again and confirm.

## Driving it with the maintained fixture

Follow the exact doctor and run commands in ../SKILL.md with
`--journey worktrees`. The Rust journey in
tests/native/src/journey/worktrees.rs owns the recipe. The dialog belongs to
desktop/canvas/worktrees.ts, the Voyage row menu to
desktop/canvas/navigation-view.ts, and the Git calls and the live program
check to the app's worktree owner.

Before the first case the journey runs `git init` and one empty commit in the
fixture's second project folder, `cd`s the first shell there and creates that
folder's Voyage.

- `new-worktree-escape-cancels` opens the dialog with a context click on the
  repository's row and the `new-worktree` menu entry, waits for
  `worktree-confirm`, and presses Escape. The dialog must close, no Voyage
  must be born, and neither `.worktrees/demo-proof` nor the branch
  `demo/proof` may exist.
- `new-worktree-creates-checkout-and-voyage` opens the dialog again, types
  `demo/proof` and presses Enter. The dialog closes. The folder
  `.worktrees/demo-proof` exists and `git branch --show-current` there prints
  `demo/proof`. Exactly one Voyage is born, open and selected, with that folder
  as its directory and one Fleet holding one terminal Vessel in that folder.
  Its shell runs and its terminal is drawn.
- `remove-refused-while-shell-runs` (the control case) opens Remove worktree
  on the worktree's row and confirms while the worktree's shell runs. The
  dialog stays open and its `worktree-status` label names a live process in
  the checkout. The shell is the same running program, the folder and the
  branch stay, and the worktree's Voyage stays open. Cancel closes the dialog.
- `remove-after-shell-exit-keeps-branch` types `exit` in the worktree's shell.
  The Vessel closes, so the Fleet has no split tree. Remove worktree is then
  confirmed. The dialog closes, the worktree's Voyage is closed, the folder is
  gone, `refs/heads/demo/proof` still exists and the repository's Voyage stays
  open.

The journey needs the sidebar open and a window of at least 1180 by 1000.

## Negative control

tests/native/controls/worktrees.patch makes the canvas drop the reason from a
refused worktree action. A candidate built with it must fail
`remove-refused-while-shell-runs` on the expectation `the dialog stays open and
says a live process uses the checkout`, with the observed reason `The worktree
action was refused.`

## Gotchas

Open worktree, a dirty checkout, a branch name that Git refuses, an uncertain
Git result and a worktree Voyage reopened from Recent voyages are not driven.
The refused removal is driven with the worktree's own shell as the live
program. The journey reads Git and the folder from inside the sandbox, as the
Python `demo-feedback` journey did from outside it. No case compares pixels.
Linux evidence does not establish another platform.
