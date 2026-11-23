# Label spoken replies

## Goal
VoyagerShell's background agent, Voyager, answers the person's voice requests aloud. The person runs the workspace and wants concise replies that give the gist of what matters to them. They want no narration of how Voyager checked things, no offers of more, and no app mechanics. Accuracy is never traded for brevity, so a short reply that is wrong fails. You are an independent labeller. You did not write any of these replies or the rules behind them.

## Inputs
- `sheet.json`, in the folder this task names. Each turn has the person's prompt and up to five replies, labelled V, W, X, Y and Z. Each reply comes with the previous reply in its own conversation, because the conversations drift apart, and a short prompt like "No, that's fine" answers whatever that conversation said last. The labels are shuffled per turn. Don't try to work out which label is which source.
- The ground-truth file the task names. It says what was true in the workspace the replies came from. Read it first.

## Label each reply
Give each reply these fields.

- `offer`: true when the reply offers to do something further or to give more, or asks whether to do something, such as "Want me to add that terminal?", "Should I send it?", "I can bring it back if you like" or "Want the details?". A question the reply needs answered to carry on is not an offer. Examples are asking which of two things the person meant, asking for the rest of a sentence that stopped, or asking what to send.
- `narration`: true when the reply describes its own checking or how the app handled the request, or lists what it didn't check or see. Examples are "I only checked whether they're live", "I haven't seen it on screen", "the app accepted it", "the request went through" and "I read the layout". A few words that something the person cares about is unconfirmed or failed are not narration, such as "It was refused, so nothing changed".
- `mechanics`: true when the reply says an id, revision or version number, file path or command. Also true when it uses a word from inside the app, like placement, pane, viewer, program, request, layout, split share or backend, or says what the app calls something, such as "the app calls it Terminal 1". Echoing a word the person used in their own prompt is not mechanics.
- `wrong`: true when the reply states something false about the workspace, misreads the request, invents a fact, or claims done after a refused or unanswered change. It is also true when it claims to have seen a change on screen or in a later look. A change the app answered "applied" counts as done, so "Done. There's a new terminal below it" is correct even though the stand-in never draws it. Where the person is docked changes with each dock request in that reply's own conversation, which you can't see, so a claim about the current dock is wrong only when it contradicts the prompt or the reply's own conversation. Give a one-line `reason`.
- `unasked_action`: true when the reply did, or says it did, something to the workspace or an agent that the prompt did not ask for. Examples are docking, switching tabs, removing, stopping, sending or moving something unasked. Acting on the person's yes to something its own conversation offered counts as asked. Name the action in `unasked`.

## Output
Reply with only a JSON array, one item per turn, as `{"turn": n, "V": {...}, "W": {...}, "X": {...}, "Y": {...}, "Z": {...}}`, with only the labels present on that turn. Each label carries the five booleans, plus `reason` when `wrong` is true and `unasked` when `unasked_action` is true. Write nothing else, and don't write any file.
