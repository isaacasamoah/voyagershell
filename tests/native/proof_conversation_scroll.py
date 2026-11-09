import hashlib
import json
import os
import time
from pathlib import Path

from PIL import ImageChops

from proof_workspace import core_rpc
from proof_process import observe_core_exit


def prove(
    *, native, capture, geometry, close, start_frame, evidence, session, env, journey
):
    socket = None
    wrapper = None
    original = None
    observed = {
        "kind": "replayed-public-view-data-diagnostic",
        "limit": "No fresh model turn or proof of the original session's visible answer.",
        "events": [],
    }
    replacement = """export const observe = (() => {
  const recorded = SNAPSHOT;
  if (!conversationSnapshot(recorded))
    throw Error("Invalid recorded public Snapshot");
  let idle;
  return async (after) => {
    if (!idle) {
      idle = JSON.parse(await snapshot(null));
      if (
        !conversationSnapshot(idle) ||
        idle.thread !== null ||
        idle.turn !== null ||
        idle.phase !== "idle"
      )
        throw Error("View replay requires an unused private conversation");
    }
    if (after !== recorded.version) return recorded;
    if (JSON.parse(await snapshot(idle.version)) !== null)
      throw Error("The private conversation changed during view replay");
    return null;
  };
})();
"""
    errors = []

    def rpc(method, params):
        assert socket is not None and socket.is_socket(), (
            "The dedicated Core socket is absent"
        )
        assert env.get("HC_SESSION", session) == session
        assert env.get("HC_SOCKET", str(socket)) == str(socket)
        return core_rpc(session, env, method, params)

    def move(frame, x, y):
        bounds = geometry()
        native(
            "move",
            int(bounds["X"]) + round(x * int(bounds["WIDTH"]) / frame.width),
            int(bounds["Y"]) + round(y * int(bounds["HEIGHT"]) / frame.height),
            2,
        )

    try:
        socket = Path(env["XDG_RUNTIME_DIR"]) / "herdr-core" / (session + ".sock")
        assert journey == "conversation-scroll"
        source = Path(env["VOYAGER_PROOF_PUBLIC_SNAPSHOT"])
        assert source.is_absolute() and source.is_file()
        raw = source.read_bytes()
        assert len(raw) <= 262144, "Use a bounded recorded public Snapshot"
        recorded = json.loads(raw)
        assert recorded["phase"] == "completed" and recorded["messages"]
        wrapper = evidence / "profile/mods/header/conversation.js"
        original = wrapper.read_bytes()
        marker = "export async function observe(after) {"
        assert original.decode().count(marker) == 1
        observed.update(
            {
                "source": str(source),
                "snapshotSha256": hashlib.sha256(raw).hexdigest(),
                "originalWrapperSha256": hashlib.sha256(original).hexdigest(),
            }
        )
        replacement = replacement.replace(
            "SNAPSHOT", json.dumps(recorded, ensure_ascii=True)
        )
        deadline = time.monotonic() + 15
        while not socket.is_socket():
            assert time.monotonic() < deadline, "Dedicated Core socket did not appear"
            time.sleep(0.05)
        while True:
            before = rpc("doc.get", {"name": "voyager-layout-v1"})
            if before["value"]["contents"] and all(
                content.get("backend") for content in before["value"]["contents"]
            ):
                break
            assert time.monotonic() < deadline, "Initial terminals were not bound"
            time.sleep(0.05)
        observed["coreBefore"] = rpc("server.status", {})
        observed["layoutBefore"] = before
        temporary = wrapper.with_suffix(".tmp")
        temporary.write_text(original.decode().split(marker)[0] + replacement)
        os.replace(temporary, wrapper)
        observed["replayWrapperSha256"] = hashlib.sha256(
            wrapper.read_bytes()
        ).hexdigest()
        time.sleep(1)
        initial = capture("conversation-scroll-before-open")
        assert initial.size == (1450, 940), "Use the measured Chat viewport"
        move(initial, 64, 108)
        native("button", True)
        native("button", False)
        owner = evidence / "conversation.json"
        while not owner.exists():
            assert time.monotonic() < deadline, "Chat did not observe the private owner"
            time.sleep(0.05)
        time.sleep(0.3)
        frames = [capture("conversation-scroll-start")]
        for direction, delta in (("down", 96), ("up", -96)):
            move(frames[-1], 180, 400)
            for _ in range(8):
                native("scroll", delta, 0)
                observed["events"].append([delta, 0])
                time.sleep(0.08)
            native("scroll", 0, 1)
            observed["events"].append([0, 1])
            time.sleep(0.3)
            frames.append(capture("conversation-scroll-" + direction))
            difference = ImageChops.difference(
                frames[-2].crop((32, 210, 336, 580)),
                frames[-1].crop((32, 210, 336, 580)),
            ).getbbox()
            observed[direction + "MessagePixelDifference"] = difference
        observed["privateOwner"] = json.loads(owner.read_text())
        assert observed["privateOwner"]["phase"] == "idle"
        assert observed["privateOwner"]["thread"] is None
        assert observed["privateOwner"]["turn"] is None
        assert observed["privateOwner"]["messages"] == []
        observed["layoutAfter"] = rpc("doc.get", {"name": "voyager-layout-v1"})
        assert observed["layoutAfter"] == before
        observed["coreAfter"] = rpc("server.status", {})
        assert observed["coreAfter"]["pid"] == observed["coreBefore"]["pid"]
        assert (
            observed["coreAfter"]["core"]["id"] == observed["coreBefore"]["core"]["id"]
        )
    except BaseException as error:
        observed["primaryFailure"] = f"{type(error).__name__}: {error}"
        try:
            capture("conversation-scroll-failure")
        except Exception as failure:
            observed["captureFailure"] = str(failure)
        raise
    finally:
        for operation, effect in (
            ("native-quit", close),
            ("dedicated-core-exit", lambda: observe_core_exit(session, env)),
        ):
            try:
                effect()
            except Exception as error:
                errors.append({"operation": operation, "error": str(error)})
        if wrapper is not None and original is not None:
            try:
                wrapper.write_bytes(original)
                observed["wrapperRestored"] = wrapper.read_bytes() == original
                assert observed["wrapperRestored"]
            except Exception as error:
                errors.append({"operation": "restore-wrapper", "error": str(error)})
        observed["cleanupErrors"] = errors
        observed["socketAbsent"] = socket is not None and not socket.exists()
        (evidence / "conversation-scroll-observed.json").write_text(
            json.dumps(observed, indent=2)
        )
        if errors and "primaryFailure" not in observed:
            raise AssertionError(f"Owned cleanup failed: {errors}")
    return [
        "recorded-public-view-data-captured-for-review",
        "native-scroll-movements-and-separate-finish-in-both-directions",
        "private-owner-idle-and-workspace-identity-retained",
        "isolated-wrapper-restored-and-owned-quit-receipt",
    ]
