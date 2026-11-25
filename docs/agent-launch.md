# Create a worker Vessel

A worker Vessel is a terminal or a coding agent that you add to a Fleet. The
content chooser opens when you split a panel or choose content for an empty
Fleet. It lists Terminal,
each entry of your profile's `launches.json`, such as Codex and Claude, the
Agents view and each ready Vessel type. An entry whose program is not installed
shows its error. The Fleet plus and the terminal shortcuts create terminals.

The chooser has no native journey yet. The Agent Vessels row of the [feature
map](features.md) lists the Python journeys that cover it.

## Personal defaults

The app writes `launches.json` into your profile once, the first time it
starts with that profile. It never overwrites the file and never changes an
agent's own configuration. Edit the file to set entries, models, effort and
permissions, then reopen the chooser to read it again. The chooser shows the
current values, the file's path and any program that is not installed. A file
with an error shows that error. The app never starts a shell in place of a
worker you chose.

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

The outer object has `default` and `entries`. The default entry is listed first
in the chooser. It never makes inspecting, creating a Fleet or reopening start an
agent. A new profile's default is `terminal`. Permissions are `yolo`,
`workspace-write` or `read-only`. The last two ask for approval on request. The
file is limited to 8 KiB. Entry ids must be unique, and `default` must name one
of them.

An entry's `launch` has one of three kinds:

- `{"kind":"terminal"}` starts a shell.
- `{"kind":"program","argv":[...]}` runs that exact argument list.
- The `id` of a row of the agent table, such as `codex` or `claude`, builds the
  argument list from that row's template, as [Agent program
  table](#agent-program-table) describes.

A new profile's Claude entry is `{"kind":"claude"}`. Its row has no model,
effort or permission settings, so add any flags you want with a `program`
launch instead. Codex permission names are not translated into Claude's.
Settings apply to Vessels you create later. They never change a running program
or the permissions of the private conversation.

## Voyager's entry

An entry with the id `voyager` and a program launch sets the command Voyager
starts with, for example `{"kind":"program","argv":["claude","--model","claude-sonnet-5-5","--effort","low"]}`.
Without one, the app uses that command. The app adds `--session-id` or
`--resume`, `-n voyager`, its identity prompt, its focus hook and its reply hooks after the
entry's arguments. A `voyager` entry that is not a program launch refuses
Voyager's start and says so in the status line. The content chooser never
lists it. [Voyager's start](workspace.md#voyagers-start) describes the rest.

## One application and process owner

The chooser records its destination and workspace revision when it opens.
The Rust workspace owner validates the request and saves the concrete launch
only on the newly created terminal content. An unrelated pending Vessel ID
cannot acquire a later choice in the chooser. Any type other than `terminal` and
`agent` rejects a program launch.
The existing pending creation record retains that ID's accepted effective launch.
An absent launch means Terminal. Fresh inspection advertises eligibility only
while the stored choice matches. Starting checks that same record before it starts a
shell, so changing Codex to Terminal cannot put a shell in its place.
Native canvas creation and authorized scoped creation both record their exact
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
new permission to run it. Reopening a Client without the original new-creation
eligibility refuses an unbound worker. Existing bound backends reattach, and
loading a saved layout never grants another launch. Core's `keep` replacement
option stays off. Reported idle or done, a process exit and verified task
completion stay separate.

## Checks

Unit tests cover the argument lists and defaults, rereading the profile,
programs that are not installed and binding a launch to the exact new Vessel.
One test against a real Core covers the refusal for a missing program, the
refusal of a changed launch and that reopening never restarts a program. These
checks run on Linux only.

## Agent program table

`content/agent-programs.json` is the one table of coding agents. Each row has
an `id`, a display `name`, the `programs` that identify it by executable name,
an optional `icon` file, `seeded` and a `launch` template. `seeded` rows start
as entries of a new profile's `launches.json`. The template gives the base
`argv` and, for each setting the program takes, a default and the flags it adds:
`model` and `effort` carry `{model}` and `{effort}`, and `permissions` carries
one list of flags for each of `yolo`, `workspaceWrite` and `readOnly`. A row
without a template launches its first program name.

`app/src/agent_programs.rs` reads the table. The launch list, recognising an
agent in a terminal for the Bash wrapper, adoption, conversation naming and the
seeded settings all call it. The canvas reads the same file through the
`agent_programs` call of `voyager_workspace`.
`desktop/canvas/process-icons.ts` parses and validates it once, and the Agents view and the process icons look
programs up there. Adding an agent is one row, plus an icon file that
`desktop/src/shipped.rs` lists when the row names one. The gate
`agent-names-stay-in-adapters` scans only `.rs` and `.ts` source, so the table
holds the names and the code holds none. A unit test checks that every listed
program launches through Bash and names its conversation, and that the canvas
modules and the host read the table and keep no list of their own.

A launch entry has the kind `terminal`, `program` or the `id` of a table row, as
in `{"kind":"codex","model":"gpt-6.1-sol"}`. An entry of the third kind
resolves through the row's template to one argv, and a setting the row does not
take is refused. A Vessel created from such an entry has the type `agent` and
stores the resolved argv as a `program` launch, so its stored record is the
same shape a terminal that runs a program has. A layout stored before this change
may hold a Vessel with a launch of the third kind; reading the layout turns that
launch into the same `program` argv and leaves the Vessel's type as stored. A
launch whose kind the table no longer lists becomes a plain terminal launch. The
type `agent` takes only an agent entry, and an agent entry takes only the type
`agent`.

A profile's `launches.json` is seeded once and never rewritten, so a new table
row appears in the chooser only when the person adds an entry for it. The canvas
files follow the first-party update rules in `docs/content.md`. A canvas file the
person edited stays, and its update is written as a diff. An edited
`process-icons.js` next to an updated `agents.js` lacks the lookup the new view
imports. A program named `cursor`
starts inside interactive Bash and returns to a Bash prompt when it exits.

## Returning from an agent

The app launches a recognized agent inside an ordinary interactive Bash session, so you return to a Bash prompt when the agent exits. Recognition uses the selected command name before resolving installed symlinks, so a Claude launcher that points to `claude.exe` or another entry script still returns to Bash after exit. Resolved executable and model/effort/permission arguments are passed literally as separate positional arguments. Generic non-agent programs retain their direct launch path. This does not resume any previous agent conversation.
