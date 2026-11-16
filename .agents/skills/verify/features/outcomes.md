# Refused and uncertain results

## Sub-features

A workspace request ends as applied, refused or uncertain, and the reply says
which. The canvas, the administrator's workspace tool and the Voyage close
dialog each show a refusal with its reason. When a request comes back
uncertain, the owner reads Core and settles it, and the canvas asks the app
about the same request id. A rename and a Voyage close whose Core reply was
late or lost end as applied, a program start whose reply was late is adopted,
and nothing is done twice. A start that a read cannot settle stays uncertain.

## How to get to it (user POV)

Open the isolated fixture app. Rename a Fleet to a name of 129 bytes and press
Enter. Open the chat, send a message, and let the assistant rename the Fleet to
an empty name. Then rename the Fleet while Core is stopped for longer than the
canvas waits, and rename it again while Core never receives the save. Next,
open the close dialog for the Voyage, let the assistant rename the Fleet behind
it, and confirm. Then close the Voyage while Core never receives the program
stop, reopen it, and close it while Core's reply to the stop is held. Last,
reopen the Voyage and create two Fleets with a terminal, the first while Core's
reply to the program start is late and the second while the start is held up
with the requests behind it. The stalled start is last because an unresolved
start blocks a Voyage close.

## Driving it with the maintained fixture

Follow the exact doctor and run commands in ../SKILL.md with
`--journey outcomes`. The Rust journey in tests/native/src/journey/outcomes.rs
owns the recipe. It needs the sidebar open and a window of at least 1180 by
1000 device pixels. The journey declares the Core delay `arm`, so the relay sits
between the app and Core and each case arms one fault for the next request of
one method. `core-relay-arms.jsonl` lists the arms and `core-relay.jsonl` lists
the faults the relay applied. A drop never forwards the request. A hold
forwards it and holds Core's reply. A stall holds that request and every later
one, so they reach Core in order and late. Five cases wait for Core's 20-second
deadline, so a run takes about four minutes.

- `refused-shows-reason` types a 129-byte Fleet name and presses Enter. The
  status line must start with `Refused.` and hold the owner's reason, `A name
  must contain 1 to 128 bytes`. Escape then closes the editor and the Fleet
  must keep its saved name. The run keeps `refused-*.png`.
- `tool-refusal-carries-reason` plays a scripted inspect and then a scripted
  rename to an empty name through the stand-in provider. The tool result that
  the provider receives must hold `"status":"refused"` and the same reason, and
  the Fleet must keep its saved name. `provider.jsonl` holds the frames.
- `rename-stalled-applied` types a new Fleet name, stops Core with SIGSTOP,
  presses Enter and keeps Core stopped for 24 seconds. That is past Core's
  20-second deadline and the canvas's 22-second wait, so the owner settles the
  save by reading Core and the canvas asks the app about the same request id.
  The status line must never say `Uncertain.` while Core is stopped. Once Core
  resumes, the editor must close and the Fleet must be drawn under the new name
  with no Refresh, and Core's document must be exactly one version on.
- `rename-dropped-retried` arms a drop of the next `doc.set` and saves another
  name. The read shows the document unchanged, so the owner retries once with
  the same expected version. The status line must never say `Uncertain.`, the
  editor must close, and the document must be exactly one version on.
- `start-held-adopted` creates a Fleet with a terminal and holds Core's reply
  to the `terminal.run` for 21 seconds. The owner lists the start's label and
  adopts the terminal. The status line must never say `Uncertain.`, the new
  Fleet's terminal must be bound and drawn, and Core must hold exactly one
  terminal with that start's `voyager-operation` label.
- `start-stalled-not-repeated` creates another and stalls the `terminal.run`
  and the requests behind it for 22 seconds, so the owner's list reaches Core
  right after the start. Core then lists no terminal for the label and runs the
  start afterwards. The owner must keep the start's marker, the status line
  must say the start was not repeated, and Core must hold exactly one terminal
  with that label.
- `close-refused-says-why` opens the close dialog and plays a scripted rename
  behind it, so the dialog's plan is out of date. Close Voyage must then show a
  message that starts with `Refused.` and holds the owner's reason, `Layout
  changed`. The Voyage must stay open, every program must still run, and the
  dialog must keep the refusal while the canvas refreshes.
- `stop-dropped-retried` drops the first `terminal.kill` of a Voyage close. The
  read shows the same program still live, so the owner stops it once more.
  `stop-held-closed` reopens the Voyage and holds Core's reply to the first
  stop for 21 seconds. The read shows the program ended. In both, the close
  dialog must never say `Uncertain.`, the Voyage must close, and none of its
  programs may still run.

## What a failure means

A product failure in the first two cases means that a refusal reached the
canvas or the tool without its status or its reason. A product failure in a
rename case means that the canvas showed an uncertain result for a save that a
read could settle, that the rename did not end as applied, or that Core's
document changed more than once. A product failure in a start case means that
a late start was not adopted, or that Core holds more than one terminal for one
start. A product failure in `close-refused-says-why` means
that the dialog hid the refusal or its reason, or that a refused close stopped
a program. A product failure in a stop case means that the close stayed
uncertain or open, or that a program still runs.

A case ends `inconclusive`, blamed on the verifier, when the relay never
applied its arm, because the case then did not reach the state it judges.

## Known gaps

- The cases settle the canvas's requests. The avatar's dock and the
  administrator's tools use the same ask in `app/src/client.rs`, but no case
  drives them through a late reply.
- A request that was still queued when its caller's wait ended is cancelled and
  refused. Unit tests in `app/src/client_reply.rs` cover that. No case queues a
  request behind a stalled save on the real surface.
- Program input is never settled, because a read cannot show whether bytes
  arrived. No case drives a late reply to input.
- A start that stays uncertain keeps its marker, and nothing adopts its
  terminal later. The issue "Adopt a terminal that appears after its start
  stayed uncertain" tracks it.
- The journey does not judge a failed frame. When a notice arrives while the
  canvas is idle, the canvas fails one frame. The issue "A notice that arrives
  while the canvas is idle makes one frame fail to render" tracks it.
