# Arrange your VoyagerShell workspace with voyager

`voyager` is the agent command for VoyagerShell. Run it inside a Vessel, which
is a terminal that VoyagerShell shows. It covers workspace actions only:
inspect, create a Fleet, rename, move, remove a placement, select and, for
Voyager, dock and create a Fleet with a Vessel. Herdr Core owns programs and
terminals, so start, read, send to and stop programs with `hc` (`hc --skill`).
You can also add a Vessel type while the app runs ([Make a Vessel type](#make-a-vessel-type)).

A Voyage is a space. A Fleet is a tab in a Voyage. A Vessel is one piece of
content placed in a Fleet, or as a Portal across a Voyage.

## Find the command

`voyager --skill` begins with the full path of the command. VoyagerShell puts
that folder first on `PATH` for each terminal it starts. A program that you
start with `hc run` gets the environment of Core, not of your terminal, so
`voyager` may not be on its `PATH`. Run it by the full path there.

## Find where you are

```sh
voyager status
```

The reply names your Vessel, your Core terminal, the workspace `version` and
each of your placements with its Voyage and its Fleet or Portal owner. Use the
`version` as `expectedVersion` in your next change.

## Start a program as a Vessel

Start it with `hc run` and label it with the place it belongs:

```sh
hc run --bg --name fix --label voyager.place=fleet:<fleet id> claude "Fix the failing test in x.rs. Report with hc send $HC_TERMINAL_ID when done."
hc run --bg --name notes --label voyager.place=portal:<voyage id> bash
hc run --bg --name review --label voyager.place=fleet:<fleet id>:right:<placement id> claude "Review x.rs."
```

- `fleet:<fleet id>` places it in that Fleet. `portal:<voyage id>` places it
  as a Portal across that Voyage. Take the ids from `voyager status`.
- `fleet:<fleet id>:<side>:<placement id>` splits that placement of the Fleet
  and puts the program on the chosen side of it. `<side>` is `left`, `right`,
  `top` or `bottom`. The placement must belong to that Fleet. Ids hold only
  letters, digits, `.`, `_` and `-`, so a colon always separates the parts.
  Splitting does not resize anything. Only Voyager and the person resize.
- VoyagerShell adds the Vessel when Core reports the new terminal. A known
  agent program, such as `claude` or `codex`, shows as an agent Vessel. Any
  other program shows as a terminal Vessel.
- An invalid value, a side that is not one of the four, a placement that is
  not in the named Fleet, or a Fleet or Voyage that is not open, places nothing.
  VoyagerShell shows the reason in its status line. Start the program again
  with a corrected label.
- A terminal without the label stays hidden, as before.
- Every `hc run` rule still applies. A child ends with its parent unless you
  pass `--outlive-parent`.

## Read the dock

```sh
voyager focus
```

The reply is the generated `Focus` the app holds now. It has the dock's scope, its
path of names, its working directory and the workspace revision. It is open to
every Vessel and changes nothing.

```sh
voyager focus --hook claude
```

This form is for Claude Code's `UserPromptSubmit` hook. It prints the focus in
the hook output shape, so Claude sees the dock with every prompt and needs no
tool call. It always exits 0 and prints nothing when the app is not running,
the Vessel has no socket or the app does not answer within 200 ms, so it never
holds or blocks a prompt. It never writes the agent's configuration. Pass it at
launch with `--settings`, for example:

```sh
claude --settings '{"hooks":{"UserPromptSubmit":[{"hooks":[{"type":"command","command":"<full path>/voyager focus --hook claude"}]}]}}'
```

An app older than this request refuses it, and the hook then prints nothing.

## Carry a reply to the app

```sh
voyager reply --hook claude
```

This form is for Claude Code's `MessageDisplay`, `Stop` and `StopFailure`
hooks, which VoyagerShell passes to Voyager at launch with `--settings`. It
reads the hook's JSON from standard input, sends one `reply` request to the
Vessel socket, prints nothing and always exits 0. It gives up after 200 ms. The
app accepts the request only from Voyager's terminal and refuses it from any
other Vessel. An input from a subagent is ignored. [Voyager's
replies](workspace.md#voyagers-replies) describes how the app orders and closes
a turn.

## Spoken turns

A prompt that voice sends starts with the marker `[spoken]`, which
`spoken::prompt` adds and nothing else does. The marker stays in the prompt, so
the agent reads it. The agent's launch policy carries `spoken::policy_rule`. It
tells the agent that a prompt starting with the marker came by voice, to act
first, and to answer aloud in full, brief and plain, with no ids, paths or code, to
say the reason when something fails, to say only the gist of an answer that would pass about 100 words and offer more,
and never to point to the chat. The launch
that appends the rule is the Voyager start, which this guide does not describe.

The same launch tells Voyager that this is the app's background Voyager session,
that its reply marker is `[vy]` and that `[vy]` replaces any other reply marker
its instructions name. It asks Voyager to start every reply with `[vy]`, which
`spoken::reply_rule` words and `spoken::strip_reply_marker` removes. The launch
also sets `VOYAGER_BACKGROUND=1` in the `--settings` environment, so the user's
own instructions leave their personal reply prefix out of Voyager's replies.
Claude cannot read its own environment, so the identity states the same fact in
words. Claude Code ignores `--append-system-prompt` when it resumes a
conversation, and the earlier replies in that conversation carry the personal prefix, so the
focus hook output repeats `spoken::reply_rule`, `spoken::policy_rule` and the pointer to
`voyager --skill` at every prompt. A launch with no hook command path has no such
repeat, so a resumed Voyager conversation there keeps the personal prefix. The app strips
the marker where it stores a reply, so neither the speech filter nor the chat
note ever sees it.

The hook reads the prompt from the `UserPromptSubmit` input it receives on
stdin and waits at most 50 ms for it, inside the 200 ms deadline of the whole
hook. A prompt that has not arrived by then is treated as typed and the dock is
still printed. A prompt that starts
with the marker sends `{"command":"focus","spoken":true,"prompt":"<prompt id>"}`,
where the prompt id is the `prompt_id` that Claude puts on the same
`UserPromptSubmit` input and on every `MessageDisplay` and `Stop` input of that
prompt. A spoken prompt whose input has no `prompt_id` is sent as typed, and the
hook says so on standard error, because a mark that names no prompt could be
given to the wrong reply. Every other prompt, and an input the hook cannot read,
sends the plain focus request, so a typed Home prompt, a Core note and `voyager
focus` itself are never spoken. `spoken` and `prompt` are omitted when empty. An
app older than the fields refuses a spoken request, and the hook then prints
nothing for that prompt.

The app keeps one `spoken::TurnLedger` for its Vessel sockets. A focus request
with `spoken` true and a `prompt`, answered with the dock and sent from the
terminal that `voyager.json` names, adds that prompt id as a pending mark for
that Vessel. The ledger keeps at most 16 pending marks per Vessel and drops the
oldest first. `observe` gives a turn id it has not seen for that Vessel
`Kind::Spoken` when a pending mark names the same id, and `Kind::Typed`
otherwise. A turn is a prompt, so each reply is spoken only if its own prompt
was spoken, however many prompts were sent before the first reply. A typed
prompt between two spoken ones takes no mark, and a spoken prompt that never
produced a reply leaves a mark that no other turn can take. The verdict stays
with the turn id, so a late event never changes it. Marks are in memory, belong
to one Vessel and are dropped when its socket closes. Nothing is stored. A
spoken focus request from any other terminal sets no mark, and a spoken request
with no `prompt` sets none and is logged.

The hook runs before the model starts, so the mark is pending before the turn's
first event. The reply path calls `observe` through `Replies::accept_with` when
a turn's first text arrives, and when a `Stop` arrives for a turn that streamed
no text, so a spoken turn with no streamed reply still gets its verdict. Each
`Replies` turn carries it as `spoken`. Only the terminal that `voyager.json`
names can send replies, so a turn of any other Vessel is never spoken. A reply
hook input with no `prompt_id` is sent as `unreadable` and logged, and no turn
is spoken for it.

## Change the workspace

```sh
voyager do workspace '{"requestId":"crew-1","expectedVersion":"<version>","action":{"operation":"create-fleet","voyage":"<voyage id>","name":"Review"}}'
```

The offered operations are `inspect`, `create-fleet`, `rename`,
`move-voyage`, `move-fleet`, `move-placement`, `remove-placement`,
`select-voyage` and `select-fleet`. Any other operation is refused and nothing
is queued.

`dock` is offered only to Voyager, the Vessel whose terminal `voyager.json`
names in the profile. It takes `"context"` as the generated `Context` type and
works as a dock from the avatar does. It takes the user to the target, and a
Vessel target gets the keyboard unless a chat, a rename or a dialog is open.
`docs/workspace.md` describes how the canvas follows it.

```sh
voyager do workspace '{"requestId":"dock-1","expectedVersion":"<version>","action":{"operation":"dock","context":{"kind":"vessel","id":"<placement id>"}}}'
```

From any other Vessel it is refused with "dock is offered only to Voyager",
the exit code is 1 and nothing is queued.

`create-fleet-with-vessel` is offered only to Voyager too. It makes a Fleet
for the person with a first Vessel. That Vessel is a terminal running the named
`launch`, or the default terminal when none is named. Select the Voyage first, because the
request is refused unless its Voyage is the selected one on the Fleet view.
`cwd` is that Voyage's own `cwd` from the layout of an `inspect` reply, not any
directory. A Fleet for an agent stays `create-fleet`, which opens empty.

```sh
voyager do workspace '{"requestId":"fleet-1","expectedVersion":"<version>","action":{"operation":"create-fleet-with-vessel","voyage":"<voyage id>","name":"Review","source":{"kind":"voyage","voyageId":"<voyage id>","cwd":"<voyage cwd>"},"typeId":"terminal"}}'
```

`set-placement-maximized` and `resize-placement-split` are offered only to
Voyager too. `create-vessel` with a `beside` insertion in a Fleet is offered to
every Vessel, and without one only to Voyager. `create-vessel` adds a Vessel of the named `typeId` to a Fleet. Its
`destination` names the owner as `{"kind":"placement","owner":{"kind":"fleet","id":"<fleet id>"},"insertion":...}`.
`insertion` is `{"kind":"empty"}` for an empty Fleet, or
`{"kind":"beside","id":"<placement id>","side":"<side>"}` beside a placement.
The current Fleet is the one `voyager status` and the focus reply show. A
destination in the Portals is refused. An agent `launch` from a Vessel other
than Voyager that names no `permissions` starts the agent in its plain mode,
with the arguments a plain `hc run` of it would carry and no bypass flag. Name
`permissions` to get the matching row of the agent table. `set-placement-maximized` takes
`"id":"<placement id>"` and `"maximized":true` to maximize it, or `false` to
restore it. `resize-placement-split` takes the Fleet as `"owner":{"kind":"fleet","id":"<fleet id>"}`,
a `"path"` of `"first"` and `"second"` steps from the Fleet's root split to the
split to resize (an empty path is the root split), and `"share"`, the first
child's part of the split in ten-thousandths, from 1 to 9999. The app still
decides whether the target and the Fleet are valid, as it does for the avatar.

```sh
voyager do workspace '{"requestId":"vessel-1","expectedVersion":"<version>","action":{"operation":"create-vessel","typeId":"terminal","destination":{"kind":"placement","owner":{"kind":"fleet","id":"<fleet id>"},"insertion":{"kind":"empty"}}}}'
voyager do workspace '{"requestId":"max-1","expectedVersion":"<version>","action":{"operation":"set-placement-maximized","id":"<placement id>","maximized":true}}'
voyager do workspace '{"requestId":"resize-1","expectedVersion":"<version>","action":{"operation":"resize-placement-split","owner":{"kind":"fleet","id":"<fleet id>"},"path":[],"share":6000}}'
```

From any other Vessel each is refused with "<operation> is offered only to
Voyager", the exit code is 1 and nothing is queued. `create-vessel` is offered
to any Vessel when its insertion is `beside` a placement of a Fleet, as shown
below.

`remove-placement` takes `"id":"<placement id>"` from `voyager status`. It
takes that placement off the canvas and nothing else. The Vessel's content,
name and data stay, and its program keeps running, so check it with `hc ls`
and stop it with `hc`. A Vessel that removes its last placement closes its own
socket.

- `create-fleet` makes an empty Fleet and opens it. Start your program there
  with `--label voyager.place=fleet:<new fleet id>`, and it becomes the
  Fleet's first Vessel. Take the id from the layout in the reply. The Fleet
  shows "Choose content" until a labelled program arrives.
- Give each change a new `requestId`. Repeating the same request returns its
  first result instead of acting twice.
- Each change prints one plain sentence on standard error, before the
  JSON, such as `Renamed the Fleet to Notes.`. It names things as the person does and
  carries no id or revision. Say it to the person as it is. A refused or
  uncertain change says so and never claims the change happened. A refused
  change gives the app's reason after "because" when that reason is in plain
  words, as in "...but it was refused because the workspace changed first, so
  nothing changed.", and leaves it out when it holds an id, a number or an
  internal term. The JSON on
  standard output is unchanged. The sentence is on standard error, so pipe
  standard output alone into `jq`. Do not use `2>&1` there, because the
  sentence is not JSON.
- The exit code is 0 when the change applied, 1 when it was refused and 2 when
  its result is uncertain. After an uncertain result, run `voyager status`
  before you repeat anything.
- A refusal that says the layout changed means another change landed first.
  Run `voyager status` and use the new `version`.

## Create and navigate Vessels

`voyager do workspace` offers a fixed set of operations. Any other is refused
with exit code 1 and nothing queued, and the message says who may use it.

| You want to | Use | Who may |
| --- | --- | --- |
| Add a terminal or agent Vessel to a Fleet | `hc run --label voyager.place=fleet:<fleet id>` | any Vessel |
| Split a placement with a terminal or agent Vessel | `hc run --label voyager.place=fleet:<fleet id>:<side>:<placement id>` | any Vessel |
| Split a placement with a Vessel of any ready type | `create-vessel` with a `beside` insertion | any Vessel |
| Open a Fleet or Voyage | `select-fleet`, `select-voyage` | any Vessel |
| Make a Fleet that holds one new Vessel of any ready type | `create-fleet-with-vessel` | Voyager only |
| Add a Vessel of any ready type to a Fleet without naming a placement | `create-vessel` with an `empty` insertion | Voyager only |
| Maximize or restore a placement | `set-placement-maximized` | Voyager only |
| Resize a split | `resize-placement-split` | Voyager only |
| Take the user to a Vessel | `dock` | Voyager only |
| Add a Vessel to a Portal column, hide or reveal a placement | The person | the person |

Tell the person when a task needs the last row. Do not try to work round it.

Select a Fleet:

```sh
voyager do workspace '{"requestId":"select-1","expectedVersion":"<version>","action":{"operation":"select-fleet","id":"<fleet id>"}}'
```

Create a Vessel of the type `flag` in a new Fleet. The request is refused
unless its Voyage is the selected one. The layout in every reply lists
`voyages` with their ids, such as `voyage-1`, and names the `selectedVoyage`.
Send an `inspect` request, with a `requestId` and the `expectedVersion` like
any other, to read it. Select a Voyage that is not selected
with `{"operation":"select-voyage","id":"<voyage id>"}`. Do not take the id from
`voyager status`, because a Vessel that sits in Home reports an id such as
`home-voyage-5`, which cannot be selected. A name or a Home id is refused with
"Voyage not found". `typeId` is the type's `id`. The reply's layout holds the
new placement.

```sh
voyager do workspace '{"requestId":"flag-1","expectedVersion":"<version>","action":{"operation":"create-fleet-with-vessel","voyage":"<voyage id>","name":"Flags","source":{"kind":"voyage","voyageId":"<voyage id>","cwd":"<voyage cwd>"},"typeId":"flag"}}'
```

Dock on that Vessel with the `dock` request above and
`"context":{"kind":"vessel","id":"<placement id>"}`. `voyager status` lists
placements of your own Vessel only, so take the new placement's id from the
reply of the create request. The sentence says whether the dock happened.
Run `voyager focus` to read it back. Its `scope` names the placement you docked
on.

Add a Vessel of the type `flag` beside a placement of a Fleet. Any Vessel may
do this. Take the Fleet
id and the placement id from the reply of the create request above, or from
`voyager status`. `side` is `left`, `right`, `top` or `bottom`.

```sh
voyager do workspace '{"requestId":"vessel-2","expectedVersion":"<version>","action":{"operation":"create-vessel","typeId":"flag","destination":{"kind":"placement","owner":{"kind":"fleet","id":"<fleet id>"},"insertion":{"kind":"beside","id":"<placement id>","side":"right"}}}}'
```

Maximize a placement, and restore it with `"maximized":false`:

```sh
voyager do workspace '{"requestId":"max-1","expectedVersion":"<version>","action":{"operation":"set-placement-maximized","id":"<placement id>","maximized":true}}'
```

A type that is unknown, still failing its first check or removed is refused,
and the message names the reason.

## Make a Vessel type

A Vessel type is one JSON file. No code, build or restart is needed.

1. Find the profile. It is the folder that was passed to `voyager-shell` as
   `--profile`. Read it from `ps -o args= -C voyager-shell`, or ask the person.
   Never edit a profile that you were not given.
2. Write `<profile>/vessels/<folder>/manifest.json` and an empty file with the
   name that `view.source` gives, in the same folder. Name the folder exactly
   like the type's `id`. Until a type first passes the check, the app finds it by its folder name, not its id, so a refused create shows the problem list only when the folder is named like the id. The `id` is what you pass as `typeId`.
3. Create a Vessel of the type, as above. The app checks the manifest then, and
   again whenever the file's modification time or length changes.

A manifest that works, with one boolean and one action:

```json
{
  "contract": 1,
  "id": "flag",
  "name": "Flag",
  "version": 1,
  "state": {
    "schema": {
      "type": "object",
      "additionalProperties": false,
      "required": ["raised"],
      "properties": { "raised": { "type": "boolean" } }
    },
    "initial": { "raised": false }
  },
  "actions": {
    "flip": {
      "rebase": "always",
      "effect": [{ "op": "set", "path": "raised", "value": "!raised" }]
    }
  },
  "view": { "source": "view.vx" }
}
```

The check enforces these rules.

- The required fields are `contract` (always 1), `id`, `name`, `version`,
  `state`, `actions` (may be `{}`) and `view`. Unknown fields are refused.
- `id` starts with a lowercase letter or digit, then letters, digits, `.`, `-`
  or `_`, at most 64 characters. It must not be `terminal`, `agent`, `agents`
  or `notes`, and no other package may declare it.
- `state.schema` is JSON Schema for an object. `state.initial` must fit it.
- An action has `rebase` (`by-key`, `always` or `refuse`) and `effect`, a list
  of steps. A step is `set`, `push`, `remove` or `move` with a `path` that
  starts at a state field. Paths may use `.field`, `[0]`, `[*]` and
  `[id=$id]`. A `value` is an expression. Text in it is single-quoted.
- `params` maps each parameter name to `string`, `number`, `boolean`, `null`,
  `any` or a `|` union. An effect reads one as `$name`, and `$uuid` is a fresh id.
- `view.source` must name a file in the package folder.

Today the Vessel draws the type's name, its state and its revision, and a
button for each action that takes no parameters. The person presses the
button. No `voyager` command runs an action, and an action with parameters has
no button yet. `view.source` is checked and not yet drawn. `docs/content.md`, section
"Vessel type manifests", has the full grammar, and
`contract/generated/contentManifest.schema.json` in the repository is the schema.

### See problems and keep the last good version

The check lists every problem, not the first. Each names its place and the
fix, for example `actions.flip.effect[0]: ...`. A refused request shows the
list in its message:

```text
Manifest has 2 problems: <path>: <message>; <path>: <message>
```

A broken edit does not remove a type that once passed. The previous manifest
stays in use and new Vessels use it, while the broken file's problems stay in
the type's catalogue entry. A type that never passed is unavailable with the
same list as its reason. A Vessel that is already open may keep drawing the
manifest it opened with. Create a new Vessel to see an edit.

Removing the folder's manifest or moving the package never deletes a Vessel's
data. Keep each edit to a whole-file rewrite, so the change in modification time or
length is seen.

## Authority

Your Vessel's socket tells VoyagerShell which Vessel is calling. That identity
is advisory. Nothing is enforced. The command acts with the person's
authority, and any program of the same user can reach the socket. The socket
exists only while the Vessel is placed. It is a Unix socket. Linux is the
verified platform, and Windows has no socket yet.
