# Visible-output preflight experiment

This candidate checked Ghostty render-state dirty flags, the rendered cursor and colors before invalidating a clean terminal pane. Parsing, replies, credit and pending dirty work stayed with their existing owners. The accompanying patch contains the experimental implementation and real Screen checks. It is not applied to the application.

Four loaded runs used the same release binary, with the flag off, on, on, then off. The enabled runs skipped 15 and 13 output invalidations and reduced measured Pane construction from 25 per control run to 12 and 14. UI CPU did not fall, and glyph timing does not establish a latency gain. Global GPU load also differed in the last control. The change was rejected for the current latency target and removed from product source. Preserve full avatar animation and the existing renderer.

Private protocol, artifacts, all 48 verified glyphs, raw traces, controls and independent review remain under /var/tmp/voyager-typing-latency-20261108/visible-output-*. They are not committed evidence. The analysis counting window was corrected to include valid events between the first dispatch and first handler; the earlier result and failing control remain preserved. No Herdr parity, native release or foundation acceptance follows from this experiment.
