import json
import time
from pathlib import Path

from proof_conversation import provider_processes
from proof_workspace import core_rpc, named_button


def prove(
    *, native, capture, geometry, close, start_frame, evidence, session, env, journey
):
    assert journey == "conversation-voice"
    opened = True

    def voice():
        path = evidence / "voice.json"
        return json.loads(path.read_text()) if path.exists() else None

    def wait(get, predicate, label, seconds=90):
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            value = get()
            if value is not None and predicate(value):
                return value
            time.sleep(0.1)
        raise AssertionError(f"Timed out waiting for {label}: {value}")

    def button(name):
        x, y = named_button(native, evidence, name)
        bounds = geometry()
        native(
            "move", int(bounds["X"]) + round(x * 2), int(bounds["Y"]) + round(y * 2), 2
        )
        native("button", True)
        native("button", False)

    def document():
        return core_rpc(session, env, "doc.get", {"name": "voyager-layout-v1"})

    try:
        ready = wait(
            voice,
            lambda state: state["capability"]["kind"] != "checking",
            "voice discovery",
        )
        assert ready["capability"]["kind"] == "candidate", ready
        before = wait(
            document,
            lambda doc: bool(doc["value"]["contents"][0].get("backend")),
            "initial terminal",
        )
        address = before["value"]["contents"][0]["backend"]
        original = core_rpc(session, env, "terminal.get", {"terminal": address})
        capture("voice-before-activation")
        button("Start voice")
        active = wait(
            voice,
            lambda state: state["phase"] in ("active", "failed", "unconfirmed"),
            "native audio activation",
        )
        (evidence / "voice-activation.json").write_text(json.dumps(active, indent=2))
        capture("voice-activation-result")
        assert active["phase"] == "active", active
        assert active["capability"]["kind"] == "compatible"
        assert active["thread"] and active["realtimeSession"]
        providers = provider_processes(evidence)
        assert providers, "No owned native private provider was observed"
        (evidence / "voice-providers.json").write_text(json.dumps(providers, indent=2))
        button("Collapse sidebar")
        wait(
            document,
            lambda doc: doc["value"]["canvas"]["sidebarCollapsed"],
            "compact controls",
        )
        compact = voice()
        assert compact["phase"] == "active"
        assert compact["generation"] == active["generation"]
        assert compact["realtimeSession"] == active["realtimeSession"]
        assert document()["value"]["context"] == before["value"]["context"]
        capture("voice-compact-same-session")
        button("Expand sidebar")
        wait(
            document,
            lambda doc: not doc["value"]["canvas"]["sidebarCollapsed"],
            "primary controls",
        )
        assert voice()["generation"] == active["generation"]
        button("Stop voice")
        stopped = wait(
            voice,
            lambda state: state["phase"] in ("off", "failed", "unconfirmed"),
            "audio stop",
        )
        assert stopped["phase"] == "off" and stopped["error"] is None, stopped
        after = core_rpc(session, env, "terminal.get", {"terminal": address})
        assert after["pid"] == original["pid"] and after["state"] == "live"
        (evidence / "voice-observed.json").write_text(
            json.dumps(
                {
                    "active": active,
                    "compact": compact,
                    "stopped": stopped,
                    "terminalBefore": original,
                    "terminalAfter": after,
                    "intelligibleSpeechTested": False,
                },
                indent=2,
            )
        )
        capture("voice-stopped-terminal-live")
        close()
        opened = False
        return [
            "native-account-audio-connected",
            "same-audio-session-across-sidebar-change",
            "native-audio-stop-retains-terminal",
        ]
    finally:
        if opened:
            close()
        socket = Path(env["XDG_RUNTIME_DIR"]) / "herdr-core" / (session + ".sock")
        if socket.exists():
            core_rpc(session, env, "server.stop", {})
