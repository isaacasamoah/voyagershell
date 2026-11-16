# voyager: arrange your VoyagerShell workspace

`voyager` is the agent command for VoyagerShell. Run it inside a Vessel, which
is a terminal that VoyagerShell shows. It covers workspace actions only:
inspect, create a Fleet, rename, move and select. Herdr Core owns programs and
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

## Change the workspace

```sh
voyager do workspace '{"requestId":"crew-1","expectedVersion":"<version>","action":{"operation":"create-fleet","voyage":"<voyage id>","name":"Review"}}'
```

The offered operations are `inspect`, `create-fleet`, `rename`,
`move-voyage`, `move-fleet`, `move-placement`, `select-voyage` and
`select-fleet`. Any other operation is refused and nothing is queued.

- Give each change a new `requestId`. Repeating the same request returns its
  first result instead of acting twice.
- The exit code is 0 when the change applied, 1 when it was refused and 2 when
  its result is uncertain. After an uncertain result, run `voyager status`
  before you repeat anything.
- A refusal that says the layout changed means another change landed first.
  Run `voyager status` and use the new `version`.

## Authority

Your Vessel's socket tells VoyagerShell which Vessel is calling. That identity
is advisory. Nothing is enforced: the command acts with the person's
authority, and any program of the same user can reach the socket. The socket
exists only while the Vessel is placed. It is a Unix socket. Linux is the
verified platform, and Windows has no socket yet.
