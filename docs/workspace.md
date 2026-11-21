# Native workspace boundary

## Libraries and entry points

`contract/` defines shared identities, commands and results. `app/src/lib.rs`
exposes the Rust application independently of GPUI. The application owns
workspace changes, content state, captured context and effect policy. Its Core
adapter owns protocol translation, while Herdr Core owns terminals and programs.

`desktop/src/lib.rs` owns native composition, asset seeding and view modules.
`desktop/src/main.rs` parses command-line arguments and invokes that library.
The declaration exporter calls the same library and component registry as the
running app. A component registration therefore has one owner for both runtime
presentation and generated script definitions. The Notes registry remains its
own supported component set.

`desktop/canvas/` and `content/` provide configurable presentation through those
native components and the generated application contract. Moving a placement
does not change its content identity or backend. These layers implement the
architecture's ownership rules; they do not require a file for every diagram box.
Browser embedding and additional provider implementations remain separate work.

## The front door

Every request that carries an identity passes `app/src/front_door.rs` on the
owner thread, in this order. View registration, content binding, workspace
observations and change subscriptions carry no identity and change nothing, so
they do not pass it.

1. **Envelope.** The owner builds one `Envelope` from the bound caller and the
   request. It holds the request id, the kind, the caller, the target, the
   expected revision and whether the request has an effect. The caller is the
   canvas, the avatar with its captured focus, a Vessel's own view, the program
   in a Vessel through its socket, or Core. A
   request never names its own caller. An empty id, an id over 128 bytes, or an
   empty or over-long Vessel revision is refused here.
2. **Ledger.** One list holds every request id with its kind, a fingerprint and
   the first answer. The fingerprint covers the kind, caller, target, expected
   revision and payload. A repeat returns the first answer and runs nothing. A
   changed request under a known id is refused. An id that another kind holds
   is refused. A request that is still in flight answers that it is pending.
3. **Gates.** An effect is refused while Voyager quits. A request with no effect
   passes. These are a workspace inspect, a Vessel inspect, describe or list, and a
   process list or read. A workspace inspect while quitting answers from the
   owner's last layout and marks it not fresh.
4. **Decide** and 5. **Effect.** Each kind supplies these. The kinds are
   workspace, content, worktree, process and terminal.
6. **Record.** The owner stores the answer in the ledger and replies.

