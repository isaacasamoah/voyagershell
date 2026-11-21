WORKSPACE = [
    "Dock me to the Deploys fleet.", "Dock onto the Research Notes voyage.", "Dock me to voyagershell 2.", "Go home.",
    "Open the Deploys fleet.", "Switch to the Main fleet in Research Notes.", "Show the Research Notes voyage.", "Go to the Deploys tab.",
    "Maximize the top right vessel.", "Make Notes fullscreen.", "Restore voyagershell 2.", "Make the Codex vessel fullscreen.",
    "Rename the vessel on the left to Planner.", "Rename voyagershell 2 to Build.", "Call the Research Notes voyage Roadmap.",
    "Move the top right vessel to the left of the vessel on the left.", "Put Notes below voyagershell.", "Hide the bottom right vessel.", "Hide Notes.",
    "Where is voyagershell 2?", "Show me the Codex vessel in Deploys.", "Look at the top right vessel.",
    "Summarise what the build Fleet did today.", "What's blocked in the build Fleet?", "Ask the verifier to look at the avatar pull request.",
    "Tell the crew to rebase the pull request.", "Is the build green?", "Start a new terminal in Voyager Shell.",
    "Close the Billing voyage.", "What did Codex say about the migration?", "Stop the scratch terminal in the Experiment Fleet.",
    "Which vessels are in the Deploys fleet?", "How many fleets does Research Notes have?", "What is running in the Scout Dashboard voyage?",
]
SMALL = [
    "Hello.", "Hi there.", "How are you?", "What's up?", "Help.", "What can you do?", "Good morning.", "Thanks.", "Thank you, that's all.",
    "Can you hear me?", "Are you there?", "Who are you?", "Nice to meet you.", "You're quick.", "Good night.",
    "Say something.", "How do I talk to you?", "Okay, great.",
]
BORDERLINE = [
    "How's it going with the build?", "Anything I should know?", "What are you up to?", "Any news?", "What's going on?",
    "Are we good?", "Did anything break?", "How's the verifier doing?", "What's happening in the fleet?", "Is everything okay?", "Never mind.", "Cancel that.",
]
ITEMS = [(t, "workspace", True) for t in WORKSPACE] + [(t, "small", False) for t in SMALL] + [(t, "borderline", True) for t in BORDERLINE]
import random
_r = random.Random(7); _idx = list(range(len(ITEMS))); _r.shuffle(_idx)
ITEMS = [ITEMS[i] for i in _idx]
HELD_OUT = [i for i in range(len(ITEMS)) if i % 3 == 2]

FRESH = [
    ("Open the Roadmap voyage.", "workspace", True), ("Maximize voyagershell 3.", "workspace", True), ("Rename the Deploys fleet to Ship.", "workspace", True),
    ("Put the Codex vessel next to Notes.", "workspace", True), ("Which pull requests are waiting on a review?", "workspace", True),
    ("Did the migration finish?", "workspace", True), ("Hide the vessel on the right.", "workspace", True),
    ("Hey there, good to see you.", "small", False), ("I need some help.", "small", False), ("What are you able to do?", "small", False),
    ("That was great, thank you.", "small", False), ("See you later.", "small", False), ("Can you help me?", "small", False),
    ("Are you listening?", "small", False), ("Good afternoon.", "small", False),
    ("What's the story with the build?", "borderline", True), ("Is there anything I'm missing?", "borderline", True), ("What have you been doing?", "borderline", True),
    ("How are things looking?", "borderline", True), ("Is the crew stuck on anything?", "borderline", True), ("Scrap that.", "borderline", True),
]

FRESH2 = [
    ("Switch to the Billing fleet.", "workspace", True), ("Make voyagershell 4 fullscreen.", "workspace", True), ("Rename Notes to Scratchpad.", "workspace", True),
    ("Show me the verifier vessel.", "workspace", True), ("What is the avatar pull request waiting on?", "workspace", True),
    ("Ask the crew to run the checks again.", "workspace", True), ("Dock me to the Roadmap vessel.", "workspace", True),
    ("Morning.", "small", False), ("Hello, can you hear me?", "small", False), ("Help me out.", "small", False), ("What do you do?", "small", False),
    ("Thanks, that's perfect.", "small", False), ("Bye for now.", "small", False), ("You sound good.", "small", False), ("Hi, how's your day?", "small", False),
    ("How's everything going?", "borderline", True), ("Anything on fire?", "borderline", True), ("What's new with the crew?", "borderline", True),
    ("Where are we at?", "borderline", True), ("Forget I asked.", "borderline", True), ("Is it all working?", "borderline", True),
]
