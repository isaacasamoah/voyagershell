# Terminal input

## Sub-features

A typed command runs in the shell and its output is drawn. Keys reach a
program as the bytes a terminal sends, and they follow the modes that the
program asked for. Output is drawn when it arrives, without any input. A drag
selects text and draws the selection. Ctrl+Shift+C puts the selection on the X
clipboard, and Ctrl+Shift+V sends another client's clipboard text to the
program. Typing into one terminal works while another terminal floods.

## How to get to it (user POV)

Open the isolated fixture app and type a command into the first terminal. Run
a full-screen program and press keys in it. Print a line of text, drag across
it, copy it and paste it. Split the Vessel, start a flood in the first
terminal and type into the second.

## Driving it with the maintained fixture

Follow the exact doctor and run commands in ../SKILL.md with
`--journey terminal-input`. The Rust journey in
tests/native/src/journey/input.rs owns the recipe. Terminal product behavior
is owned by desktop/src/terminal.rs, terminal_screen.rs, terminal_view.rs and
terminal_input.rs in the selected candidate. The journey needs no sidebar
state and no window size.

Before its first case the journey checks two things about the fixture. The
fixture home must hold no shell startup file, and the verifier's clipboard
owner must return its own canary. Either failure ends the run `inconclusive`,
blamed on the fixture.

- `typed-command-runs` types `printf 'TYPED-%s\n' $((6*7))`. Core's screen
  must hold `TYPED-42`, which only a command that ran can print, and the
  capture must draw at least two more lines than before.
- `keys-reach-the-program` runs the `keys` probe and types `aZ~ 1`, Tab,
  Shift+Tab, BackSpace, Escape, Up, Down, Ctrl+C and Return. The probe must
  have received exactly those bytes, in order, with Tab as `0x09` and
  Shift+Tab as `ESC [ Z`. Every key after Tab arriving also shows that Tab
  left keyboard focus in the terminal. Ctrl+C must arrive as the byte `0x03` with the probe
  still the same process. Ctrl+D must end the probe and leave the shell the
  same program.
- `keys-follow-program-modes` runs the probe with `--application-cursor`. The
  four arrow keys must arrive as `ESC O A`, `ESC O B`, `ESC O C` and
  `ESC O D`.
- `output-drawn-without-input` runs the `draw` probe. After the `go` file the
  journey sends no input. Both blocks must be drawn, each in the cell that the
  program addressed and on one cell grid, and each must hold glyph ink. After
  the `back` file the capture must equal the capture from before `go`.
- `drag-selects-text` prints `COPYβ界` on a truecolor background and drags
  from one pixel inside the left edge of that box to one pixel inside its
  right edge. Every pixel that had the background colour must take one other
  colour, and nothing outside the row may change.
- `copy-puts-the-selection-on-the-clipboard` gives CLIPBOARD to the verifier
  with the text `VERIFIER-SENTINEL` and presses Ctrl+Shift+C. The verifier's
  clipboard client must lose CLIPBOARD and then read exactly `COPYβ界` from
  the new owner. The selection must stay drawn.
- `paste-sends-another-clients-text` types a probe command, which must clear
  the selection. The verifier takes CLIPBOARD with `PASTEβ界`, a newline and
  `line2`. With bracketed paste on, the probe must receive the text between
  `ESC[200~` and `ESC[201~` with the newline kept. With it off, the newline
  must arrive as a carriage return. For each paste, the verifier must have
  served a `UTF8_STRING` request from a client other than itself.
- `input-reaches-one-terminal-while-another-floods` splits the Vessel, runs
  `timeout 30 yes flood` in the first terminal and types
  `echo DURING-$((6*7))` into the second. The second shell must print
  `DURING-42` and its terminal must draw it while Core still reports `yes` or
  `timeout` in the first terminal's foreground. Ctrl+C in the first terminal
  must end the flood and leave its shell the same program.

Inspect `observations.json` for the bytes each probe received, and the
`clipboard` events in `actions.jsonl` for each request that the verifier
served, refused or lost.

## Negative control

tests/native/controls/terminal-input.patch makes Ctrl+Shift+C an ordinary key.
A candidate built with it must fail
`copy-puts-the-selection-on-the-clipboard` on the expectation
`another X client reads exactly COPYβ界 from the clipboard`, with
`VERIFIER-SENTINEL` observed. The five cases before it must pass.

## Gotchas

The journey covers one plain Bash with no startup files, on Linux X11 with
Mesa software rendering. Its gaps follow. Each one stays uncovered until a
journey claims it.

- Ctrl+Tab and Ctrl+Shift+Tab. The terminal reserves them for leaving the
  terminal, and no case checks that they move focus.
- A pump with no bounds. A candidate whose output pump has no byte or time
  limit passes the journey. In five paired runs, a key typed into the other
  terminal during the flood was echoed as soon on that candidate as on the
  unchanged one. The viewer hands the pump no bytes between Core's frames, so
  its loop still ends. The flood case proves that input reaches the other
  terminal during this flood, not that the limits exist.
- How soon the other terminal responds during a flood. The case allows 12 s
  for the output and 4 s for its drawing. On the owned display a key took up
  to 0.9 s to be echoed while the flood ran.
- Output drawn only on the next repaint. That candidate fails
  `typed-command-runs`, where the output arrives after the last key, so it
  never reaches `output-drawn-without-input`.
- Glyph shapes. A block must hold ink, but no case reads what the ink says.
  The colour of a selection is not judged either, only that it is one colour
  other than the plain one.
- Which process owns CLIPBOARD after a copy. The journey sees the verifier
  lose it to another window. The candidate is the only other client on the
  owned display, and the journey does not read the owner's process.
- Typed characters outside ASCII. XTEST types `' '` to `'~'` only. Paste
  covers Unicode.
- Lost keys in a long burst under load. The app drops a key that arrives
  while its queue of 64 frames for Core is full, which a long burst reaches
  on a loaded machine. See
  [Keys sent back to back can lose characters in the terminal](https://github.com/isaacasamoah/voyagershell/issues/108).
  The driver keeps 1 ms between key events and types a long shell line in
  pieces, each echoed before the next, so no case types such a burst.
- A shell with a line editor such as ble.sh, or with any startup file.
- A paste over 64 KiB, a copy with no selection, and a selection of more than
  one row, by word or by line.
- PRIMARY and middle-click paste, which the app does not offer.
- Mouse reports to programs, other than the wheel that `terminal-scrolling`
  covers.
- Input methods. Preedit and commit need an input method in the sandbox.
- The terminal's size. No case reads `stty size` after a window resize or a
  split.
- Input during output in a hidden Fleet, a terminal Portal, a refused or
  stale layout, and a shell that ends.
- Copy and paste in the canvas and in Notes. The Clipboard feature stays
  `python-only` in the registry for that reason.
- Where a lost key was lost. A failure shows the keys that were sent, in
  `actions.jsonl`, beside the bytes that arrived. It does not show whether X,
  the app or Core dropped one.