The ledger keeps the last 32 settled answers of each kind, in the order they
settled, and never evicts a pending entry. A refusal from the first three stages
is not stored, so nothing but the first answer can ever be replayed. An
uncertain answer is stored like any other and is never run again. Before the
owner stores an uncertain answer, it settles the effect as
[settling an uncertain result](#settling-an-uncertain-result) describes.

Later steps of an admitted effect use the same gate. Those are the worktree
removal preflight and the worktree completion.

Core's reports pass the same door. Each event on Core's subscription becomes an
envelope with the Core caller and the terminal's address as its target. A
report has no effect, so the gate passes it, and the owner keeps it only when a
Vessel's backend names that terminal. Closing a Vessel whose program exited is
the Core caller's one effect. It uses the gate too, whether the exit came from
an event, a snapshot or the observation's terminal list. A report never enters
the ledger, because Core's event sequence already tells one report from the
next. [The Core adapter](terminal.md#core-adapter) describes the whole path.

### Labelled terminals become Vessels

Core owns terminals, so an agent starts a program with `hc run` and labels it
`voyager.place=<value>`. The value is the `Place` contract type in
`contract/src/place.rs`. It is `fleet:<Fleet id>` or `portal:<Voyage id>`. Its
generated schema is `contract/generated/place.schema.json`. The owner parses
the label where Core's report enters, in `app/src/activity.rs`.

A `created` report for a terminal that no Vessel names is dropped, unless it
carries the label. A labelled one is adopted. A missed-event snapshot also
adopts each live labelled terminal that no Vessel names, so a terminal created
while the subscription was resynchronising is not lost. Adoption is the Core
caller's second effect and uses the same gate as an exit closure. It waits
until no request is in flight and the layout is fresh.

Adoption adds one terminal Vessel whose backend is that terminal and places it
at the end of the Fleet's split, or of the Voyage's Portal column, which it
shows. The Vessel's launch is the program when the first argument names a
known agent program from `app/src/launch.rs`, such as `claude` or `codex`, and
a terminal otherwise. The placement takes the terminal's Core name and keeps it
as a deliberate name, so a later folder change does not rename it. When Core
gives no name, or another member of the group already holds it, the placement
gets the default `Terminal N`. Adoption starts nothing, because the terminal is already
running. When a later launch finds that the adopted terminal is gone or ended,
`prepare_reopen` in `app/src/families/terminal/lifecycle.rs` clears the Vessel's backend
and gives it a fresh shell, as for any terminal Vessel.
A terminal that any Vessel already names is skipped, so a repeat report or a
second snapshot adds nothing. The adopted terminal joins the live bindings, so
its Vessel closes when its program exits, like any other.

An invalid value, an unknown Fleet or Voyage, or a closed one places nothing.
The owner writes the reason, which names the terminal, to the canvas status
line through `take_placement_notice`. It never guesses another place.

The adoption's layout save settles like every other save, through
`settle_save` (see Settling an uncertain result below). When the save is
refused, nothing was written, so the owner keeps the adoption and tries it
again after the next inspect reloads the layout. A terminal that the reloaded
layout already names is skipped. When the settle read cannot prove the result,
the owner keeps no second retry. It drops the adoption, marks the layout
stale and writes a notice naming the terminal to the status line. A later
missed-event snapshot adopts the terminal if the save did not land.

### The voyager command

`voyager` (`app/src/bin/voyager.rs`) is the agent command for workspace
actions. `voyager --skill` prints its guide,
[voyager-command.md](voyager-command.md). Core keeps processes, terminals and
their output, so the command offers none of them.

Each placed terminal Vessel has its own Unix socket, opened and closed by
`app/src/vessel_socket.rs` as the layout changes. The path is
`<Core socket directory>/<session>.vessels/<terminal>.sock`, from
`app/src/vessel_socket.rs`. The command computes the same path from
`HC_SESSION` and `HC_TERMINAL_ID`, which Core already sets in every terminal.
Voyager sets no identity variable, because Core starts an `hc run` child with
Core's own environment, so such a variable would never reach an adopted
terminal. Voyager does put the folder that holds `voyager` first on `PATH` for
each terminal it starts. An `hc run` child gets Core's environment, not its
parent's, so `voyager --skill` prints the full path of the command.
The socket closes when its Vessel has no placement or its backend changes.

A connection sends one JSON line, a `SocketRequest`, and reads one JSON line,
a `SocketReply` (`contract/src/socket.rs`, generated as
`socketRequest.schema.json` and `socketReply.schema.json`).

- `status` inspects the workspace through the front door and answers with the
  calling Vessel, its terminal, the layout version and each of its placements.
- `workspace` carries a workspace `Request`. The socket offers `inspect`,
  `create-fleet`, `rename`, `move-voyage`, `move-fleet`, `move-placement`,
  `remove-placement`, `select-voyage` and `select-fleet`, and refuses any
  other operation before queueing it. It also offers `dock`, but only on the
  socket of the terminal that `voyager.json` names (see
  [Voyager's binding](#voyagers-binding)). An offered request passes the front
  door like the canvas's, with no scope, so the program acts with the
  person's authority.
- A `create-fleet` from the socket makes a Fleet with no Vessel. The canvas
  and the avatar still get a Fleet that opens on a new "Terminal 1". An agent
  that makes a Fleet does so to start its own program there with a
  `voyager.place` label, and an extra idle terminal beside that program is
  clutter. The first labelled terminal is adopted into the empty split, so it
  takes the Fleet's first slot. The structure family in `app/src/families/structure.rs`
  passes the calling program to `Model::apply_from` in `app/src/workspace.rs`,
  which picks the Fleet's `FirstVessel` from it. The wire `Action` is the same
  for every caller. Until a labelled terminal arrives, the Fleet looks like
  one whose last Vessel was closed. It shows an empty canvas that offers "Choose
  content".

The socket binds the caller outside the payload. The envelope's caller is
`Program { vessel }`, taken from the socket that accepted the connection. That
identity is advisory, and nothing is enforced. Any process of the same user can
connect to any Vessel's socket, and the directory's 0700 mode only keeps other
users out. Linux is the verified platform. Windows has no socket yet, so the
owner opens none there and the command refuses.

### Voyager's binding

`voyager.json` in the profile holds one field, `terminal`, the Core terminal id
of Voyager's terminal. `app/src/voyager_binding.rs` is its only writer, and it
writes by temporary file and rename. The app writes it when it starts Voyager.
It is not a Core label or a Core document, because a Vessel program can write
both, and it is not part of the layout, so the layout and its wire do not
change.

A Vessel socket offers `dock`, `create-fleet-with-vessel`, `create-vessel` and
`set-placement-maximized` only when its own terminal equals that field. Any
other socket refuses each with "<operation> is offered only to Voyager; nothing
was queued" and queues nothing. `create-vessel` from Voyager must name a Fleet
as its destination, and a Portal destination is refused. The field stands in
for the rank record that Release 0.2 adds.

The app reads the file once, when it starts. After that it holds the value in
memory, and only its own write changes it, so an edit to the file while the app
runs has no effect. A hand-edited file takes effect at the next app start,
when the app loads it, and stays in force until the app writes a new binding.
The app writes a new binding when it starts Voyager, so the edit can survive
only if a later start finds an existing Voyager and binds to it instead of
starting one. A file that is missing, damaged, larger than 1 KiB or names no
terminal binds nobody. Any program of the same user can write the file, so this
is advisory, like the socket's caller identity. Stored ranks in 0.2 give the
stronger protection.

A bound terminal that no longer exists has no placed Vessel and so no socket,
and nobody can dock. Whether Core can give a later terminal the same id after
a restart is unproved, and the next binding write replaces the old one.

### Voyager's start

The app starts Voyager when it launches, once the workspace is prepared and
before any chat opens, so the agent's own start-up time passes in Core and not
on the first request. Voyager is the terminal Vessel with the id `voyager`,
placed as a Portal named Voyager on Home. Its saved launch is `claude` with
`--session-id` and a session id the app chose. That pair is the only record of
the session, and reopening a Voyage never converts this Vessel to a shell.

The step in `app/src/client_voyager.rs` runs inside the owner and holds no
viewer. It starts Voyager through the same start marker, Core run and workspace
save as any terminal, so an unconfirmed start is reported and never repeated.
Core runs Voyager directly, not through the Bash wrapper that worker agents
use, so Voyager ending ends its Core terminal. The command is the `voyager`
entry of `launches.json`, or `claude --model claude-sonnet-5-5 --effort low`
when the profile has none, followed by `--session-id` or `--resume`, `-n
voyager`, a short identity prompt and a `--settings` value. The value always
sets `env.VOYAGER_BACKGROUND` to `1`, which lets the user's own agent
instructions skip a personal reply prefix, and it adds the `voyager focus --hook
claude` hook and the three `voyager reply --hook claude` hooks described in
Voyager's replies when the app knows the path of the `voyager` command. The
environment value stays out of argv, so the terminal still matches the test
below. The identity prompt sends Voyager to `voyager --skill` and asks it to
start every reply with the reply marker `[vy]`. The `voyager` entry is read for
Voyager alone and does not appear in the Create Vessel picker.

At launch the app forgets what `voyager.json` held and decides again from two
records that must agree. They are the `voyager` Vessel's saved terminal and
Core's own record for that terminal. A terminal counts as Voyager only when Core reports
it live, with a program path containing `claude`, `-n voyager` and the saved
session id after `--session-id` or `--resume`.

| Core says about the saved terminal | The app does |
| --- | --- |
| No terminal saved | Starts Voyager with `--session-id`. |
| Live and matching | Starts nothing and writes `voyager.json` to name it. |
| Ended, gone, or live but not matching | Starts Voyager with `--resume` and the saved session id, and writes `voyager.json` to name the new terminal. |
| Unreadable or in a state the app cannot read | Starts nothing, leaves nothing bound and reports it in the status line. |

Editing `voyager.json` alone therefore binds nothing. The file is rewritten
from the verified Vessel at the next launch. A hand edit can take effect only
if someone also edits the saved layout and the terminal it names was started
with Voyager's exact arguments. That terminal is then Voyager by every test the
app has. A program of the same user can write both records, which is the
advisory limit stated above.

A Voyager that ends while the app runs shows Resume on its Portal, in the place
of Start new shell. Clicking it runs the same step with `--resume` and rewrites
`voyager.json`. The app never resumes a Voyager that ended while it was open.

### Voyager's replies

Voyager's text reaches the app through the Vessel socket and never through the
owner queue. The reply hooks are `MessageDisplay`, `Stop` and `StopFailure`.
Each runs `voyager reply --hook claude` with `async` set, so Claude does not
wait for it, and the command prints nothing and exits 0 whatever happens. It
waits at most 200 ms for the app's `Noted`, which bounds a stalled socket or
stdin. A hook input that has an `agent_id` came from a subagent and sends
nothing. An input with a missing or renamed field sends `Unreadable`, and the
chat shows it as a version problem.

The socket thread of the terminal that `voyager.json` names hands each
`ReplyEvent` to `Replies` in `app/src/replies.rs` and answers `Noted`. Any other
terminal is refused and nothing is stored. A held connection, a slow hook or a
reply that never finishes occupies only its own socket thread, so a canvas
action and an inspect are answered as usual.

`Replies` keeps the last 8 turns. A turn is one prompt, named by the `prompt_id`
that Claude puts on `MessageDisplay`, `Stop` and `StopFailure` alike, so a `Stop`
finds its own turn whatever order the hook processes arrive in. Within a
message it releases text only from the first missing `index` forward, and drops
a repeated `index`. A message is complete once its `last` flush is released. A
turn holds at most 256 KiB of text, a target to measure, and past it the turn
is marked truncated.

`TurnEnd` records the `Stop` text on its turn. The turn is matched when every
message is complete and the streamed final message equals that text, ignoring
trailing whitespace. Otherwise it is not matched and the `Stop` text is the
reply. A lost chunk is never retried, because the `Stop` text settles it. A
chunk that arrives after its `Stop` and completes a message re-checks the
match, because the hooks race by a few milliseconds. A Stop hook in the
person's own setup can continue a turn, so the same turn gets a new message
after a `Stop` and then a second `Stop`. The new message withdraws the first
`Stop` and the second one settles the turn. `TurnFailed` records its error,
and when `StopFailure` carries no `prompt_id` it settles the latest turn. A
`Stop` for a turn that streamed no text records a turn with no messages. A turn
whose `Stop` has not come when the next turn starts reads as lost until it does.
`Replies::stop_missing` says the latest turn has no `Stop` two seconds after Core
reported the terminal done, a grace period that is a target to measure.

`Replies` strips a leading reply marker, `[vy]`, from every message text and
from the `Stop` text when it hands a turn out. The marker is matched only as the
first word, so a reply without it reads unchanged, and the strip happens once,
upstream of the speech filter and the chat note. The match test above compares
the texts after the strip. When a turn's `Stop` text carries text and neither it
nor any message of the turn starts with the marker, `Replies` writes one line to
standard error, once per turn, that gives the unix time and says the marker was
missing. The line holds no reply text and the miss changes nothing else.

Reply text is display data. It never runs an action and is never sent to an
agent as an instruction.

### What the caller is told

A workspace request ends in one of three ways, and the reply's `status` says
which.

- `applied`. The change was made, or the read was answered.
- `refused`. The application declined the request and nothing changed. The
  `message` gives the reason.
- `uncertain`. The effect may have happened and a read of its provider could
  not settle it. The caller inspects before any other change and never sends
  the effect again.

The owner's answer is a `Response`. It carries the status, the message and the
layout the owner holds, whatever the status. A request that the owner never
answered gets an `Unanswered` reply instead. That reply has the request id, the
status and the message, and no layout. It is `refused` when the queue was full,
so nothing was queued, or when the request was still queued when the caller's
wait ended. The caller then cancels it, and the owner skips a cancelled
request, so nothing was sent. It is `uncertain` when the owner took the request
and gave no answer within 22 seconds, or within 120 seconds for a confirmed
Voyage close, and the caller's ask below got no answer either. That wait is longer than Core's 20-second deadline, so the owner's
answer to a Core timeout reaches the caller before the caller gives up. It is
shorter than the conversation's 25-second wait, so a chat message that needs an
inspect still gets the conversation owner's answer. The build fails if either
order changes.

`Client::call` in `app/src/client_reply.rs` returns
`Result<Response, Unanswered>`. The canvas bridge and the avatar's dock write
either one as the `Reply` of `contract/src/lib.rs`. The generated `invoke`
returns that `Reply` once the generated validator accepts it. An outcome is
never thrown as a bare string. Something that still throws, such as a reply the
validator rejects, is treated as uncertain.

The canvas writes `Refused.` or `Uncertain.` before the message, in the status
line and in the Voyage close dialog. After an uncertain result it marks its
layout stale and drops every action that waited behind the request. It declines
to send an unchanged name again until a Refresh.

The process, terminal, worktree, content and conversation replies still say
`rejected` for a refusal. The administrator's tool record converts a workspace
status with `From<Outcome> for Status`.

An edited canvas script from an earlier build keeps running beside the updated
`workspace.js` and `validate.js`. It treats `refused` like any reply that is not
`applied` and shows the message without the word. For a reply the owner never
answered it shows a type error in place of the reason and marks its layout
stale, and its close dialog leaves Confirm enabled after an uncertain
confirmation. It sends nothing by itself in either case.

### Settling an uncertain result

When a request comes back uncertain, its caller asks the provider of that hop
and settles it. Core is the provider for the app. The app is the provider for
the canvas and the avatar. The caller retries only when the read proves that the
effect did not happen and the retry cannot double it. A read that cannot settle
the effect, or a provider that does not answer, leaves the result uncertain.

| Effect | Read | Landed | Did not land | Otherwise |
| --- | --- | --- | --- | --- |
| Workspace save, `doc.set` with a version | `doc.get` of the layout document | Applied when the version moved and the value is the one written | One retry with the same expected version when the version is unchanged, and a second read if that retry conflicts | Uncertain |
| Program start, `terminal.run` labelled `voyager-operation` | `terminal.list` for that label | Applied, and the start adopts it, when one terminal carries the label | Not provable, so no retry | Uncertain, and the marker stays |
| Program stop by verified identity | `terminal.get` of the terminal | Applied when it is no longer live | One more stop when the same program is still live | Refused, with nothing sent, when it is a different program |
| Terminal input | None | | | Uncertain, and the message says to read the terminal |
| A canvas or avatar request | The same request, sent again with its id | The ledger's recorded answer | | The ledger answers that the request is pending |

The owner settles in the effect owner, after Core's 20-second deadline gives
it an uncertain result, so a request that was not uncertain makes no extra
call. `settle_save` in `app/src/layout_store.rs` settles every layout save,
including the save in flight below. `settle_run` in `app/src/client_terminal.rs`
settles a program start, and `Completed::settle` in `app/src/families/terminal.rs`
settles a stop. Each read waits at most Core's deadline. While it waits, the
owner's queue waits too, because the owner reads on its own thread.

Each retry is safe only because it cannot double the effect. A save retries
with the same expected version, so a late original can only make the retry
fail as a conflict. When the retry conflicts, the owner reads once more, and
the value it wrote means the late original landed. A start is never retried. A
list that shows no terminal for the label does not prove that the start did not
happen. When the start and the list reached Core back to back, Core listed no
terminal and then ran the start, so a retry would have started a second
program. The `outcomes` journey's `start-stalled-not-repeated` case shows this.
A stop runs again only while the same program identity is still live.

The canvas, the avatar and a Vessel's socket ask the app in `Client::call`,
`Client::scoped_call`, `Client::program_call`, `Client::process` and
`Client::terminal` in `app/src/client.rs` and `app/src/client_reply.rs`. When the
caller's wait ends without an answer, it sends the same request with the same
id once more and waits again. The front door's ledger answers the repeat with
the recorded answer, or that the request is still pending, and never runs the
effect a second time. A request that was still queued when the wait ended was
cancelled instead, so it is refused and never asked about.

The conversation provider cannot be asked about a request by its id, so a
conversation turn that comes back unconfirmed stays unconfirmed.

### Structure handling

Split, move, rename, create and close of Vessels, Fleets, Voyages and Portal
placements are decided in the structure family, `app/src/families/structure.rs`.
`route` checks freshness, the caller's revision and scope, and sorts the action
into a Voyage close step, a package change or a layout edit. `edit` applies the
edit to a candidate layout. It reaches what the family may not name, the Voyage
close family, Core's terminals and the content owner, only through its `Calls`
trait. The family never saves.

`Owner` in `app/src/client_owner.rs` holds the queue's state and runs one loop
that hands each message to a method. `app/src/client_structure.rs` holds the
workspace methods, which admit a request, track the save in flight, run the
Notes rename and build the response. `app/src/client_worktree.rs` holds the worktree methods. Both are
children of the owner module and add methods to `Owner`, so `client` and the
owner module never name each other's children. `app/src/client.rs` holds the
messages, the receipts, the front door glue and the public `Client` calls.

**Inspect only reads.** A workspace inspect loads the stored layout, drops
creation grants and unconfirmed starts that the layout no longer holds, and
answers. It saves nothing. The two saves an inspect used to make happen at
owner start, before the first message:

- When no layout is stored, the owner creates the "Voyager" Voyage in the
  working folder and saves it. The first inspect after that reports
  `created_workspace`, and a repeat of that inspect replays it.
- The owner lists Core's terminals once, closes adopted Vessels whose program
  ended, prepares reopened terminals and saves the result.

If either save fails, the owner tries again before the next message, and an
inspect answers with the last failure until one succeeds. If the stored layout
disappears later, an inspect refuses and asks the caller to inspect again, and
the owner creates the Voyage again before the next message.

### A save in flight

A workspace change that only edits the layout sends its `doc.set` to Core and
returns to the queue. This covers create, rename, select, dock, resize, remove
and reopen. Core's reply comes back as a message, and the record stage runs
then. While that save is in flight:

- A request with no effect runs at once.
- Every effect waits in arrival order, so effects stay serial. At most 8
  requests wait. A further effect is refused as busy with nothing queued.
- Quit waits, so a save that was sent is confirmed before the Core connection
  ends.

When the reply lands, the owner installs the saved layout only if its revision
is newer than the layout it holds. An inspect during the flight may already
have loaded it.

A `terminal.list` that an effect needs first departs the same way. These are the check
before a worktree removal, the plan of a Voyage close, and a Voyage or Fleet
created from a live directory. When the list lands, the request is decided
again from the start with the list in hand.

The other saves still block the owner. They are opening a terminal, selecting or
configuring a Note, the last step of a Voyage close or a worktree change, the
closure of an ended Vessel, and the repairs at owner start. A slow Core delays
every request behind those.

The envelope names a terminal by a machine and a Core address, and the Core
caller names its machine. Only the local machine exists today.

## Shared panel arrangements

The current owner contract uses `PlacementOwner`, which is a Fleet ID or a Voyage's Portal
column. Home is one retained internal Voyage/Fleet with its own Portal column,
kept outside the ordinary Voyage list. Entering Home preserves the selected
ordinary Voyage/Fleet and explicit dock context. A previously absent Home starts
with an ordinary Agents 1 panel. Every stored Home, including an empty or
customized arrangement, remains unchanged. Closing that panel does not seed it
again. New ordinary Voyages and Fleets keep their initial plain shell.

`create-vessel` names the chosen Vessel type and a placement destination. Insertion
is either `empty` or `beside` a captured placement with a left, right, top or
bottom side. Split controls choose content before dispatch. Cancellation creates
nothing. Old default-terminal split and Fleet-only action aliases are removed;
the current canvas, agent declarations and generated validators use the common
create, resize, move, maximize, visibility, reveal and saved-layout actions.

Roots may be empty. Hiding retains a panel's leaf and proportions; removing its
layout entry retains its placement, content, configuration and backend in the
same membership list. Reveal reuses that instance in its original owner. If all
panels are hidden, a new empty insertion preserves their subtree beside the new
visible panel. Hidden-leaf pruning preserves original accepted resize paths.
Save captures the visible arrangement; load shows its included retained panels.
Neither operation stops or restarts a program or changes explicit context.

`reopen-placement` takes a retained placement ID and the same destination as
`create-vessel`. It inserts that instance into the chosen empty or beside slot,
preserving its content, data, name and Core binding. A closed Fleet panel may
transfer between Fleets in the same Voyage. A Portal stays in its column, and
Home stays separate. A transfer prunes only that leaf from source saved layouts,
retaining their names and other leaves. Duplicate human names remain unchanged;
placement IDs and owner paths distinguish the panels. Reopening does not select
a Fleet, reveal a column or change the explicit dock context.

The owner rechecks source and destination scope, the current workspace revision
and insertion target. It refuses panels already placed, including siblings
occluded by maximization. Terminal reopening additionally requires a confirmed
binding and a fresh Core observation of the same live backend and PID. Missing,
ended or unconfirmed programs refuse unchanged. Reopening grants no creation
permission and never starts or resumes a process. Duplicate and uncertain
requests retain the existing receipt and no-replay rules. These owner checks do
not establish the new corner controls or native chooser journey.

Each Voyage's Portal visibility, overlay/make-room mode and width persist in the
existing Core workspace document. Portal moves remain within that column.
Legacy Portal lists, nonempty Fleet roots, saved Fleet arrangements and missing
names are decoded at the same owner boundary. This does not rewrite personal
package source or save a migration merely because the workspace is inspected.

New names are stored once as Terminal 1, Notes 1, Agents 1 and the next available
suffix in that owner. Hidden and unplaced names remain reserved. Legacy missing names are
resolved deterministically before projection. UI, context facts and conversation
tools receive the same required name; rendering and reordering do not renumber
panels. Explicit rename preserves identity and may deliberately duplicate a name.
Tools retain IDs and full paths for disambiguation. Home paths omit its internal
container labels.

`app/src/panels.rs` owns the shared tree rules; workspace, scope, content and
process routes keep their existing application queue, grants, CAS and receipts.
Home is omitted from subordinate ordinary Voyage projections. The source and
Core checks do not establish the separate integrated native UX journey.

## Pane maximize and restore

Each Fleet and Portal arrangement optionally records `maximizedPlacement` in the
existing workspace document. `set-placement-maximized` names one placement and an
explicit Boolean.
The Rust owner checks scope, accepted tree membership and the existing version
before saving. A restore for another placement refuses unchanged. Stored invalid
targets are rejected before publication; a narrow projection omits other IDs.

Maximize renders the existing content through a temporary leaf. The accepted
split tree, saved layouts, backend bindings and explicit context remain intact.
Preparation retains all accepted-tree terminal and Notes entities. Ordinary
splits clear maximize; loading an arrangement clears an omitted or redundant
target. Go there to an occluded sibling restores the tree. A same-Fleet move
retains a still-present target.

The corner Button stays keyboard reachable and appears on hover or native focus.
Its left pointer press stops before the native default-focus listener, retaining
the terminal focus used by the existing unchanged-focus check. Tab and keyboard
activation keep the Button's native focus behavior.
Linux uses Ctrl+Shift+Z; macOS uses Cmd+Shift+Enter. The displayed Vessel frame
handles a chord that reaches it, preserving native text-editor handling. A busy
action refuses the chord without queuing it. Terminal focus transfers through
the existing captured-focus check only if the user has not changed focus.
This follows ordinary split/zoom behavior in pinned
[Herdr App](https://github.com/herdrdev/herdr-app/tree/1581a587919dddd6f1efd5f78eb542c4b2b02cb5).
Owner, contract and script checks establish this source path. Current native
geometry, keyboard accessibility and retained input mapping require the separate
application journey; no macOS runtime result is claimed.

## Outer canvas

The workspace document owns an outer canvas separately from each Fleet's Vessel
split tree. `contract/src/canvas.rs` defines rows, columns, stacks, named blocks and
fixed/content/fill sizing. Older documents receive the supported default through
Serde. Existing Fleet names are retained; a new Voyage starts with Fleet 1.

`update-canvas` and `set-sidebar` use the same request identity, expected version,
Client queue, receipt and Core document save as other workspace actions. Only the
application/Workspace caller can change global composition. Collapsing the rail
does not dock Voyager. Invalid definitions are refused before mutation. A bad
stored definition preserves the Client's last usable layout with its error.

Each displayed arrangement retains exactly one Sidebar, Fleet strip, active
Fleet, Portals and context region. The initial sidebar is 224 logical pixels, from the pinned
Electron composition source; its unchanged 200-pixel Brand is centred. A retained
capture appears wider, but its equal-scale provenance has not been established.
Matched native/reference screenshots must resolve that discrepancy rather than
introducing an arbitrary scale adjustment. Maximum depth is 12, maximum node count is 64, and fixed sizes
contain 1 to 4096 logical pixels. These bounds limit the native composition, not
total application memory. In both modes the Portal block must be
the last child of a row with the active Fleet in another sibling subtree. Its
subtree must also be last in every enclosing row; columns may retain chrome
above and below it. Left, top, bottom and middle Portal placement refuses unchanged.
Intrinsic/content overlay size is also refused. Legacy canvas mode and fixed
width supply defaults when older data has no Portal presentation. The current
owner projects `portalLayout` per Voyage, with visibility, overlay/make-room mode
and pixel width. Home has its own settings. The canvas uses that projection and
the native `Column` control for the full-height right column.

A Stack stores a selected child index and alternative arrangements of the same
regions. Rust validates every alternative, including inactive Portal geometry,
against one global depth and node budget. Alternatives may reference the same
regions, but each arrangement and its surrounding siblings may show each region
only once. An invalid index or a different region set refuses unchanged. A Stack
that includes Portals must also include their active Fleet, preserving the
native column's shared geometry. The default canvas has no Stack.

The script visits only the selected alternative and keeps the parent sizing
axis. Terminal and Notes view owners remain keyed by content identity, rather
than by an alternative's position. Selection changes neither content, process
identity nor avatar context. The existing versioned `update-canvas` operation
persists selection and arrangement together. Legacy Portal width migration
traverses only the selected alternative. No human JSON editor or additional
selector style is introduced by this contract.

`desktop/canvas/main.ts` controls retained preparation and versioned actions.
`panel-view.ts` renders shared panel controls and content; `navigation-view.ts`
renders the sidebar, Fleet tabs and context bar. `panels.ts` selects groups and
visible members from the Rust projection. `canvas.ts` composes the saved outer
tree and panel frames. Home uses the same panel factories and its retained global
arrangement. These modules retain the existing
terminal, Notes, divider, avatar and conversation owners.

Collapsing the sidebar keeps a 48-pixel rail and sends only `set-sidebar`, without
Dock. Expanded and compact speech/chat controls share their retained owners.
Humans arrange panels through gestures, keyboard shortcuts and context menus.
Split captures its destination and revision before offering content choice;
cancelling creates nothing. Fleet context menus expose saved arrangements.
Authorized agents use the generated JSON actions, including `update-canvas`,
through the same owner. The current canvas exposes no raw layout JSON editor.

The earlier Workspace layout-editor trial and the separate Home overview have
been removed from source. Their recorded evidence remains historical, and
existing profiles may still hold their seeded copies, which nothing loads. The
original avatar trial's Home pose and rectangular preview are also historical;
current source has a circular primary landing preview. These source changes do not complete the full native UX checkpoint or
establish matched appearance, input behavior or performance.

The pinned ShellRoot and canvas bypass their content cache while native
accessibility is active. GPUI's current cached prepaint/paint path does not
replay accessibility nodes after each frame clears them. An avatar-only frame
would otherwise publish the overlay controls without the workspace controls.
Ordinary rendering keeps both caches, and avatar animation remains enabled in
both modes. This preserves the existing renderer ownership; it does not add a
second accessibility tree. The 7 November correction is built for normal-motion
native verification. Composition cost with accessibility active needs its own
measurement and is not covered by ordinary cached-rendering results.

## Native overlay input

The PortalArea native module owns its full-size flex column and measured
occlusion. Its canvas composition uses an ordinary script div for the opaque
theme background. The pinned module host does not apply script style refinement
to the native component returned by its callback. Keep the native layout and
ordinary wrapper aligned so the visible column matches the blocked input area.

`desktop/src/occluding.rs` registers `Occluding.new()` in the actual
`voyager_native` component registry. Its generated declaration comes from the
same registry used by the application. It has no arguments or state. The public
GPUI `div().occlude()` excludes mouse and scroll hitboxes behind that container;
`MaterializeRequest::finish` applies the authored styles and takes its ordinary
children once. Child editors retain their native focus/input/scroll handlers.
There is no full-window input shield, terminal mute or second panel owner.

Compact Chat and the retained earlier layout-editor trial use this container.
The current Portal region uses `PortalArea.new(id, {})` from `voyager_avatar`.
It applies the same native occlusion and measures the opaque column, including
empty space, in workspace-local coordinates. The existing avatar Geometry keeps
one optional area and retires it when the wrapper disappears. Individual Portal
targets still identify the panel under a drop. Vessel hit testing excludes only
the actual area; landing, preview and visibility use the largest uncovered
rectangle. The measured `dock_target_visible` read drives the existing compact
footer fallback without changing explicit context.

`Column` in `desktop/src/split.rs` provides the same pixel-width resize control
in both modes. Overlay paints it above the Fleet canvas; make-room places both
in ordinary flow. Accepted width changes use `set-portal-presentation` with the
captured workspace version. Rust persists that Voyage's visibility, mode and
width. Content identity and durable actions remain in their existing owners.
Outside the actual opaque rectangle, ordinary controls remain available.
Constructor, typing and geometry checks do not establish native focus, pointer
routing or the complete UX revision. Keep earlier editor evidence at its original
scope when comparing the current application.

Pinned Herdr App `1581a587` uses this public mechanism for float content in
`src/window/floats.rs:209`. The pinned GPUI implementation sets
`HitboxBehavior::BlockMouse` through `InteractiveElement::occlude`; the script
SDK does not expose an equivalent method on `NativeElement`. This registration
adds only the missing concrete container, without copying its implementation.

## Dock context metadata

The existing Client queue captures the explicit dock scope, its names and its
scoped content directories. These are the configured starting folders from
`Content.cwd`, matching the retained Electron workspace's starting-folder
meaning. They are not a claim about the shell's current directory after `cd`.
The existing Core terminal_get/process-inspection path exposes actual terminal
cwd; this increment does not add all-terminal polling or another directory
tracker. It does not use the selected pane as a substitute.
`app/src/context.rs` resolves the captured directory outside rendering by reading
bounded Git marker and HEAD files. It supports Git worktree marker files without
starting Git or reading account configuration. Multiple directories, unavailable
metadata and detached HEAD remain distinct typed results. One canvas-owned task
refreshes these facts at the named `CONTEXT_REFRESH_MS` default of 3000 ms. It
notifies only changed facts, checks their captured revision and scope, and never
polls Core or reloads the workspace snapshot.

The canvas receives this read through `voyager_workspace.context_facts`. Late
metadata is bound to the captured workspace revision and scope. This read does
not change the document, publish an effect or query Core terminal state.

The native workspace creates, selects and renames Voyages and Fleets, splits a
placement and sets explicit dock context. Voyage-wide Portals use the same
placement/content interface and remain present across Fleet selection. Herdr Core
stores the versioned layout. This branch integrates the independently reviewed
terminal and placement providers; the combined native behavior is under review.
Full avatar, conversation and UX parity remain open.

The divider-resize candidate adds a validated first-child share to each split.
Existing layouts without that field open at half. Shares travel with the saved
split tree, while placement, content, Core backend and explicit avatar context
remain unchanged. This has source and boundary checks; native resizing and
integrated acceptance have not been established yet.

`desktop/src/split.rs` wraps the pinned public native resizable group and state.
The SDK owns the pointer drag and local preview. A non-consuming public window
observer captures the original revision and group configuration on left-down.
Only the SDK's actual resize-completion callback may submit a resize. A changed
configuration retires that gesture. The canvas passes the captured revision to
the existing generated owner call and sends no per-motion document writes.
Known refusal restores the owner projection through a read, without retrying
the resize. Uncertainty retains its original request and is not resubmitted.

The adapter measures native bounds and uses public `ResizableState::resize_panel`
after layout to apply committed proportions, including saved-layout loads and
refusal restoration. This programmatic synchronization does not dispatch an
application save. It does not access private SDK resize state or copy a divider
implementation. Native children keep their existing content-owned entities.
The measurement/event canvas is explicitly anchored at the group's top-left.
An absolute second child with automatic insets otherwise takes the block-flow
position after the full-height SDK group. The pinned layout-engine contrast
reproduced that misplaced origin; actual native event delivery remains a
separate check. Mouse-up defers clearing the held flag until the event's effect
cycle ends, preserving the SDK's bubble-phase completion callback.
The actual divider line declares a native Splitter role, an orientation and a name
through the SDK's public handle appearance. The SDK still owns its wider hit
band and drag behavior. Native accessibility exposure remains to be checked;
the surrounding panels are not labeled as a handle.
The isolated source is based on the selected UX checkpoint; its exhausted
correction histories and held proving cap remain unchanged. Zoom, navigation
and new content actions are outside this increment.

`contract/` owns the Rust request, response, identity and layout types.
`contract/build.cjs` generates declarations and strict runtime validators from
those types. Layout revisions and the allocation counter cross JavaScript as
decimal strings so a JavaScript number cannot round a Rust `u64`. Core's own
document protocol still uses its native numeric revision field. Placement,
content and optional Core terminal identities are distinct types.

`contract/src/operations.rs` is the operation catalogue. It lists every function
and component that a script can import from a host module, with typed arguments
and a typed result. The TypeScript declarations that `export-script-types`
prints, and `contract/generated/operations.json`, come from it.
`desktop/src/bridge.rs` registers each host module against its catalogue entry. It
checks argument count, type and size from the entry before the handler runs, and
refuses the load when a registered name is not in the catalogue, an entry has no
registration, or the sync and async kinds differ. A unit test also reads the
registering files and fails when their names and the catalogue differ.
`contract/build.cjs` refuses a generated wrapper that imports a name the
catalogue lacks. The workspace `Action` type stays the one list of workspace
operations; a click and F2 reach the same generated `invoke`. A wrong argument
type in a script fails `npm run typecheck`. `desktop/typecheck.cjs` starts the
message with the operation name, which is the `operation` literal for `invoke`
and the function name for a host call.

`app/src/workspace.rs` applies domain changes to a proposed layout.
`Owner` in `app/src/client_owner.rs` owns the current layout and revision on one worker thread.
It publishes a proposal only after Core confirms the save. Confirmed snapshots
are immutable and shared by Rust responses; a new layout proposal makes one
copy at the transaction boundary, outside rendering and input callbacks.
`app/src/core.rs`
owns the single CLI bridge to the selected dedicated session. Its framed
connection carries document RPC and terminal viewer channels together. The
terminal's start and attachment boundary is described in [terminal.md](terminal.md).

The application owner publishes confirmed change notices directly to one
bounded native canvas subscription. Its Rust task survives script reload and
is canceled with canvas. It invalidates the retained script description and
exposes only a small read-only revision projection to JavaScript. Retired scripts
cannot register or replace this subscription.

Each notice carries the actual Core document revision and a separate package
revision. Package remove/restore advances only the package revision without
saving a layout or changing its CAS revision. The canvas reads the latest snapshot
for a new notice, even with Chat closed,
and coalesces it behind the current action. It records the notice before queuing
the read, so a failed read does not retry from every render. A newer revision or
explicit Refresh can request another read. Unchanged reads, refused requests and
receipt replays do not publish another change. A confirmed layout save still
publishes when subsequent content initialization makes the overall result
uncertain. Its original uncertain receipt remains unchanged and is not replayed.
A replacement native canvas retires the previous subscription. The next
subscription compares its last revision pair with the owner's current pair, so a
full bounded notification cannot hide the final accepted state. This is a view
notification, not another writer or effect retry. A caught-up document notice
is consumed without another read or preparation, including after a busy action.

Notice reads keep normal preparation for newly authorized visible content, but
do not retry known-refused terminal starts. Explicit Refresh retains that retry;
uncertain starts are never replayed. The package filesystem/availability source
and its remaining native-lifetime requirements are described in [content.md](content.md).

Canvas keeps application requests and terminal preparation serialized. While
preparing, it can retain one unsent Close or discrete Portal visibility/mode
intent. The slot stores the original callback and an immutable signature of
the displayed panel/content/owner and arrangement, or the Voyage's Portal
layout. Admission refuses a stale menu version or a second intent. Width drags
use the existing reset/refusal path. The slot is removed before dispatch and
drains only after an accepted, fresh applied result and successful required
preparation. Its target must still match before a new request uses the current
version. Failed or uncertain preparation cancels it visibly. This is an unsent
UI intent, not replay of an application request.

The channel holds at most eight pending calls. A client timeout reports an
unconfirmed result and never retries it. The actor keeps the accepted request
even when its caller disappears. It retains 32 request/outcome pairs without
historical layout snapshots. An identical request returns its recorded outcome
with the current confirmed snapshot, and a changed request with the same
identity is refused. A Core conflict or failed inspection marks the retained
snapshot not fresh. This is bounded in-process retention, not durable
cross-restart deduplication. New mutations must match the confirmed layout
revision. An uncertain Core result requires inspection before another change.

The `voyager_workspace` host module is installed only in the workspace chrome's
policy. A caller cannot grant itself a role through its request. The host limits
request JSON to 64 KiB before dispatching asynchronous work. Vessel packages
do not receive this module. Additional agent/content entry points must bind
their caller at the host boundary before reaching the same owner.

`desktop/canvas/main.js` is retained presentation and interaction binding.
It receives confirmed snapshots and uses the generated wrapper for operations.
Switching a Voyage or Fleet changes navigation, not the explicit avatar context.
The scope controls in this checkpoint set that context; they are not the final
animated avatar interaction. Rust owns effects and GPUI draws the view. There
is no browser engine in this runtime.

Voyage, Fleet, Vessel and Portal names edit in place. Double-click or focus the
name with Tab and press F2. Enter or leaving the field saves; Escape cancels a
changed draft. An empty name reports the error and restores the existing label.
A pending selection does not discard a double-click. The submitted name stays
bound to its target; an unconfirmed name is not sent again on blur or Enter.
An explicit Refresh can confirm the latest label before a distinct new edit.
Queued navigation after a rename follows the latest selected destination and is
cleared if its prerequisite is refused or unconfirmed.

The Linux native fixture drives actual mouse actions, checks the saved Core
document and captures the rendered result. An external document edit makes the
next visible action fail unchanged; an explicit Refresh obtains the new revision.
The fixture then reopens the same profile and verifies retained layout identity.
Its dedicated Core session is stopped only after the owned application quits.
Closing the window quits and keeps the Core server and its programs. The
[lifecycle](terminal.md#lifecycle) defines closing the window, quitting and
stopping the session.

The source basis is Core 0.1.16 at
[`e07c2a1`](https://github.com/herdrdev/herdr-core/tree/e07c2a1bedd62cf4787ee026ee23ee79c7d95491),
including its document schema and plain/framed protocol; GPUI Shell at
[`9448039`](https://github.com/longbridge/gpui-kit/tree/944803984cf0ba3111861d6e1aa9d6265c109ff9),
including asynchronous host functions and retained views. The accepted native
canvas supplies hosting and last-good reload behavior. This checkpoint does not
claim new platform support or a measured performance improvement.

## Script authoring and checking

The repository authors workspace, shared panel, navigation and chat views in
TypeScript.
The profile receives the emitted JavaScript through the existing seed-once and
live-edit path. Contract generation produces typed workspace and conversation
wrappers alongside their runtime validators. Run `npm run contract:generate` after
changing contracts and `npm run scripts:generate` after changing composition or
native registrations. `npm test` checks strict types and emitted-file drift before
the controller and validator tests. This headless check requires the Rust toolchain
and GPUI's native linker libraries; it does not create a window or establish native
interaction behavior.

Size an avatar dock target through an ordinary `div` around `Target.new`, such as
`div().h(42).flex_shrink_0().child(target)`. The pinned Shell renders a registered
module's factory result directly and does not apply style chains attached to
that module element. A native factory owns its own geometry; ordinary layout
containers apply the surrounding geometry. The built-in Button and Div paths
have their own style handling. Generated types check accepted calls and values,
but do not prove that a factory applies a requested visual style. Check the actual
native result when changing a registered component's size or presentation.

The exporter obtains declarations from the real Name, Terminal and arrangement
registrations, plus declarations attached to the runtime host modules. It retains
the raw declaration hash and the transitive imported-module slice. The slice is
checked without skipping library declarations. The pinned Shell's invalid
`ElementBounds` extension is converted to an equivalent intersection only when
its expected exact form appears. Missing or changed declarations fail the check.
The canvas declaration slice also withholds `id` from the registered Occluding
element, including after style calls. The pinned Shell advertises that method
but rejects it at runtime. This exact-form adjustment changes no runtime method.
The Shell's separate profile editor hints still contain the upstream declaration;
they do not provide the repository's corrected strict authoring check.

The shipped Notes package is also authored in TypeScript and emitted by this
same gate. Its compilation uses the actual `export-script-types --notes` private
input/host declarations in a separate scope, so canvas/Terminal imports remain
unavailable. The profile's seeded JavaScript stays editable and is preserved;
repository checks do not automatically validate later personal edits. See
[native Notes](content.md) for remaining owner, signature and lifecycle limits.

Go there sends `reveal-placement` with a retained Vessel or Portal placement ID. The
owner selects its original arrangement, clears hidden state and reinserts its
leaf only when absent. A Portal reveal also opens its own Voyage's column. This
preserves content, backend and explicit dock context. Unknown placements refuse
before mutation, and captured scope still limits each request. The earlier Linux
Vessel-reveal journey recorded the same live PID and process start; it does not
accept the new shared Portal/Home UI or the full native UX checkpoint.

Name and Composer share the native text adapter in desktop/src/text.rs. Each
retains one gpui-base InputState and supplies accessibility metadata through that
editor. The current Linux bridge exposes its label and focus but lacks the Text
interface needed for an external accessibility text read. Name keeps its initial text and rename
events. Entering Name selects its current value; only submit or blur commits
the rename. Composer uses its constructor string as its accessible label, with
an empty visible placeholder and initially empty buffer. Chat keeps that same state through its
open, close and sidebar placements. This adapter addresses the pinned Shell
Input materializer's omitted accessibility metadata; it does not introduce
another editor or change the conversation/provider contract. The integrated
native chat journey verifies typing, one actual provider turn and draft retention
through native clipboard copy, independently of the missing Text interface.
Compact chat is anchored below the Fleet row and uses the opaque sidebar surface
to keep terminal output from crossing its text. The regular sidebar keeps its
original translucent surface. Following the newest reply automatically remains
an open parity requirement.


## Sidebar disclosure and content menus

The current feedback candidate gives Chat the sidebar's width beneath the primary
avatar. Opening it pushes Home and Voyages down; closing uses the same chat icon
and retains the draft. Native height and opacity transitions use 180 milliseconds,
matching the original Electron disclosure. MeasureHeight reports changed native
container heights to the script so it can reserve room for navigation. It has
one retained measurement per container and reports no unchanged height. It does
not own conversation state or persistence. The compact conversation overlay
exists only while Chat is present, including its closing transition.

Creation and right-click menus share the same bordered surface and menu-item
builders. Launch labels omit configuration details; the captured launch settings
and destination remain unchanged. Revealing an empty Portal column opens the
chooser under P after a successful current-owner response. Cancelling creates
nothing. Revealing an existing column retains its content. The native Column
starts its trailing panel at the saved width and keeps its resize handle on the
visible seam. These feedback changes require the combined native journey before
UX acceptance.


## Worktree and Home feedback candidate

The 5 November candidate uses the Voyage context menu for Rename, Close, New worktree, Open worktree and, for a linked checkout, Remove worktree. Fleet creation remains at its own plus control. A native centered dialog owns filtering and keyboard selection. Its list uses the SDK's retained virtual-list scroll handle so keyboard selection stays visible. Worktree Voyages appear beneath an open parent with an indent and branch icon. They remain independent open Voyages, without indentation, when that parent closes.

New worktrees use the main checkout's `.worktrees/` folder, with a local Git exclude entry. Git creates and checks out the chosen branch. The removal dialog reports uncommitted changes and retains the branch. The Rust owner rechecks live program directories and uses ordinary Git removal without force. After deletion, it reads the remaining checkouts from the primary directory and closes matching target Voyages, not the request's source Voyage. Successful checkout observations suppress removed project-local worktrees from Recent voyages without deleting retained application data. The worktree family in `app/src/families/worktree.rs` holds these checks, runs Git through its private `git` module on a worker thread and plans the Voyage changes a completed operation makes. `app/src/client_worktree.rs` keeps the workspace reads and saves, the front door and the removal's Core terminal list.

The layout and Git operation owners remain distinct. The script cannot grant deletion or launch authority. Dialog observations keep their captured request identity/version. Async list and text changes explicitly refresh the separate native dialog. The dialog handles Escape and Cancel itself, and waits for a dispatched operation before dismissal.

Worktree completion publishes the existing Rust workspace notice. Its native watcher invalidates canvas, which inspects through its own view context. The dialog only updates its checkout cache and closes. It must not start workspace inspection from its own task. Closing a dialog cancels that view's continuations and can strand the workspace busy flag.

Home groups existing content by Voyage using the same colour function as the sidebar. Agent status groups start collapsed. Closed Voyages are absent from Home. Voyage headings start expanded and collapse their contents when clicked, without a separate arrow. A successful complete Core process snapshot excludes ended or absent bindings from the running-work list; failed retrieval remains unavailable. Notes and other content without processes remain present. The current reported-activity contract has task progress, not reliable context-window usage, so this candidate does not display a context percentage.

This UX follows the [Herdr worktree mod](https://github.com/herdrdev/herdr-app/blob/f896da489de594fdb18a92a31dd953da3cf58da2/defaults/mods/worktree/main.js), with Voyager's project-local storage, styling and typed application owner. The native `worktrees` journey covers New worktree with Escape and with Enter, a removal refused while the worktree's shell runs and a removal after that shell exits. It does not drive Open worktree.


## Confirmed Voyage shutdown

Close Voyage prepares a typed inventory and asks the native user to confirm. It
is distinct from hiding a panel, closing a Fleet or quitting the application.
Those operations detach views and retain programs. Existing closed Voyages are
not stopped by migration or inspection. An administrator can request the same
confirmation but cannot confirm or cancel it through a scoped tool call.

The application owns one close plan. Its separate close revision wakes canvas
even when no layout changed. Canvas displays the plan and uses compact shared
controls from content/ui.ts. Confirm and Cancel bind the exact plan identity;
Cancel remains available after unrelated revisions or an uncertain observation.
A lost invocation offers Inspect, which reads state and never repeats shutdown.
Dialog tasks do not call Workspace.run or own the application continuation.

After confirmation, the native Notes host resolves the target content IDs to
retained Sessions. It makes their inputs read-only, joins ordinary revision-based
saves and releases them after completion or refusal. A dirty inactive draft,
file change or unconfirmed current save blocks all program stops. The private
native-save path does not grant Update access to scripts or agents. Draft body
text never enters the public close plan. Client keeps processing messages while
the host acknowledges saves.

Core owns shutdown signals. Voyager submits its existing Stop action for each
captured terminal address/PID and requires an observed finished state. A request
receipt does not establish exit. Notes failure stops nothing; a later partial
failure reports the actual result and never restarts work or repeats an uncertain
stop. A close is refused only while no program has stopped. Once one has, a
later refusal ends the close as uncertain and says how many programs had
stopped, because a refusal means that nothing changed. The application saves closed state only after successful acknowledgements.
Uncertain storage marks the projection non-fresh until inspection.

The Voyage close family in `app/src/families/voyage_close.rs` holds the close plan, its identity check and the stop sequence. It reaches the workspace only through the `Calls` trait that `app/src/client_reply.rs` implements for the client, takes the Notes type id and the worktree change count from the client as arguments, and owns the Notes save messages that `client` re-exports to the desktop. It never names `client`. `app/src/client.rs` keeps the queue, and `app/src/client_structure.rs` keeps the close plan's projection and the final save of the closed Voyage.

A private snapshot checks the target Voyage and its content identities. Target
mutations and terminal opening are refused during shutdown. Unrelated Voyages
and navigation remain available. Membership comes from the selected Voyage's
Fleets and Portals, including retained placements, rather than directories or
worktree parentage. Recent reopening prepares only that Voyage's confirmed-ended
retained terminals as ordinary shells. It preserves Notes file selection and
never resumes an agent command or its instructions.

Source and dedicated Core tests cover this policy. The native shutdown journey
and complete foundation acceptance remain separately recorded in the walkthrough.

## Activity scope and Portal closure

Activity derives scope from its placement. The Home Fleet sees the workspace,
a Portal sees its Voyage, and an ordinary Vessel sees its Fleet. Avatar context
and keyboard focus do not change that scope. Agents are listed directly with a
status symbol, ordered by Needs attention, Working, Done and Idle. Idle is the
presentation fallback for other or absent reports. Raw reports and diagnostic
reasons remain distinct. Confirmed-ended programs and closed Voyages are absent.
Voyage headings remain expandable, and Home uses its Home icon.

RemovePlacement retains the placement, content and backend. Removing the last
visible Portal panel also collapses that Voyage's column. Opening an empty
column shows new types and hidden Portals. Dismissing that empty chooser
collapses it; restoring a hidden Portal keeps its existing identity and backend.

New directory-derived Voyages record their original primary Vessel and an
automatic name origin. Observed directory changes from that Vessel may update
the Voyage's displayed name. Reordering does not choose another primary Vessel.
Deliberate names, including legacy records without automatic-name metadata,
remain fixed. Display-name changes do not move Notes or change the stored Voyage
directory. Worktree close confirmations include the current uncommitted-change
count when its registered checkout can be identified. Closing preserves the
worktree directory and branch.

Background worktree discovery is serialized through its existing controller.
Queued observations retain the latest requested revision. Activity refresh and
hidden-content choices share an in-flight process observation for the same
revision. The chooser publishes the local worker and content catalogues together,
so selectable rows do not move when those reads finish in a different order.
Hidden-view observations arrive separately below those choices. These changes
do not raise the actor queue capacity or bypass Core's input safeguards.

## Delayed process effects

The application owner validates a process request's captured scope, workspace
revision, content binding and observed terminal/PID before dispatch. Send,
Interrupt and Stop then wait outside that owner. Completion returns to the same
owner to record the original result. A later dock change does not retarget an
already dispatched request. A duplicate pending request reports that it remains
pending and does not dispatch again. An identical completed request returns its
retained result.

The single framed Core connection routes replies by request ID. It admits at
most eighteen pending RPCs, which are at most eight admitted process effects, at most
three process reads at two calls each, the one shared terminal list that observations
wait on, the one workspace save or list in flight, the activity subscription
and one ordinary owner call. Process admissions remain counted
until the owner reconciles completion. The [front door](#the-front-door) ledger
keeps every pending request and evicts settled entries only. Replies received after a caller has gone away
are ignored without disconnecting unrelated viewers. Disconnects release all
waiting callers with uncertain outcomes. Each request's twenty-second deadline
starts when dispatched, rather than when a completion worker starts waiting.
No timeout or disconnect repeats an effect.

This isolates delayed process effects. Initial revision/target checks, List,
Read and context preparation still use synchronous Core reads. A stalled Core
can delay those paths; this change does not claim that every application
operation is asynchronous. The real-Core regression verifies workspace
inspection, pending-duplicate refusal, a dock change and original-target
completion during a deliberately delayed Send. Native UX and broader load
acceptance require their separate journeys.

## Restoring a decorated Linux window

On Linux the app asks for client decorations. Where the compositor draws the
frame itself, such as KDE or a compositor-less X11 session, the window manager's
bar remains and the app draws nothing extra. Where it does not, such as GNOME,
the app draws its own title bar. `client_decorated()` in the Workspace host
module reports which of the two applies. `renderFleets` in `navigation-view.ts`
draws Minimize, Maximize or Restore and Close at the right end of the top strip
only when it is true, in the Home view as well. Minimize and Maximize call
`window.minimize_window()` and `window.zoom_window()`. Close calls `quit()`, which
sends the same quit-and-keep request as Ctrl+Q and as a window close request.
Stop session stays in the Home menu behind its confirmation, and no window button
calls it. `window_frame.rs` also draws resize grips along the window edges, six
logical pixels wide, under client decorations when the window is neither
maximized nor fullscreen. A press on a grip asks the window manager to start a
resize from that edge.

The empty parts of the top bar move the window. `dragFiller` in
`navigation-view.ts` draws one filler after the Fleet tabs, in the Home strip and
in the sidebar's top row, each marked `window_control_area("drag")`. The Fleet
tabs no longer grow, so the filler takes the empty space. A left press on a
filler, dragged, asks the window manager to start a move, and a double-click
maximises or restores the window. Only a filler carries the drag area. A Fleet
tab, a button or a Vessel never does, because a drag area on an ancestor of the
tabs would also fire during a tab drag and hijack its reordering.

The press must begin on a filler. The reviewed `gpui-shell-window-drag.patch`
makes a press on a drag area arm the move, a move with the left button held
while armed start it, and a release, a press anywhere else, a double-click or
the move itself disarm it. Without it the SDK started a move on any held mouse
move over a drag area, so a Fleet tab, Voyage or Vessel drag, or a terminal
selection, carried across a filler moved the window. The same arming serves
every press origin, because the SDK handler is the only place that sees the
pointer over the filler.

### Restoring the window position

GPUI reports the client window's root-relative origin. An X11 ConfigureRequest
without explicit gravity instead uses the window frame's reference point. In
the observed desktop the top frame is 74 device pixels, so reusing the client
origin in that request moved the restored window down by 74 pixels each time.

The Linux platform adapter restores windowed bounds through the advertised
`_NET_MOVERESIZE_WINDOW` operation with Static gravity, all four coordinate/size
flags and the application source flag. Static gravity addresses the client
origin directly. The adapter checks the window and supported operation before
dispatch and checks cancellation again immediately before sending. It does not
modify global size hints, subtract a fixed decoration height, retry an uncertain
request or add another window controller. Unsupported desktops report refusal.
The existing controller still owns minimization, activation, window identity,
restoration epochs and removal of the temporary floating avatar.

The governing protocol is the [EWMH move/resize message](https://specifications.freedesktop.org/wm/latest/ar01s04.html)
and its [window geometry rules](https://specifications.freedesktop.org/wm/latest/ar01s09.html).
Pinned Herdr App's X11 backend uses the same root-window client-message mechanism
for its native window-manager operations. The actual native journey compares
both window position and size before/after, requires no stray floating window,
and verifies the retained layout, Core and shell identities across reopening.
This is a Linux/X11 repair, not evidence for macOS, Windows or Wayland.

## Tested Core upgrade

The 7 November release uses generated Core types from the pinned 0.1.16 input.
Its real native restore/reattach and Notes/Voyage-shutdown journeys ran against
Core 0.1.18. The owner handoff also retained an existing 0.1.18 Core. This
establishes that these consumed operations work across that additive upgrade.
It does not establish a general compatibility matrix. Generation, capability
and minimum-release checks are the admission rule. A newer release is accepted,
and one older than 0.1.18 is refused.

## Navigation and the structure revision

Navigation is where the user is. It holds the selected Voyage and Fleet, the Home or
Fleet view, the dock context and the `navigation` record. Everything else in
`Layout` is structure. `Layout::same_structure` in `contract/src/lib.rs` names
both sets, and it destructures every field, so a new field does not build until
it is classified.

`home`, `select-voyage`, `select-fleet`, `focus-vessel` and `dock` are the
navigation actions. They change only navigation, and the owner skips the
expected-version check for them, so a click is never refused as stale. They
still need a fresh layout and the request's scope.

The version every caller sees is the structure revision. `LayoutRevision` in
`app/src/layout_store.rs` keeps it beside the Core document version, which the
owner uses only for its `doc.set` compare. A save or a read that leaves the
structure unchanged keeps the structure revision. A save or read that changes it
takes the new document version. The workspace queue compares the layouts before
and after its save. The owner's other saves (a terminal binding, a Notes
selection, a closed program, a Voyage close) change structure, so they always
take the new document version. An external write is detected on the next read,
by comparing structure. So a plan an agent built before the user
clicked a Fleet still applies, and every check that compares a caller's version
with the owner's ignores navigation. The next section narrows each check to the
parts that a request changes.

Change notices carry the structure revision, and a navigation revision that
moves only when a scoped caller, such as an agent through the administrator, or
a Vessel program through its socket, changes navigation alone. The canvas
inspects again when either moves past what it holds. Its own navigation,
including `focus-vessel`, and the native avatar's dock reach it through their
replies, so they send it no notice. A dock that changes the selection costs one
inspect, to prepare the terminals it newly shows.

A Vessel program's call arrives with no scope, so the owner carries the calling
program through a layout save and counts it as a scoped caller when it
publishes the notice.

**The navigation records.** `navigation` holds one entry per Voyage with its
last-used Fleet. `lastVessels` holds one entry per Fleet with the Vessel or
Portal placement last focused there. Both are navigation, not structure. An
older build keeps `lastVessels` as an unknown root field and writes it back
unchanged. A stale entry, such as a removed or hidden placement, falls back to
the Fleet's first shown placement. The owner records a placement only when it is
in the open Fleet or that Voyage's Portals, so each Fleet remembers its own last
Vessel across Fleet and Voyage changes. Any change that leaves the workspace on
a Voyage and Fleet updates that Voyage's entry.

Selecting or reopening a Voyage, or moving to the nearest Voyage after one
closes, opens its last-used Fleet when that Fleet is still open. Otherwise it
opens the first open Fleet. Home keeps no entry.

**Docking takes the user there.** `dock` sets the dock context and moves the
user to the target, in one navigation save:

- A Vessel selects its Voyage and Fleet, shows the Fleet and records the Vessel
  as that Fleet's last Vessel.
- A Portal selects its Voyage's last-used Fleet and records the Portal as that
  Fleet's last placement, so the Portal column is focused.
- A Fleet selects its Voyage and itself and opens on its last Vessel.
- A Voyage opens its last-used Fleet on that Fleet's last Vessel.
- The Workspace, and any Voyage, Fleet, Vessel or Portal on Home, goes Home.

A closed Voyage or Fleet refuses the dock with its name and leaves everything
as it was. A hidden Vessel or Portal, and a Portal column that is not shown, is
not revealed. The dock lands on the Fleet and records nothing. A dock runs no
Vessel type actions and starts no model turn, because the Vessel types declare
no dock behaviour yet. The canvas follows a dock with one inspect that also
prepares the newly shown terminals, then moves its focused placement to the
remembered one and gives that terminal keyboard focus unless a chat, a rename or
a dialog is open. `followDock` in `desktop/canvas/panel-view.ts` is that one
step. It records the dock, runs the inspect and gives the keyboard from that
request's completion, because a focus asked for while the canvas renders does
not reach the terminal. `acceptDockResult`, beside it, runs at each render. It runs
`followDock` for the avatar's reply. Every other dock reaches the canvas as an
accepted layout whose dock context differs from the last one recorded, and
when no request is preparing, `acceptDockResult` runs `followDock` for it once. Only
a dock writes the dock context, so no other change follows. A second dock on the context the canvas already
holds does not differ, so it does not follow. When the user has clicked another
Vessel and Voyager docks on the same one again, the keyboard stays where the
user put it.

**Agents look without moving the user.** `focus-vessel` is a canvas click
operation. It is absent from the `voyager_workspace` tool schema, which the
exporter builds from the same `Action` type, and the tool refuses it if sent.
The `voyager` command already refuses it. `voyager_peek` takes a Voyage, Fleet,
Vessel, Portal or the whole workspace and returns the inspect read for that
target in one call. It runs a scoped inspect, so it changes no navigation, no
dock and no structure. It reads layout only. Reading a terminal's text stays
with `voyager_process` under the captured dock context.

**The canvas's focused placement.** `moveFocus` in
`desktop/canvas/panel-view.ts` is its only writer. It keeps the placement in a
store private to that module, and `Canvas.focused` only reads it, so an
assignment anywhere else does not compile. A move has one of two targets:

- A placement the user chose. It comes from a click on a pane, the Maximize or Restore
  button or menu item, or the Vessel a split or create focuses. When this
  changes focus in an ordinary Voyage, the canvas sends `focus-vessel`. It sends
  it outside the action queue, does not wait for it and ignores its reply.
- The opening placement. It is the remembered placement when it is shown, and the
  first shown placement otherwise. The canvas moves here after a selection
  change or a dock, when nothing is focused in an ordinary Voyage, as on the
  first layout after launch, and when the focused placement is no longer shown.
  It sends nothing, because the record already names this placement. A Fleet
  with no remembered Vessel opens on its first shown placement. A tab click
  therefore costs one save, the selection itself.

## Each part has its own revision

A caller still sends the one structure revision it last saw. The owner refuses
the request only when a part that the request changes has changed since that
revision. A Fleet that the user created or renamed does not refuse an agent's
rename of a Vessel in another Fleet. A second edit to the same Vessel from the
same old revision is refused, and the refusal carries the current layout.

`Part` in `app/src/layout_parts.rs` names the parts. They are the workspace itself
(the Voyage order, Home, the canvas and the saved arrangements), each Voyage,
each Fleet, each placement, each Vessel and the whole set of Vessels. A Voyage holds its own fields and
the order of its Fleets and Portals, not their contents. A Fleet holds its name,
state, placement order, split tree and maximized placement, not the placement
records. `Part::same` destructures every field it compares, and it ignores
navigation and `next_id`, so a new field does not build until it is placed.

`layout_parts::parts` finds the parts that a workspace action changes. It applies
the action to a copy of the current layout and compares the two. An action that
the copy cannot apply, such as a Voyage shutdown confirmation or a Vessel
package change, has no parts, so it needs the current revision. A process
request names the Vessel that it reads or writes, and a process list names the
whole set of Vessels, because its answer depends on every Vessel. A terminal, Notes or content
request names its Vessel. A worktree request names its source Voyage.

`Seen` in `app/src/layout_store.rs` keeps the layout at each of the last 32
structure revisions. The workspace queue records the current revision first
in each turn, before it applies Core's reports, adopts labelled terminals or
closes exited placements, and again before it takes the next message. Every
revision that a caller can hold is therefore recorded before the caller can send
it back, even when an adoption saves in the same turn. Without the first record,
a relaunch that adopts a terminal refused the canvas's first terminal open.
A refused terminal open logs one standard-error line naming the Vessel, the
revision it was given, the recorded revisions, and both Vessel records when the
revision was recorded. `Seen::current` accepts the current revision. It
accepts an older recorded revision when every part of the request is the same
in that layout and the current one. It refuses an unrecorded or future revision.
A content request from an agent that passes this check runs at the current
revision. The bound of 32 is a target to measure, not a measured limit.

The stored layout and the wire shapes do not change. Revisions stay inside the
one layout document, and an older build reads and writes the same document. An
older build still refuses any stale structure revision.

## The stored layout across builds

The whole `Layout` lives in the Core document `voyager-layout-v2`. A build
reads it through `voyager_contract::layout_document` and saves it through
`app/src/layout_store.rs`. The wire stays closed. No response schema carries a
field a newer build added.

**Reading.** The reader parses strictly first. A document that fails to parse is
stripped of every field its entity's generated schema does not list, and parsed
again. Each stripped field is kept with the id of the nearest enclosing entity
(a Voyage, Fleet, Placement or Vessel) and its path inside it. A field with no
such entity is kept against the document root and an array item without an id is
matched by position.

**Saving.** The save adds each kept field back to the entity with the same id.
A field whose entity the build deleted is dropped with it. The save never
replaces a field the build itself wrote.

**The stamp.** A `minReader` number at the top of the document names the lowest
reader level that may open it. This build reads level 1. A document stamped above
the build's level is refused. The build copies the raw document to
`voyager-layout-backup`, writes nothing else and reports the level it needs. A
stamp above 1 on a document the build can read is kept and written back. A
`minReader` that is not a whole number (`2.0`, `"2"`, `-1`, `null`) is a
malformed stamp, not one from a newer build, so the document is unreadable and
takes the path below. A build never writes a stamp of 1 or less.

**Writer rule.** A change to the stored shape is safe for an older reader only
when it adds an optional field or a new Vessel type id. Removing or renaming a
field, narrowing a type, adding a variant of a tagged enum, or making an old
field optional is not safe. Such a change raises `READER_LEVEL` in
`contract/src/layout_document.rs`, commits the release schema of the level it
replaces as `contract/tests/layout-release-<level>.schema.json` and stamps the
documents the new build writes. The test `layout_compat` compares the current
`Layout` schema with each committed release schema and fails on an unstamped
breaking change.

**Unreadable documents.** A document that does not parse after stripping is
copied to `voyager-layout-backup`, and the workspace starts fresh. Every inspect
response, and every refused or unconfirmed response with no message of its own,
carries a message that names the backup, and the workspace status line draws it.
The message stays until the workspace applies a change from any caller, which
clears it. A restart also clears it. A document that parses
but fails the workspace's own checks is copied to the backup and refused. The
backup holds one document, so a later unreadable document replaces it.

**Navigation across builds.** `navigation` is an optional field, so this
build stamps no `minReader`. The selection and dock fields keep their stored
keys. A build from before it reads the document, keeps `navigation` as an unknown
root field and writes it back unchanged. That build opens each Voyage on its
first open Fleet. Its entries can go stale, and a stale entry falls back to the
first open Fleet here.

**Older documents.** `voyager-layout-v1` is the name before the Vessel and
Placement vocabulary. A build that finds no v2 document and a v1 document renames
the five changed stored keys, reads the result by the rules above and saves it as
v2. It never writes v1.
