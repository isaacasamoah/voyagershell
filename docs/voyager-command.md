# Arrange your VoyagerShell workspace with voyager

`voyager` is the agent command for VoyagerShell. Run it inside a Vessel, which
is a terminal that VoyagerShell shows. It covers workspace actions only:
inspect, create a Fleet, rename, move, remove a placement and select. Herdr Core owns programs and
terminals, so start, read, send to and stop programs with `hc` (`hc --skill`).

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
```

- `fleet:<fleet id>` places it in that Fleet. `portal:<voyage id>` places it
  as a Portal across that Voyage. Take the ids from `voyager status`.
- VoyagerShell adds the Vessel when Core reports the new terminal. A known
  agent program, such as `claude` or `codex`, shows as an agent Vessel. Any
  other program shows as a terminal Vessel.
- An invalid value, or a Fleet or Voyage that is not open, places nothing.
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
request is refused unless its Voyage is the selected one on the Fleet view. A
Fleet for an agent stays `create-fleet`, which opens empty.

```sh
voyager do workspace '{"requestId":"fleet-1","expectedVersion":"<version>","action":{"operation":"create-fleet-with-vessel","voyage":"<voyage id>","name":"Review","source":{"kind":"voyage","voyageId":"<voyage id>","cwd":"<absolute directory>"},"typeId":"terminal"}}'
```

`create-vessel` and `set-placement-maximized` are offered only to Voyager too.
`create-vessel` adds a Vessel of the named `typeId` to a Fleet. Its
`destination` names the owner as `{"kind":"placement","owner":{"kind":"fleet","id":"<fleet id>"},"insertion":...}`.
`insertion` is `{"kind":"empty"}` for an empty Fleet, or
`{"kind":"beside","id":"<placement id>","side":"<side>"}` beside a placement.
The current Fleet is the one `voyager status` and the focus reply show. A
destination in the Portals is refused. `set-placement-maximized` takes
`"id":"<placement id>"` and `"maximized":true` to maximize it, or `false` to
restore it. The app still decides whether the target and the Fleet are valid,
as it does for the avatar.

```sh
voyager do workspace '{"requestId":"vessel-1","expectedVersion":"<version>","action":{"operation":"create-vessel","typeId":"terminal","destination":{"kind":"placement","owner":{"kind":"fleet","id":"<fleet id>"},"insertion":{"kind":"empty"}}}}'
voyager do workspace '{"requestId":"max-1","expectedVersion":"<version>","action":{"operation":"set-placement-maximized","id":"<placement id>","maximized":true}}'
```

From any other Vessel each is refused with "<operation> is offered only to
Voyager", the exit code is 1 and nothing is queued.

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
- The exit code is 0 when the change applied, 1 when it was refused and 2 when
  its result is uncertain. After an uncertain result, run `voyager status`
  before you repeat anything.
- A refusal that says the layout changed means another change landed first.
  Run `voyager status` and use the new `version`.

## Authority

Your Vessel's socket tells VoyagerShell which Vessel is calling. That identity
is advisory. Nothing is enforced. The command acts with the person's
authority, and any program of the same user can reach the socket. The socket
exists only while the Vessel is placed. It is a Unix socket. Linux is the
verified platform, and Windows has no socket yet.
