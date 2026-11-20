# Report format

Write the report in plain words, with the outcome first.

1. **Outcome and scope.** The outcome, the commit the pass read, the kinds covered and the stage 1 results with their exit status and counts.
2. **Mismatches.** One block per entry:
   - the entry id and which part mismatches (wording, guard or check);
   - the evidence, as a file and line or a command and its output;
   - the proposed correction, as the replacement text or link, and whether it is an addition, a rewording, a removal or a product fix;
   - who decides. Name Isaac for any removal, any change of meaning and any dropped check.
3. **Ratchet candidates.** The entries and orphans that stage 4 found, each with the check or guard that could now serve it.
4. **Upkeep notes.** Gaps, envelope entries and out-of-scope entries whose named unit or fact no longer holds.
5. **Coverage.** One line for each class in `entry-classes.md`. Give how many entries, what was read and the evidence that supports "no mismatch" for the entries that had none. An empty result still needs this section.
6. **Unproved.** What the pass could not settle, such as a case read but not run, and why.

Do not paste the whole list. Keep any path outside the repository, any transcript and any personal detail out of a report that will be public.
