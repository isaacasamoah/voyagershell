# Refused and uncertain results

## Sub-features

A workspace request ends as applied, refused or uncertain, and the reply says
which. The canvas, the administrator's workspace tool and the Voyage close
dialog each show a refusal with its reason and an uncertain result as
uncertain. None of them sends an uncertain request again.

## How to get to it (user POV)

Open the isolated fixture app. Rename a Fleet to a name of 129 bytes and press
Enter. Open the chat, send a message, and let the assistant rename the Fleet to
an empty name. Then stop Core from answering, rename the Fleet again, and wait
for the status line. Press Enter a second time. Let Core answer again and press
Refresh. Next, open the close dialog for the Voyage, let the assistant rename
the Fleet behind it, and confirm. Last, open the dialog again and confirm while
Core's reply to the program stop never arrives.

## Driving it with the maintained fixture

Follow the exact doctor and run commands in ../SKILL.md with
`--journey outcomes`. The Rust journey in tests/native/src/journey/outcomes.rs
owns the recipe. It needs the sidebar open and a window of at least 1180 by
1000 device pixels. The journey declares `terminal.kill=21000`, so no
`--core-delay` is needed, and it refuses a run that holds that reply for 20
seconds or less. Two cases wait for Core's 20-second deadline, so a run takes
about a minute.

- `refused-shows-reason` types a 129-byte Fleet name and presses Enter. The
  status line must start with `Refused.` and hold the owner's reason, `A name
  must contain 1 to 128 bytes`. Escape then closes the editor and the Fleet
  must keep its saved name. The run keeps `refused-*.png`.
- `tool-refusal-carries-reason` plays a scripted inspect and then a scripted
  rename to an empty name through the stand-in provider. The tool result that
  the provider receives must hold `"status":"refused"` and the same reason, and
  the Fleet must keep its saved name. `provider.jsonl` holds the frames, and
  the run keeps `tool-refused-*.png`.
- `uncertain-not-replayed` types a new Fleet name, pauses Core with SIGSTOP and
  presses Enter. The status line must show the owner's uncertain answer, `Core
  result unconfirmed`, which arrives when Core's deadline passes. A second
  Enter on the same name must be declined by the canvas. Core then resumes.
  Core's layout document must be one version on with the typed name, and must
  still be at that version after Refresh, when the canvas draws the Fleet once
  under the saved name. The run keeps `uncertain-*.png` and
  `uncertain-after-refresh-*.png`.
- `close-refused-says-why` opens the close dialog and plays a scripted rename
  behind it, so the dialog's plan is out of date. Close Voyage must then show a
  message that starts with `Refused.` and holds the owner's reason, `Layout
  changed`. The Voyage must stay open, every program must still run, and the
  dialog must keep the refusal while the canvas refreshes. The run keeps
  `close-refused-*.png`.
- `close-uncertain-not-retried` opens the dialog again and presses Close
  Voyage. The relay holds Core's reply to the program stop for 21 seconds, so
  the app gives up first. The dialog's message must start with `Uncertain.` and
  say `Shutdown is unconfirmed`. Once the held reply is released the Voyage
  must still be open, and the dialog must keep the uncertain message and offer
  no second confirmation. The run keeps `close-uncertain-*.png`, and
  `heldStops` in `observations.json` lists the held replies.

## What a failure means

A product failure in the first two cases means that a refusal reached the
canvas or the tool without its status or its reason. A product failure in
`uncertain-not-replayed` means that the canvas showed something other than the
owner's uncertain answer, sent the same name twice, or that Core's document
changed more than once. A product failure in `close-refused-says-why` means
that the dialog hid the refusal or its reason, or that a refused close stopped
a program. A product failure in the last case means that the dialog hid the
uncertain result, offered the confirmation again, or that the Voyage closed
after Core's reply came back.

The run ends `inconclusive`, blamed on the verifier, when Core's
`terminal.kill` reply is held for 20 seconds or less, because the app would
then get its answer and the close would not be uncertain.

## Known gaps

- A request that the owner never answers is not reached on the real surface.
  The owner answers a paused Core at Core's 20-second deadline, before the
  caller's 22-second wait ends. `app/src/client_reply.rs` and
  `desktop/rename-test.cjs` cover that reply in unit tests.
- `uncertain-not-replayed` reads Core's document after Core resumes. It does
  not see which requests the app sent while Core was paused.
- `close-uncertain-not-retried` does not prove that the app sent no second
  stop. A second stop's reply would be held for another 21 seconds, after the
  case has ended. The case judges that the Voyage stays open and that the
  dialog offers no second confirmation.
- A Fleet create from a live terminal's folder reads Core's terminal list
  before it saves. With Core paused that read fails and the create is refused
  with nothing sent, so the journey uses a rename to hold a save in flight.
- A Voyage close confirmed while Core is paused is refused, because the close
  cannot inspect the workspace first. The refusal reaches the dialog only after
  two of Core's deadlines, so the journey does not drive it.
- The avatar's dock reply is not driven.
- The journey does not judge a failed frame. When a notice arrives while the
  canvas is idle, the canvas fails one frame, and the capture taken as the close
  dialog shows its result has a `Render failed` banner. The capture at the end
  of the case has none. The issue "A notice that arrives while the canvas is
  idle makes one frame fail to render" tracks it.
- An owner whose Core never connected answers `uncertain` to a request that it
  never sent. The issue "An owner whose Core never connected answers uncertain
  to requests it never sent" tracks it.
