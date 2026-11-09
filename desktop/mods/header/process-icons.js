import { image, svg } from "gpui-kit";
export function processIcon(program) {
  const name = program
    ?.split(/[\\/]/)
    .pop()
    ?.toLowerCase()
    .replace(/\.exe$/, "");
  if (name === "codex" || name === "claude" || name === "claude-code")
    return image(name === "codex" ? "codex.svg" : "claude.svg")
      .size(14)
      .flex_shrink_0();
  if (name === "bash") return svg("bash.svg").size(14).flex_shrink_0();
  if (name === "activity") return svg("activity.svg").size(14).flex_shrink_0();
  return svg("note.svg").size(14).flex_shrink_0();
}
