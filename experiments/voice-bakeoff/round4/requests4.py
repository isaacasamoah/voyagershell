import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "round2"))
import world
has, tgt = world.has, world.tgt
def ctx(c, kind, id): return c["action"].get("context") == {"kind": kind, "id": id}
# (category, spoken, kind, grader, target words for the reply check)
# kind: effect | ambig (effect or a question is right) | handoff
R = [
 ("dock", "Dock me to Scout Dashboard.", "ambig", lambda c: has(c, operation="dock") and ctx(c, "voyage", "voyage-2"), "scout dashboard"),
 ("dock", "Dock onto the Research Notes voyage.", "effect", lambda c: has(c, operation="dock") and ctx(c, "voyage", "voyage-20"), "research notes"),
 ("dock", "Dock me to voyagershell 2.", "effect", lambda c: has(c, operation="dock") and ctx(c, "vessel", "placement-18"), "voyagershell 2"),
 ("dock", "Take me to the Notes vessel in Research Notes.", "effect", lambda c: has(c, operation="dock") and ctx(c, "vessel", "placement-23"), "notes"),
 ("dock", "Dock me to the Deploys fleet.", "effect", lambda c: has(c, operation="dock") and ctx(c, "fleet", "fleet-7"), "deploys"),
 ("dock", "Go home.", "effect", lambda c: has(c, operation="home"), "home"),
 ("dock", "Dock me to the top right vessel.", "effect", lambda c: has(c, operation="dock") and ctx(c, "vessel", "placement-16"), "notes"),
 ("dock", "Dock me on the Codex vessel.", "effect", lambda c: has(c, operation="dock") and ctx(c, "vessel", "placement-9"), "scout dashboard"),
 ("switch", "Open the Deploys fleet.", "effect", lambda c: has(c, operation="select-fleet", id="fleet-7"), "deploys"),
 ("switch", "Switch to the Main fleet in Research Notes.", "effect", lambda c: has(c, operation="select-fleet", id="fleet-21"), "research notes"),
 ("switch", "Show the Research Notes voyage.", "effect", lambda c: has(c, operation="select-voyage", id="voyage-20"), "research notes"),
 ("switch", "Go to the Deploys tab.", "effect", lambda c: has(c, operation="select-fleet", id="fleet-7"), "deploys"),
 ("switch", "Switch to the Voyager Shell voyage.", "effect", lambda c: has(c, operation="select-voyage", id="voyage-11"), "voyager shell"),
 ("switch", "Switch to Scout Dashboard.", "ambig", lambda c: has(c, operation="select-voyage", id="voyage-2"), "scout dashboard"),
 ("switch", "Open the Main fleet.", "ambig", lambda c: has(c, operation="select-fleet", id="fleet-12"), "main"),
 ("switch", "Take me to the Scout Dashboard voyage.", "effect", lambda c: has(c, operation="select-voyage", id="voyage-2"), "scout dashboard"),
 ("maximize", "Maximize the top right vessel.", "effect", lambda c: has(c, operation="set-placement-maximized", id="placement-16", maximized=True), "notes"),
 ("maximize", "Maximize voyagershell 2.", "effect", lambda c: has(c, operation="set-placement-maximized", id="placement-18", maximized=True), "voyagershell 2"),
 ("maximize", "Make Notes fullscreen.", "effect", lambda c: has(c, operation="set-placement-maximized", id="placement-16", maximized=True), "notes"),
 ("maximize", "Make the bottom right one fullscreen.", "effect", lambda c: has(c, operation="set-placement-maximized", id="placement-18", maximized=True), "voyagershell 2"),
 ("maximize", "Make the Codex vessel fullscreen.", "effect", lambda c: has(c, operation="set-placement-maximized", id="placement-9", maximized=True), "scout dashboard"),
 ("maximize", "Restore voyagershell 2.", "effect", lambda c: has(c, operation="set-placement-maximized", id="placement-18", maximized=False), "voyagershell 2"),
 ("reveal", "Show me the Codex vessel in Deploys.", "effect", lambda c: has(c, operation="reveal-placement", id="placement-9"), "scout dashboard"),
 ("reveal", "Bring up Notes in Research Notes.", "effect", lambda c: has(c, operation="reveal-placement", id="placement-23"), "notes"),
 ("reveal", "Where is voyagershell 2?", "effect", lambda c: has(c, operation="reveal-placement", id="placement-18"), "voyagershell 2"),
 ("reveal", "Look at the top right vessel.", "effect", lambda c: has(c, operation="reveal-placement", id="placement-16"), "notes"),
 ("rename", "Rename the vessel on the left to Planner.", "effect", lambda c: has(c, operation="rename", name="Planner") and tgt(c, "vessel", "placement-14"), "planner"),
 ("rename", "Rename voyagershell 2 to Build.", "effect", lambda c: has(c, operation="rename", name="Build") and tgt(c, "vessel", "placement-18"), "build"),
 ("rename", "Call the Research Notes voyage Roadmap.", "effect", lambda c: has(c, operation="rename", name="Roadmap") and tgt(c, "voyage", "voyage-20"), "roadmap"),
 ("rename", "Rename the Deploys fleet to Release.", "effect", lambda c: has(c, operation="rename", name="Release") and tgt(c, "fleet", "fleet-7"), "release"),
 ("move", "Move the top right vessel to the left of the vessel on the left.", "effect", lambda c: has(c, operation="move-placement", id="placement-16", target="placement-14", side="left"), "notes"),
 ("move", "Move voyagershell 2 to the right of Notes.", "ambig", lambda c: has(c, operation="move-placement", id="placement-18", target="placement-16", side="right"), "voyagershell 2"),
 ("move", "Put Notes below voyagershell.", "effect", lambda c: has(c, operation="move-placement", id="placement-16", target="placement-14", side="bottom"), "notes"),
 ("hide", "Hide the bottom right vessel.", "effect", lambda c: has(c, operation="set-placement-hidden", id="placement-18", hidden=True), "voyagershell 2"),
 ("hide", "Hide Notes.", "effect", lambda c: has(c, operation="set-placement-hidden", id="placement-16", hidden=True), "notes"),
 ("handoff", "Summarise what the build Fleet did today.", "handoff", None, ""),
 ("handoff", "What's blocked in the build Fleet?", "handoff", None, ""),
 ("handoff", "Ask the verifier to look at the avatar pull request.", "handoff", None, ""),
 ("handoff", "Tell the crew to rebase the pull request.", "handoff", None, ""),
 ("handoff", "Is the build green?", "handoff", None, ""),
 ("handoff", "Start a new terminal in Voyager Shell.", "handoff", None, ""),
 ("handoff", "Create a voyage called Research in home isaac research.", "handoff", None, ""),
 ("handoff", "Close the Billing voyage.", "handoff", None, ""),
 ("handoff", "Hide the middle vessel in the top row.", "handoff", None, ""),
 ("handoff", "What did Codex say about the migration?", "handoff", None, ""),
 ("handoff", "Start the verifier on the roadmap pull request.", "handoff", None, ""),
 ("handoff", "Stop the scratch terminal in the Experiment Fleet.", "handoff", None, ""),
]
HELD_OUT = [i for i in range(len(R)) if i % 3 == 2]
TUNE = [i for i in range(len(R)) if i % 3 != 2]
