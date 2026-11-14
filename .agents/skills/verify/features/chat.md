# Chat

## Sub-features

The chat panel opens from the sidebar with an empty composer. A typed message
is sent with Return, starts the private provider once, and is drawn while the
reply is in progress. The reply streams in parts that extend each other, and
completes with Send drawn again. A provider error is drawn, and the next
message is a new turn on the same conversation.

## How to get to it (user POV)

Open the isolated fixture app with the sidebar open. Open the chat, type a
message and press Return. Watch the reply arrive. Send a message that fails,
then send another.

## Driving it with the maintained fixture

Follow the exact doctor and run commands in ../SKILL.md with `--journey chat`.
The Rust journey in tests/native/src/journey/chat.rs owns the recipe. The stand-in
provider in tests/native/src/provider.rs answers the app in place of Codex. The
conversation owner is app/src/conversation_client.rs, its reducer is
app/src/conversation.rs, the Codex frames are app/src/codex_protocol.rs, and the
panel is desktop/mods/header/chat.ts.

- `open-chat` clicks `chat-toggle`. The composer is drawn and empty, the send
  control reads Send, no message is drawn, and no provider has started.
- `send-message` types a message and presses Return. Exactly one stand-in
  starts, as a child of the app. The conversation asks for a read-only
  sandbox, no approvals, four tools and the profile's `conversation` folder.
  The turn carries the typed text and the saved context as its focus. The
  composer clears, and the message is drawn with the reply in progress.
- `streamed-reply` (the control case) streams `oru: the quiet ` and then
  `ocean`. Each part is judged while the reply is still in progress. The
  completed reply is unchanged, with Send drawn and no status or error.
- `provider-error` sends a message that the stand-in fails. The error is drawn
  and the message kept. The next message is a new turn on the same conversation
  and provider, and its reply is drawn.

## Negative control

tests/native/controls/chat.patch makes a streamed delta replace the reply
instead of extending it. A candidate built with it must fail `streamed-reply`
on the expectation `the second part extends the first while the reply is in
progress`, with the reply observed as `ocean`.

## Gotchas

This is the first cut of the design's twelve cases. Scrolling and following
the reply, a busy send refused, stopping mid-reply, workspace tools, a refresh
while chat is closed, the focus captured after a dock, the provider stopped by
Quit, and a lost provider are not driven yet, so the Python conversation
journeys stay. The stand-in's frames are written by hand and no pinned
app-server schema checks them. No real model is called. Linux evidence does not
establish another platform.
