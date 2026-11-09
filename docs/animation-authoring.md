# Create a Voyager animation pack

Status: experimental local browser format, version 1. The preview, player and builder used for the local trial are not included in this documentation-only PR. Native animation installation is not implemented. See [the proposal](../proposal.md) for adoption and validation work.

## Deliverable

Give the user one JSON manifest and the PNG images it names. Use a validated example from the matching authoring-tool release. The compact example below illustrates the format; supply the referenced sheet before loading it. Do not edit the player to create another animation. Keep an existing working pack until the user accepts the replacement.

The JSON is the editable source. A preview may generate a JavaScript data bootstrap for direct local-file opening. It must derive that bootstrap from the JSON, rather than maintaining two configurations. Use the build command supplied by that matching preview distribution.

In the local trial, custom packs do not need a build step. Open its preview and select the JSON and PNG files together. PNGs already beside the preview can be resolved by name. The browser cannot infer a selected JSON file's original folder, so select its images when they live elsewhere.

## Manifest

| Field | Meaning |
| --- | --- |
| `version` | Must be `1`. |
| `id` | A nonempty pack name shown in the preview. |
| `canvas.size` | Width and height, positive integers up to 4096. These are drawing coordinates, not desktop placement. |
| `canvas.anchor` | Shared destination `[x, y]` for the pose anchors. |
| `images` | Image ID to PNG basename. Names allow letters, numbers, underscore and hyphen. No paths or network URLs. |
| `poses` | Named complete drawings. Each has an `image` ID, source `rect: [x, y, width, height]`, local `anchor: [x, y]` within that rectangle and positive uniform `scale`. |
| `clips` | Named timelines. Each has `from`, a starting pose ID, `steps`, `easing` and `effects`. |
| `effects` | Named plasma definitions, or `{}` if unused. |

A pose's destination top-left is `canvas.anchor - pose.anchor * pose.scale`. Source rectangles must be integer pixels inside the decoded image. Alpha transparency is supported. Use the same actual head/body scale across drawings. A different crop size must not accidentally resize a limb.

Each timeline step is `{ "pose": "pose-id", "fadeMs": 120, "holdMs": 200 }`. It fades from the preceding pose, then holds. Zero fade means an immediate frame change. Zero hold is allowed. A clip must have a finite positive total duration. The player clamps to the start/end and does not loop automatically. The preview's Reverse runs the same timeline backward.

`easing` is `[x1, y1, x2, y2]` for a cubic curve, with all values in `0..1`. The existing stretch uses `[0.45, 0, 0.25, 1]`. Fades are weighted image blends, not calculated joint movement. Widely separated poses will still show doubled outlines. Draw closer intermediate poses when that happens.

An effect cue is `{ "effect": "backpack", "fromMs": 2180, "rampMs": 420 }`. Optional `endMs` ends a finite burst and must be later than `fromMs` and no later than the clip end. With an end, `rampMs` controls both fade-in and fade-out; a short window may never reach full power. Zero ramp switches immediately. Effect power follows clip time, including reverse. Without `endMs`, the effect remains visible at an ending pose while playback is active. Pause freezes the effect clock. Reduced motion suppresses pulsing.

A plasma definition has `kind: "plasma"`, four gradient `colors`, `coreColor`, `glowColor`, `pulsePx`, `pulseRate` and `emitters`. Each emitter has `position: [x, y]`, `angle` in radians, positive `length`, positive `width`, and `opacity` in `0..1`. Position uses canvas coordinates; angle zero points down. All emitters are drawn behind the character. Place their origins at the backpack outlets in the pose where the effect is used. Current emitters are fixed to canvas coordinates, so they do not automatically track a backpack moving between poses. Keep the effect off during those transitions or author a separate suitable clip.

Unknown fields, unknown poses/images/effects, invalid timing, bad rectangles and missing assets produce errors. They are not silently ignored. A failed import retains the previous working pack. Do not place JavaScript, prompts or executable snippets inside the manifest.

## Packs for separate triggers

Deliver a separate pack and entry clip for each independently triggered action.
Declare its starting pose through the clip's `from` field and its ending pose
through the last step. Reuse the exact same standing drawing and registration
when joining a standing action to a standing backflip.

Generate a full-sequence pack from those components rather than editing three
independent copies of the timings. Check matching canvas, easing, image/pose
definitions and end-to-start pose; shift bounded effect cues by each component's
offset. Each cue must fit inside its own component before shifting; a longer
combined clip must not conceal an invalid component window. Keep trigger-to-pack mappings in the host's catalogue, outside the
animation manifest. A browser preview trigger does not establish native event
wiring or permit changing workspace focus.

## Make the drawings

Start from the canonical `idle.png` and original stretch images. Use actual references on every generation. Keep the visor, suit fittings, backpack, pen linework and proportions consistent. New art is a candidate until visually accepted. Preserve generation prompts and references separately from the playback manifest. A saved prompt makes the process repeatable; it does not guarantee identical generated pixels.

Begin with a small action and one fixed camera. Include the exact original rest artwork when returning to canonical rest. Inspect the action at normal and half speed, including every last transition. Check continuous motion, helmet registration, limb lengths, equipment, silhouette, overlapping outlines, transparency and the final handoff. Functional checks alone cannot accept animation quality.

## Verify a custom pack

1. Obtain the matching preview distribution, then import the JSON plus PNGs. No preview command is shipped by this documentation-only PR.
2. Play its clips, pause, scrub and reverse. Check the expected start/end images.
3. Check reduced motion and a narrow window.
4. Try a copy with a missing pose or invalid crop. It must report its error and retain the usable pack.
5. Show the result and report remaining visual defects. Preview success does not install the animation or alter workspace focus.

Native integration must reuse the application's avatar owner. Moving an image on screen must not change user authority or dock context. This local player uses browser Canvas; it does not establish GPUI rendering, native performance or a Voyager animation installation API.

## Minimal two-pose example

This example expects a transparent 512 by 256 PNG named `astronaut-sheet.png`, with two complete 256 by 256 poses. Crop dimensions, scale and anchors must match the actual drawings.

```json
{
  "version": 1,
  "id": "two-pose-study",
  "canvas": { "size": [512, 512], "anchor": [256, 256] },
  "images": { "sheet": "astronaut-sheet.png" },
  "poses": {
    "rest": { "image": "sheet", "rect": [0, 0, 256, 256], "anchor": [128, 128], "scale": 1 },
    "wave": { "image": "sheet", "rect": [256, 0, 256, 256], "anchor": [128, 128], "scale": 1 }
  },
  "clips": {
    "wave": {
      "from": "rest",
      "steps": [
        { "pose": "wave", "fadeMs": 120, "holdMs": 500 },
        { "pose": "rest", "fadeMs": 120, "holdMs": 200 }
      ],
      "easing": [0.45, 0, 0.25, 1],
      "effects": []
    }
  },
  "effects": {}
}
```
