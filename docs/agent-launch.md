# Create a worker Vessel

The source candidate adds a compact Create Vessel picker to the existing pane
creation area and the collapsed sidebar rail. It offers installed Terminal,
Codex and configured program entries, including Claude when installed. Notes uses
the same creation flow when its actual content description is available. There
is no separate agent section. The ordinary Fleet plus and terminal shortcuts
still create terminals. Native picker/input evidence on this candidate is pending.

## Personal defaults

The application seeds `launches.json` once inside the selected personal profile.
It never overwrites an existing copy or changes global CLI configuration. Edit
that file to configure entries, models, effort and permissions, then reopen the
picker to read it again. The picker displays the current values, settings path
and unavailable executable errors. Broken settings report their error; no default
shell is silently substituted for a worker.

For example, a Codex entry can contain:

```json
{
  "id": "codex",
  "name": "Codex",
  "launch": {
    "kind": "codex",
    "model": "gpt-6.1-sol",
    "effort": "high",
    "permissions": "yolo"
  }
}
```

The outer object has `default` and `entries`. The default entry appears first in
the picker; it does not make inspection, Fleet creation or reopening start an
agent. Codex permissions are `yolo`, `workspace-write` or `read-only`. The latter
two use on-request approval. Settings are limited to 8 KiB and require unique
entry IDs and a real default entry. Each program launch uses an explicit argv
array. Claude's seeded entry is `{"kind":"program","argv":["claude"]}`.
Users can explicitly add its installed model/effort/permission flags to that
array. Codex permission names are not translated into Claude permission names.
Settings affect future deliberate creations, not existing programs or the
private administrator's permission profile.

## One application and process owner

The picker captures its destination and workspace revision when it opens.
The Rust workspace owner validates the request and saves the concrete launch
only on the newly created terminal content. An unrelated pending content ID
cannot acquire a later picker selection. Notes rejects a program launch.
The existing pending creation record retains that ID's accepted effective launch.
An absent launch means Terminal. Fresh inspection advertises eligibility only
while the stored choice matches. Starting checks that same record before the
legacy shell path, so changing Codex to Terminal cannot substitute a shell.
Native Header creation and authorized scoped creation both record their exact
confirmed new terminal. Inspect and reopening do not create permission.

The existing Client queue reads configuration away from render callbacks. It
retains the content owner and one physical Core connection. The typed
`Core::terminal_run_with` sends argv, cwd and the existing operation label.
Executable basenames are resolved to absolute paths with the already locked
`which` primitive, avoiding a Core template with the same name. There is no
concatenated shell command, keyboard-driven launcher or second agent service.
Codex uses `--no-daemon` so its worker remains within Core's process ownership.

The existing start marker, receipts, known refusal and uncertainty behavior stay
in the same owner. Missing executables retain the chosen launch with no backend.
An unconfirmed start is not repeated. A saved launch description does not grant
new permission to run it: reopening a Client without the original new-creation
eligibility refuses an unbound worker. Existing bound backends reattach, and
loading a saved layout never grants another launch. Core's `keep` replacement
option remains disabled. Reported idle/done, process exit and verified task
completion remain separate. This change does not import the old OSC status stack.

## Checks and limits

Installed metadata inspected on 3 November identifies Codex 0.166.0 and Claude
Code 2.1.261. Codex help supports the selected model/config/YOLO/no-daemon flags.
Claude help supports its own model, effort and permission-mode options. These
reads do not verify account access or successful work. There are no credential,
login, update, restore-session or account mutations.

Pure checks cover argv/defaults, profile reload, unavailable programs and exact
new-content binding. One isolated real-Core test covers missing-executable
refusal, changed-launch receipt refusal and no restart after reopening. A copied
UI mutation substituting a later revision fails the captured-target test. The
actual registered QuickJS picker root loads without a Window; that is constructor
evidence, not native menu delivery or focus.

The earlier launch continuation used two of its three corrective product builds.
Its corrective-1 native journey and corrective-2 incomplete answer remain
separate evidence. This source port grants no new allowance and does not replay
that request. A new integrated native creation/answer, matched appearance,
cleanup, remaining status requirements and complete proof accounting are still
required before acceptance. Linux source checks establish no other platform.
