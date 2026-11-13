# Build constraints

Isaac requested this trial on 24 October 2026. Apply it to the next voice-handoff
build and the small git-graph trial.

## Effective tests

On 13 November 2026 Isaac removed the earlier limit on test and proving-code
lines. Shared verification code is maintained as its own product.

Every changed behavior needs a test that first fails for the missing behavior,
or a known-different comparison where a deterministic regression is unsuitable.
The independent reviewer must run a relevant mutation or equivalent negative
control. Passing tests without real application evidence do not complete a slice.

## One maintained application proving fixture

Use one curated native application runner with reusable actions and small feature
journeys. One runner need not mean one large file. Reuse launch, input, window,
output recording, identity checks and verified cleanup across modules. Do not
copy an entire runner for each specification or feature.

Drive the interactions a user performs. Service observations can corroborate
results but cannot replace UI actions in a user journey. Silent audio, decoded
audio and scheduled playback do not establish audible output. Simulated provider
fixtures remain useful for deterministic failures; they do not replace native
proof. Preserve the existing accepted journeys while consolidating duplicate
setup. Record any journey not yet carried into the common runner. Consolidate the
active module incrementally with parity evidence; do not expand this into an
unrelated rewrite of all historical tests. The standalone git-graph trial uses
its own real-Git/browser fixture until it becomes part of the application.

## Review size and completion

Keep each PR focused on a complete behavior. Inspect `git diff --numstat BASE...HEAD`
and `git diff --stat BASE...HEAD` before opening it. Target roughly 100 changed
lines; roughly 300 is reasonable for one behavior. As a PR approaches 1,000
changed lines, simplify it first. If it cannot shrink while retaining the required
behavior and minimal effective tests, use a native GitHub PR stack with separately
reviewable slices. Do not use Graphite. Verify current GitHub stack support and
the repository's merge rules before creating the stack.

For the approved voice run, each vertical slice receives a fresh-context review
using the code-review skill. It may have one corrective product build after that
review, followed by re-review. If Required issues remain, stop and report them.
Do not start a dependent slice or another corrective build. Finishing a task needs
its acceptance evidence and the project's Definition of Done. Merge and runtime
rollout still require their separately authorized scope.

## Existing checks and safeguards

Run `cargo fmt --check`, `cargo test --locked` and
`cargo clippy --locked --all-targets -- -D warnings` for Rust changes. Run
`npm run format:check` and `npm test` for
desktop changes. Build and run the selected candidate for native behavior.
The existing CI runs the ordinary Rust and desktop checks, not live microphone
or native desktop acceptance. Formatting and Clippy provide checks independent
of the tests written for a feature.

At review, inspect `git diff BASE...HEAD` for new suppression comments, skipped
or deleted tests, removed assertions, empty error handlers, unfinished stubs,
secrets and changes that weaken this file. Explain any legitimate removal and
prove its replacement behavior. Do not add exceptions to make a failing build
pass. Keep private evidence and account data outside Git.

The shared-fixture rule is enforced by recorded review, not by a claimed CI
coverage measure. A later automated check must preserve the same scope and must
not mistake file ownership for exercised behavior.
