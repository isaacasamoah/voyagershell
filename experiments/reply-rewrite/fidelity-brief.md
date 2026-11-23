# Check rewrites against the original reply

## Goal
VoyagerShell's background agent, Voyager, answers the person's voice requests aloud. A second pass rewrites each reply to make it plainer before the person hears it. The rewrite must keep every fact, number and name that matters, add nothing, and keep the meaning. It may cut offers to do more, narration of how Voyager checked, app words and ids, openers and closers. You are an independent checker. You did not write any of these replies or rewrites.

## Inputs
- `sheet.json`, in the folder this task names. Each turn has the person's prompt, Voyager's original reply, and up to three rewrites labelled A, B and C. The labels are shuffled per turn. Don't try to work out which label is which rewriter.

Judge each rewrite only against the original reply and the prompt. Don't judge whether the original was true. A rewrite that repeats a false claim from the original is faithful.

## Label each rewrite
- `added`: true when the rewrite states a fact, cause, count, name, capability, promise or action that the original does not state or plainly imply. Examples are naming a reason the original didn't give, saying something is done when the original only said it was asked for, or adding "I'll keep an eye on it".
- `changed`: true when the rewrite changes a number, a name, a yes or a no, who did something, or whether something is done, failed, running or unknown. Also true when it turns something uncertain into something definite, or the reverse, or misstates which thing the original meant.
- `dropped`: true when the rewrite leaves out a fact the person needed for what they asked, or drops a question the original needed answered to carry on. Cutting an offer, narration of checking, ids, app words, openers, closers or background is not a drop.
- `meaning`: true when a listener would come away with a different understanding of the situation than the original gives.
- `reason`: one line naming the fact when any of the four is true.

## Output
Reply with only a JSON array, one item per turn, as `{"turn": n, "A": {...}, "B": {...}, "C": {...}}`, with only the labels present on that turn. Each label carries the four booleans, plus `reason` when any is true. Write nothing else, and don't write any file.
