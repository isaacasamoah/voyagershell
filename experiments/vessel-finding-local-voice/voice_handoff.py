"""Voice-front design: Omni never touches the workspace. It has one tool that hands the human's request
to a backing administrator agent (Codex or Claude Code), then speaks that agent's real answer.

Shared pieces for the typed (t10) and spoken (t11) versions of the test.
"""
import re

HANDOFF_TOOL = {"type": "function", "function": {
    "name": "ask_administrator",
    "description": ("Hand a workspace request to the backing administrator agent. It inspects and changes the "
                    "workspace (voyages, fleets, panels, sidebar, notes, worktrees, processes) and returns the real outcome."),
    "parameters": {"type": "object", "properties": {"request": {"type": "string",
                   "description": "The human's request, in their own words, with every name and path they gave."}},
                   "required": ["request"]}}}

INSTRUCTIONS = (
    "You are Voyager, the human's concise private voice companion. You cannot see or change the workspace yourself. "
    "For anything about the workspace (voyages, fleets, panels, tabs, the sidebar, notes, worktrees, processes), call "
    "ask_administrator with the human's request in their own words, then report its answer in one short sentence. "
    "Never say something was done or describe the workspace unless ask_administrator told you so. "
    "For greetings, thanks and small talk, answer briefly without calling it."
)

# (label, what the human says, should hand off?, words the handed-off request must keep)
REQUESTS = [
    ("rename fleet",     "Rename this fleet to Debugging.",                                   True,  ["debugging"]),
    ("close voyage",     "Close the Scout Dashboard voyage, I'm done with it.",               True,  ["scout dashboard", "close"]),
    ("select voyage",    "Switch over to the Scout Dashboard voyage.",                        True,  ["scout dashboard"]),
    ("create voyage",    "Create a new voyage called Research at /home/isaac/research.",      True,  ["research", "/home/isaac/research"]),
    ("maximize panel",   "Make the Claude panel fullscreen.",                                 True,  ["claude"]),
    ("hide panel",       "Hide the Notes panel in this fleet for now.",                       True,  ["notes", "hide"]),
    ("collapse sidebar", "Collapse the sidebar for me.",                                      True,  ["sidebar"]),
    ("create fleet",     "Add a new fleet called Experiments to the Scout Dashboard voyage.", True,  ["experiments", "scout dashboard"]),
    ("dock",             "Dock to the Research Notes voyage.",                                True,  ["research notes", "dock"]),
    ("select fleet",     "Switch to the Deploys fleet.",                                      True,  ["deploys"]),
    ("close (fresh)",    "Can you close Research Notes?",                                     True,  ["research notes", "close"]),
    ("open tab",         "Open the Deploys tab.",                                             True,  ["deploys"]),
    ("rename voyage",    "Rename the Scout Dashboard voyage to Scout.",                       True,  ["scout dashboard", "scout"]),
    ("hide claude",      "Hide Claude for a moment.",                                         True,  ["claude", "hide"]),
    ("new voyage",       "Start a voyage named Blog in /home/isaac/blog.",                    True,  ["blog", "/home/isaac/blog"]),
    ("no such voyage",   "Close the Billing voyage.",                                         True,  ["billing", "close"]),
    ("no such panel",    "Hide the Browser panel.",                                           True,  ["browser", "hide"]),
    ("question",         "Which voyages are open right now?",                                 True,  ["voyage"]),
    ("status question",  "What is running in the Deploys fleet?",                             True,  ["deploys"]),
    ("worktree",         "Make a new worktree for the billing fix.",                          True,  ["worktree", "billing"]),
    ("notes",            "Add a note that says call the bank tomorrow.",                      True,  ["call the bank tomorrow"]),
    ("spoken style",     "Um, can you, uh, close the scout dashboard one please.",            True,  ["scout dashboard", "close"]),
    ("two things",       "Close Research Notes and then switch to Scout Dashboard.",          True,  ["research notes", "scout dashboard"]),
    ("thanks",           "Thanks, that's all for now.",                                       False, []),
    ("greeting",         "Hello, can you hear me?",                                           False, []),
    ("sum",              "What is twelve times nine?",                                        False, []),
    ("joke",             "Tell me a quick joke.",                                             False, []),
    ("never mind",       "Never mind, forget it.",                                            False, []),
]

# what the backing agent returned -> must the spoken reply admit that nothing happened?
OUTCOMES = [
    ("Close the Scout Dashboard voyage, I'm done with it.", "Closed the Scout Dashboard voyage.", False),
    ("Switch to the Deploys fleet.", "Selected the Deploys fleet in Scout Dashboard.", False),
    ("Close the Billing voyage.", "Nothing was changed. No voyage named Billing exists. Open voyages: Scout Dashboard, Voyager Shell, Research Notes.", True),
    ("Hide the Browser panel.", "Nothing was changed. This fleet has no Browser panel. Its panels are Claude and Notes.", True),
    ("Create a new voyage called Research at /home/isaac/research.", "Failed: the folder /home/isaac/research does not exist. Nothing was created.", True),
    ("Collapse the sidebar for me.", "The request timed out before the workspace confirmed it. The outcome is unknown.", True),
    ("Which voyages are open right now?", "Three voyages are open: Scout Dashboard, Voyager Shell (selected) and Research Notes.", False),
]


def norm(s):
    return re.sub(r"[^a-z0-9/ ]+", " ", (s or "").lower())


def grade_handoff(r, want_call, keep):
    """-> (ok, shown)"""
    calls = r.get("calls") or []
    if not want_call:
        return (not calls), ("(spoke) " + r.get("content", "")[:90].replace("\n", " ") if not calls else "CALLED " + calls[0][1][:90])
    if not calls:
        return False, "(no hand-off) " + r.get("content", "")[:90].replace("\n", " ")
    req = (r.get("args") or {}).get("request", "")
    missing = [k for k in keep if norm(k).strip() not in norm(req)]
    return (not missing), req[:100] + (f"   <-- lost {missing}" if missing else "")
