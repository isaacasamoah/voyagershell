import json
import os
import subprocess
import time
from pathlib import Path

from proof_process import process_identity, observe_core_exit
from proof_workspace import core_rpc, named_button, stop_existing_core, wait as poll


def prove(*, native, capture, geometry, close, start_frame, evidence, session, env, journey):
    assert journey == "agent-authority" and session.startswith("voyager-authority-")
    assert env.get("VOYAGER_AUTHORITY_EXPERIMENT") == "1"
    app = json.loads((evidence / "launch.json").read_text())
    profile = evidence / "profile"
    socket = profile / "coordination/agent.sock"
    assert len(os.fsencode(socket)) < 104
    core_socket = Path(env["XDG_RUNTIME_DIR"]) / "herdr-core" / (session + ".sock")
    def rpc(method, params=None):
        assert method in {"doc.get", "terminal.get", "terminal.list", "terminal.read", "server.status"}, "Only observations may be retried"
        for attempt in range(3):
            assert core_socket.is_socket(), "Owned Core socket is absent; do not recreate it"
            try:
                return core_rpc(session, env, method, params or {})
            except subprocess.TimeoutExpired as error:
                record = {"method": method, "attempt": attempt + 1, "at": time.time(), "timeoutSeconds": error.timeout}
                with (evidence / "observation-timeouts.jsonl").open("a") as log:
                    log.write(json.dumps(record) + "\n")
                if attempt == 2 or time.time() + 5 > float(env["VOYAGER_AUTHORITY_TRIAL_DEADLINE"]):
                    raise
    document = lambda: rpc("doc.get", {"name": "voyager-layout-v1"})["value"]
    deadline = time.monotonic() + min(840, float(env.get("VOYAGER_AUTHORITY_TRIAL_DEADLINE", str(time.time() + 840))) - time.time())
    def wait(get, predicate, label, seconds=20):
        remaining = deadline - time.monotonic()
        assert remaining > 0, "The 15-minute authority trial bound was reached"
        return poll(get, predicate, label, min(seconds, remaining))
    observed = {"journey": journey, "startedUtc": time.time(), "modelLimit": 3}
    protected_records = json.loads(Path("/var/tmp/voyager-rank-hats-20261109/protected-before.json").read_text())["identities"]
    active = json.loads(Path("/home/isaac/.local/share/voyagershell-foundation/active-preview.json").read_text())
    protected_records[str(active["pid"])] = active["identity"]
    observed["protectedCohort"] = "Surviving identities from the retained 12-process cohort plus the current active-preview viewer. This is not a complete user-process inventory."
    protected = {}
    for pid in protected_records:
        try:
            protected[pid] = process_identity(int(pid), metadata_only=True)
        except FileNotFoundError:
            observed.setdefault("previouslyAbsentProtected", []).append(pid)
    assert str(active["pid"]) in protected, "The selected working app must remain running"
    assert all(protected[str(active["pid"])][key] == active["identity"][key] for key in ("uid", "start", "executable")), "The selected working app identity changed"
    observed["protectedBefore"] = protected
    prompts = evidence / "tasks"
    prompts.mkdir()
    prefix = f"This is the bounded authorized Voyager authority trial. Begin every human-facing reply with oru:. Work only in {evidence}. Do not spawn internal agents or change any current user project. Use $VOYAGER_AGENT_BIN for coordination. Save actual command JSON results in {evidence}. Do not invent success or retry an uncertain operation. Use result REQUEST_ID instead. Always save each requested actual command response while its received messages are still pending, before acknowledging them. Every nonce reply must use the exact requested nonce as the entire conversation text, without added words, formatting, or punctuation. Stop after completing your task. "
    crew_task = prefix + "You are Trial Crew. Inspect and discover your supervisor. Send your supervisor a short question asking for the test nonce. Inspect or wait for its reply, save the actual inspect response to crew-reply.json before acknowledging the reply. Attempt instruct on your supervisor with a harmless test task; save the actual refusal JSON to crew-refusal.json. After the refusal, send your supervisor a message confirming conversation still works. Escalate 'Crew fixture decision', context 'Only this isolated trial', decision 'May I report the fixture result?', blast radius 'No project files; this trial only'. Wait for the supervisor decision and save the actual inspect response JSON to crew-decision.json. Also wait for an instruction addressed to you. Save the actual inspect response with the first received instruction as crew-instruction.json BEFORE acknowledging it. Then acknowledge and perform its harmless request by sending the requested nonce result to the original sender. Wait for and answer both the Captain instruction and the later Admiral instruction before finishing. Use a shell wait loop if needed, but retain real command results."
    captain_task = prefix + f"You are the Fleet root. Inspect, then wait until the human promotes you to Captain. Start ONE Crew in your own Fleet named 'Trial Crew' with this task: Read {prompts / 'crew.md'} and carry it out. Save the real Start response to captain-start.json. Never start a second Crew. Inspect/wait for the Crew's question, send it exactly VOYAGER-PEER-OK as the entire message and acknowledge its question. Resolve the Crew fixture escalation with approve. Instruct your assigned Crew to send the original sender exactly VOYAGER-WORK-OK as the entire message, with no other text. Save the actual instruction response to captain-instruct.json. Wait for the Crew work-result conversation containing VOYAGER-WORK-OK and save that actual inspect response to captain-work-result.json. Once these steps finish, save your actual latest inspect response to captain-ready.json, then find the other agent in your Voyage whose fleet is null and rank is crew. That is the Portal agent even when its visible name is Terminal 1. Do not search for an agent named Portal Crew. Wait only while that placement-and-rank match is absent. Attempt instruct on that unassigned Portal agent with a harmless report request; save the actual scope refusal to captain-outscope.json. After that refusal send it a conversation message. Then wait for the human to promote you to Commodore. After promotion save inspect to commodore-ready.json. You may receive an Admiral instruction whose final target is Trial Crew. Forward that exact message using forward, not a new instruction, and save the real response to commodore-forward.json. Finish only after forwarding it."
    admiral_task = prefix + "You are the Portal root. Inspect, then wait until the human promotes you to Admiral. Wait until Trial Crew and a Commodore exist. Instruct Trial Crew to send the original sender exactly VOYAGER-ADMIRAL-OK as the entire message, with no other text. Save the real routed response to admiral-instruct.json. Escalate three separate human decisions with titles 'Approve fixture', 'Deny fixture', 'Written fixture reply'. Each context is 'Testing the isolated authority candidate', decision is 'Please answer this trial request', blast radius is 'Only this temporary trial; no user files'. There is no higher supervisor, so these go to the human Inbox. Wait for all three real decisions and the Crew conversation VOYAGER-ADMIRAL-OK. Keep these received messages unacknowledged until you save the requested response. Create admiral-decisions.json only after inspect contains all three human decisions with kinds approve, deny and reply, linked to your three escalation IDs, and the exact Crew conversation VOYAGER-ADMIRAL-OK. Save that actual complete inspect response without rewriting it. Finish with a concise report."
    for name, text in (("crew", crew_task), ("captain", captain_task), ("admiral", admiral_task)):
        (prompts / f"{name}.md").write_text(text + "\n")

    (prompts / "initial.md").write_text(f"Use $VOYAGER_AGENT_BIN inspect. Find your own Agent using snapshot.current.id. If its fleet is null, read {prompts / 'admiral.md'} and execute that task. Otherwise read {prompts / 'captain.md'} and execute that task. Do not start any internal sub-agent.\n")
    launches = json.loads((profile / "launches.json").read_text())
    launches["entries"].append({"id": "trial-root", "name": "Trial Root", "launch": {"kind": "program", "argv": ["codex", "--no-daemon", "--model", "gpt-6.1-sol", "-c", 'model_reasoning_effort="high"', "--dangerously-bypass-approvals-and-sandbox", "--", f"Read {prompts / 'initial.md'} and execute this bounded trial."]}})
    (profile / "launches.json").write_text(json.dumps(launches, indent=2) + "\n")

    def press(name, index=None, roles=("push button", "button", "menu item", "menu_item")):
        if index is None:
            point = named_button(native, evidence, name, roles=roles)
        else:
            terminals = wait(lambda: native("fields", app["pid"], ["Terminal"], "window")["fields"], lambda items: any(item["width"] > 0 and item["height"] > 0 for item in items), "visible terminal before hover")
            terminal = min((item for item in terminals if item["width"] > 0 and item["height"] > 0), key=lambda item: item["x"])
            bounds = geometry()
            native("move", int(bounds["X"]) + terminal["x"] + 12, int(bounds["Y"]) + terminal["y"] + 12, 2)
            time.sleep(0.2)
            fields = native("fields", app["pid"], [name], "window")["fields"]
            fields = sorted((item for item in fields if item["width"] > 0 and item["height"] > 0), key=lambda item: (item["x"], item["y"]))
            assert fields and index < len(fields), (name, fields)
            item = fields[index]
            point = ((item["x"] + item["width"] / 2) / 2, (item["y"] + item["height"] / 2) / 2)
        for attempt in range(4):
            bounds = geometry()
            native("move", int(bounds["X"]) + round(point[0] * 2), int(bounds["Y"]) + round(point[1] * 2), 2)
            time.sleep(0.15)
            if index is not None:
                break
            latest = named_button(native, evidence, name, roles=roles)
            if point == latest:
                break
            point = latest
        else:
            raise AssertionError("Control did not settle before click: " + name)
        native("button", True)
        native("button", False)

    def text(value):
        for character in value:
            key = 65293 if character == "\n" else ord(character)
            native("key", key, True)
            native("key", key, False)

    def file(name, seconds=180):
        path = evidence / name
        def read():
            try:
                return json.loads(path.read_text())
            except (FileNotFoundError, json.JSONDecodeError):
                return None
        return wait(read, lambda value: value is not None, name, seconds)

    def promote(panel, rank):
        press(f"Promote to {rank.title()} for {panel['name']}")
        return wait(document, lambda value: any(item["id"] == panel["content"] and item.get("rank") == rank for item in value["contents"]), rank + " saved by application")

    def prompt(panel, task):
        bound = wait(document, lambda value: any(item["id"] == panel["content"] and item.get("backend") for item in value["contents"]), "saved backend for " + task)
        content = next(item for item in bound["contents"] if item["id"] == panel["content"])
        wait(lambda: rpc("terminal.get", {"terminal": content["backend"]}), lambda value: (value.get("foreground") or {}).get("name") == "codex", "real Codex foreground")
        screen = lambda: rpc("terminal.read", {"terminal": content["backend"], "lines": 50})["text"]
        startup = wait(screen, lambda value: "Trust this folder?" in value or ("OpenAI Codex" in value and "gpt-6.1-sol" in value.lower()), "Codex startup interface", 45)
        if "Trust this folder?" in startup:
            assert app["identity"]["cwd"] in startup and "1. Trust and continue" in startup
            fields = native("fields", app["pid"], ["Terminal"], "window")["fields"]
            fields = sorted((item for item in fields if item["role"] == "terminal" and item["width"] > 0), key=lambda item: item["x"])
            assert len(fields) >= 2, fields
            target = fields[-1] if task == "admiral" else fields[1]
            bounds = geometry()
            native("move", int(bounds["X"]) + target["x"] + target["width"] // 2, int(bounds["Y"]) + target["y"] + target["height"] // 2, 2)
            native("button", True)
            native("button", False)
            native("key", 65293, True)
            native("key", 65293, False)
            wait(screen, lambda value: "Trust this folder?" not in value, "accepted owned fixture folder", 30)
        observed.setdefault("startupPrompts", []).append({"placement": panel["id"], "task": task, "backend": content["backend"], "method": "Actual Codex positional startup prompt from isolated launch configuration", "startupScreen": startup})

    owned = []
    try:
        initial = wait(document, lambda value: bool(value.get("voyages")), "initial Voyage")
        voyage = initial["voyages"][0]
        context = initial["context"]
        press("Split Vessel right", 0)
        press("Create Inbox Vessel")
        wait(document, lambda value: any(item["typeId"] == "inbox" for item in value["contents"]), "Inbox creation")
        press("Split Vessel right", 0)
        press("Create Trial Root Vessel")
        fleet = wait(document, lambda value: len(value["voyages"][0]["fleets"][0]["vessels"]) == 3, "Fleet Codex creation")["voyages"][0]["fleets"][0]
        root = next(panel for panel in fleet["vessels"] if next(item for item in document()["contents"] if item["id"] == panel["content"]).get("launch", {}).get("kind") == "program")
        prompt(root, "captain")
        promote(root, "captain")
        captain = file("captain-ready.json", 240)
        crew = file("crew-reply.json")
        captain_id = captain["snapshot"]["current"]
        crew_id = crew["snapshot"]["current"]
        assert captain_id["kind"] == crew_id["kind"] == "agent" and captain_id != crew_id
        captain_agent = next(item for item in captain["snapshot"]["agents"] if item["id"] == captain_id["id"])
        crew_agent = next(item for item in crew["snapshot"]["agents"] if item["id"] == crew_id["id"])
        assert captain_agent["content"] == root["content"] and captain_agent["rank"] == "captain"
        assert crew_agent["content"] == file("captain-start.json")["created"] and crew_agent["rank"] == "crew"
        def received(response, sender, recipient, kind):
            assert response["outcome"] == "applied"
            return [message for message in response["snapshot"]["messages"] if message["from"] == sender and message["to"] == recipient and message["payload"]["kind"] == kind]
        assert any(message["payload"]["text"] == "VOYAGER-PEER-OK" for message in received(crew, captain_id, crew_id, "conversation"))
        work = file("captain-work-result.json")
        assert any(message["payload"]["text"] == "VOYAGER-WORK-OK" for message in received(work, crew_id, captain_id, "conversation"))
        instruction = file("crew-instruction.json")
        assert any(message["payload"]["target"] == crew_id["id"] for message in received(instruction, captain_id, crew_id, "instruction"))
        refusal = file("crew-refusal.json")
        assert refusal["outcome"] == "refused" and refusal["snapshot"]["current"] == crew_id, refusal
        assert file("captain-start.json")["outcome"] == "applied"
        assert file("captain-instruct.json")["outcome"] == "applied"
        crew_decision = file("crew-decision.json")
        assert any(message["payload"]["decision"]["kind"] == "approve" for message in received(crew_decision, captain_id, crew_id, "decision"))
        capture("authority-captain-and-crew")
        press("Show Portals")
        press("Create Trial Root Portal")
        portal = wait(document, lambda value: len(value["voyages"][0]["portals"]) == 1, "Portal Codex creation")["voyages"][0]["portals"][0]
        prompt(portal, "admiral")
        outscope = file("captain-outscope.json")
        assert outscope["outcome"] == "refused" and "scope" in outscope["message"].lower(), outscope
        promote(root, "commodore")
        file("commodore-ready.json")
        promote(portal, "admiral")
        press("Embed Portals")
        for label in ("Approve Approve fixture", "Deny Deny fixture"):
            wait(lambda: native("fields", app["pid"], [label], "window")["fields"], bool, label, 180)
            capture("authority-pending-" + label.split()[0].lower())
            press(label)
            wait(lambda: native("fields", app["pid"], [label], "window")["fields"], lambda fields: not fields, label + " resolved and removed")
        field = "Write reply to Written fixture reply"
        wait(lambda: native("fields", app["pid"], [field], "window")["fields"], bool, "written response editor", 180)
        press(field, roles=("text", "text field", "entry"))
        wait(lambda: native("fields", app["pid"], [field], "window")["fields"], lambda fields: len(fields) == 1 and fields[0]["focused"], "written reply focus before typing")
        capture("authority-reply-focused")
        stream = json.loads((evidence / "authority-reply-focused-compositor.json").read_text())
        native("record-start", str(evidence / "authority-written-reply.webm"), stream)
        text("Keep this within the isolated trial.")
        time.sleep(0.3)
        capture("authority-written-reply")
        time.sleep(0.7)
        capture("authority-written-reply-settled")
        observed["replyVideo"] = native("record-stop")["recording"]
        observed["replyCaptureSettleSleepsSeconds"] = [0.3, 0.7]
        press("Reply to Written fixture reply")
        decisions = file("admiral-decisions.json", 180)
        admiral_id = decisions["snapshot"]["current"]
        admiral_agent = next(item for item in decisions["snapshot"]["agents"] if item["id"] == admiral_id["id"])
        assert admiral_agent["content"] == portal["content"] and admiral_agent["rank"] == "admiral" and admiral_agent["fleet"] is None
        answers = received(decisions, {"kind": "user"}, admiral_id, "decision")
        escalations = {message["id"]: message for message in received(decisions, admiral_id, {"kind": "user"}, "escalation")}
        expected = {"Approve fixture": "approve", "Deny fixture": "deny", "Written fixture reply": "reply"}
        matched = set()
        for message in answers:
            payload = message["payload"]
            original = escalations[payload["inReplyTo"]]
            title = original["payload"]["title"]
            assert payload["decision"]["kind"] == expected[title]
            if title == "Written fixture reply":
                assert payload["decision"]["text"] == "Keep this within the isolated trial."
            matched.add(title)
        assert matched == set(expected)
        assert any(message["payload"]["text"] == "VOYAGER-ADMIRAL-OK" for message in received(decisions, crew_id, admiral_id, "conversation"))
        forwarded = file("commodore-forward.json")
        assert forwarded["outcome"] == "applied"
        assert file("admiral-instruct.json")["outcome"] == "applied"
        press("Show or hide agent messages")
        observed["messageFields"] = native("fields", app["pid"], None, "window")["fields"]
        capture("authority-inbox-decisions")
        final = document()
        assert final["context"] == context
        programs = rpc("terminal.list", {"all": True})["terminals"]
        observed["programs"] = programs
        assert len([item for item in final["contents"] if (item.get("launch") or {}).get("kind") in ("codex", "program")]) == 3
        target = next(item for item in final["contents"] if item["id"] == root["content"])
        command_env = dict(env, VOYAGER_AGENT_CONTENT=target["id"], VOYAGER_AGENT_SOCKET=str(socket))
        command = Path(app["command"][0]).with_name("voyager-agent")
        refused = subprocess.run([str(command), "inspect"], env=command_env, text=True, capture_output=True, timeout=35)
        observed["unboundCaller"] = {"code": refused.returncode, "stdout": refused.stdout, "stderr": refused.stderr}
        assert refused.returncode != 0 and json.loads(refused.stdout)["outcome"] == "refused"
        observed["passed"] = True
    except BaseException as error:
        observed["failure"] = f"{type(error).__name__}: {error}"
        try:
            capture("authority-failure")
        except Exception as capture_error:
            observed["captureError"] = str(capture_error)
        raise
    finally:
        cleanup_errors = []
        try:
            pids = {rpc("server.status")["pid"]}
            for item in rpc("terminal.list", {"all": True})["terminals"]:
                pids.update(pid for pid in (item.get("pid"), (item.get("foreground") or {}).get("pid")) if pid)
            for pid in pids:
                try:
                    owned.append({"pid": pid, **process_identity(pid, metadata_only=True)})
                except FileNotFoundError:
                    observed.setdefault("alreadyExitedOwned", []).append(pid)
        except Exception as error:
            cleanup_errors.append("Process observation: " + str(error))
        try:
            close()
        except Exception as error:
            cleanup_errors.append("Viewer Quit: " + str(error))
        try:
            if core_socket.exists():
                stop_existing_core(session, env)
            observed["ownedExit"] = observe_core_exit(session, env, owned)
        except Exception as error:
            cleanup_errors.append("Owned Core stop: " + str(error))
        observed["protectedAfter"] = {}
        for pid, identity in protected.items():
            try:
                actual = process_identity(int(pid), metadata_only=True)
                observed["protectedAfter"][pid] = actual
                if actual != identity:
                    cleanup_errors.append("Protected process identity changed: " + pid)
            except FileNotFoundError:
                cleanup_errors.append("Protected process disappeared: " + pid)
        observed["cleanupErrors"] = cleanup_errors
        observed["finishedUtc"] = time.time()
        (evidence / "authority.json").write_text(json.dumps(observed, indent=2))
        if cleanup_errors and "failure" not in observed:
            raise AssertionError(cleanup_errors)
    return ["real-agent-conversation", "captain-creates-and-instructs-crew", "commodore-forwards-admiral-work", "supervisor-or-human-escalation", "native-inbox-decisions", "unbound-caller-refused"]
