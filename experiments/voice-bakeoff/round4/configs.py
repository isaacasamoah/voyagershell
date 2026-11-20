import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "round2"))
import names, hill
CONFIGS = {"base": {"spec": names.SPEC, "instructions": hill.INSTR_BASE}}
CONFIGS["h1_required"] = {"spec": names.SPEC, "instructions": hill.INSTR_BASE, "first_choice": "required"}

SPEC2 = names.SPEC + [
    ("go_home", "home", "Go to the Home view.", {}),
    ("open_voyage", "select-voyage", "Show a Voyage (space). Say 'Research Notes' or 'Voyager Shell'.", {"voyage": ("id", ("voyage",))}),
    ("hide", "set-placement-hidden", "Hide a Vessel (hidden true), or show it again (false).", {"target": ("id", ("vessel",))}),
]
CONFIGS["h2_tools"] = {"spec": SPEC2, "instructions": hill.INSTR_BASE, "first_choice": "required"}

def _desc(spec, words):
    return [(n, op, d + " " + words[n], refs) if n in words else (n, op, d, refs) for n, op, d, refs in spec]
WORDS3 = {
 "dock_to": "Use for: dock me to, take me to, put me on, go to (a Vessel, Fleet or Voyage) when the human wants to be there.",
 "open_fleet": "Use for: open, switch to, go to a Fleet or tab.",
 "open_voyage": "Use for: open, show, switch to a Voyage or space.",
 "maximize": "Use for: maximize, make fullscreen, make it big (maximized true); restore, shrink, normal size (false). Never for hiding or showing.",
 "hide": "Use for: hide, get rid of, put away (hidden true); unhide (false).",
 "reveal": "Use for: show me, bring up, where is, look at, find a Vessel. It does not change layout.",
 "rename": "Use for: rename, call, name. new_name is the new name only.",
 "move": "Use for: move, put, shift a Vessel left, right, above or below another.",
 "go_home": "Use for: go home, home screen, overview.",
}
CONFIGS["h3_words"] = {"spec": _desc(SPEC2, WORDS3), "instructions": hill.INSTR_BASE, "first_choice": "required"}

CONFIGS["h4_pass"] = {"spec": CONFIGS["h3_words"]["spec"], "instructions": hill.INSTR_PASS, "first_choice": "required", "workspace": hill.workspace_selected_first()}

CONFIGS["h5_position"] = dict(CONFIGS["h3_words"], position_fields=True)

CONFIGS["h6_ask_noargs"] = dict(CONFIGS["h3_words"], ask_noargs=True)
