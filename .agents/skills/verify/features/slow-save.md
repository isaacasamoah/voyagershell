# Front door under a slow save

## Sub-features

Every request to the app passes one front door. A request that changes nothing
is answered while Core is slow to confirm a layout save. A request that changes
something waits its turn behind that save and is then judged against the saved
layout.

## How to get to it (user POV)

Open the isolated fixture app with Core's `doc.set` replies held. Open the chat
and send a message, so the assistant has a turn. Create a Fleet from the Fleet
strip. While the app waits for Core, the assistant inspects the workspace, or
renames a Fleet.

## Driving it with the maintained fixture

Follow the exact doctor and run commands in ../SKILL.md with
`--journey slow-save`. The Rust journey in
tests/native/src/journey/slow_save.rs owns the recipe. The journey declares
`doc.set=1500`, so no `--core-delay` is needed. A `--core-delay` that holds
`doc.set` for at least 1000 ms replaces it. The app admits requests in
app/src/front_door.rs and sends the save from the owner in app/src/client.rs.

- `inspect-answered-during-held-save` creates a Fleet from the canvas and reads
  Core directly until Core holds it. The relay still holds Core's reply, so the
  app's save is in flight. The stand-in then plays one scripted workspace
  inspect. The app must return Applied, and the driver must have that reply
  before the relay's `releasedAtMs` for the save and in under a quarter of the
  hold. `played` records the round trip.
- `effect-answered-after-held-save` inspects first, creates a second Fleet the
  same way, then plays a scripted rename with the version from that inspect.
  The driver must have the reply at or after `releasedAtMs`. The app must
  refuse the rename because the layout changed, with no Core conflict, and the
  Fleet must keep its saved name.

## What a failure means

A product failure in the first case means that the app's owner waited for Core
before it took the inspect. A product failure in the second case means that a
change ran during the save, or ran against a layout the app had not saved yet.

The run ends `inconclusive`, blamed on the verifier, when `doc.set` is held for
under 1000 ms, or when the driver sent its scripted call after the save was
released. In both the two never overlapped, so the app was not tested.

## Known gaps

- Only the layout save of a canvas Fleet create is held in flight. The saves
  that open the new Fleet's terminal still block the app's owner.
- One scripted call is played during each held save. The app's list of waiting
  changes is never filled, so the busy refusal is not reached.
- Quit during a held save is not driven.
