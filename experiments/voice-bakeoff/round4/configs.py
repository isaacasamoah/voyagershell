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
