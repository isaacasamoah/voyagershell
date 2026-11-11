"""A spoken request through the whole loop: Omni hears it, an acting agent performs it, Omni reads the answer aloud.

usage: voice_loop.py [--settings FILE] [--agent claude|codex] [--model NAME] [--effort LEVEL] [--voice local|codex] <request.wav>...

Omni decides in text mode whether the request is workspace work. Workspace work goes to the acting agent as text.
The agent's answer is spoken word for word. Requests and replies are WAV files; no microphone or speaker is used.
"""
import base64, io, json, os, subprocess, sys, time, urllib.request, wave

import agents, world
from voice_handoff import HANDOFF_TOOL, INSTRUCTIONS
from voice_ws import WS

HOST, PORT = os.environ.get("OMNI_HOST", "127.0.0.1"), int(os.environ.get("OMNI_PORT", "8112"))
HERE = os.path.dirname(os.path.abspath(__file__))


def audio_part(wav_bytes):
    return {"type": "input_audio", "input_audio": {"data": base64.b64encode(wav_bytes).decode(), "format": "wav"}}


def chat(messages, tools=None):
    payload = {"model": "omni", "messages": messages, "max_tokens": 300, "temperature": 0}
    if tools:
        payload["tools"] = tools
    request = urllib.request.Request(f"http://{HOST}:{PORT}/v1/chat/completions", data=json.dumps(payload).encode(),
                                     headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(request, timeout=120) as reply:
        return json.load(reply)["choices"][0]["message"]


def decide(wav_bytes):
    """-> ("handoff", the request in words) or ("reply", what Omni says itself)"""
    message = chat([{"role": "system", "content": INSTRUCTIONS}, {"role": "user", "content": [audio_part(wav_bytes)]}], [HANDOFF_TOOL])
    for call in message.get("tool_calls") or []:
        return "handoff", json.loads(call["function"]["arguments"]).get("request", "")
    return "reply", (message.get("content") or "").strip()


def speak(text):
    """-> (24 kHz mono PCM, milliseconds to the first sound)"""
    socket = WS(HOST, PORT, "/v1/realtime", timeout=120)
    socket.recv()
    socket.send({"type": "session.update", "session": {"type": "realtime", "instructions": "Perform TTS in English using a female voice.",
                                                       "output_modalities": ["audio"], "max_output_tokens": 1200}})
    socket.send({"type": "conversation.item.create", "item": {"type": "message", "role": "user", "content": [{"type": "input_text", "text": text}]}})
    started, first, pcm = time.time(), None, b""
    socket.send({"type": "response.create"})
    while True:
        event = socket.recv()
        if event is None or event.get("type") == "response.done":
            break
        if event.get("type", "").endswith("audio.delta"):
            first = first or int((time.time() - started) * 1000)
            pcm += base64.b64decode(event.get("delta", ""))
    socket.close()
    return pcm, first


def as_wav(pcm):
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(24000)
        out.writeframes(pcm)
    return buffer.getvalue()


def heard(pcm):
    message = chat([{"role": "system", "content": "Perform ASR in English."}, {"role": "user", "content": [audio_part(as_wav(pcm))]}])
    return (message.get("content") or "").strip()


def main(arguments):
    settings = {}
    if "--settings" in arguments:
        settings = json.load(open(arguments[arguments.index("--settings") + 1]))
    for key in ("agent", "model", "effort", "voice"):
        if f"--{key}" in arguments:
            settings[key] = arguments[arguments.index(f"--{key}") + 1]
    clips = [item for item in arguments if item.endswith(".wav")]
    choice = agents.choose(settings)
    agent, voice = choice["agent"], choice["voice"]
    print(f"acting agent: {agent} {choice['model']} at {choice['effort']} effort | voice: {voice}")
    if voice == "codex":
        print("Codex's own voice handles speech inside the application. This loop only drives the local voice.")
        return
    session = agents.ClaudeSession(model=choice["model"], effort=choice["effort"]) if agent == "claude" else None
    applied = 0
    for clip in clips:
        started = time.time()
        kind, text = decide(open(clip, "rb").read())
        decided = time.time() - started
        line = f"{os.path.basename(clip)}: Omni {'handed off' if kind == 'handoff' else 'answered itself'} after {decided:.2f} s: {text!r}"
        effect = None
        if kind == "handoff":
            focus = dict(world.FOCUS, revision=str(int(world.VERSION) + applied))
            outcome = session.turn(text, focus) if session else agents.codex_turn(text, focus, model=choice["model"], effort=choice["effort"])
            effects = [call["action"] for call in outcome["calls"] if call["action"].get("operation") != "inspect"]
            applied += sum(1 for call in outcome["calls"] if call["status"] == "applied" and call["action"].get("operation") != "inspect")
            effect = decided + outcome["first_effect_seconds"] if outcome.get("first_effect_seconds") else None
            text = outcome["answer"] or "The request did not finish, and its outcome is unknown."
            line += f"\n      {agent} made {len(outcome['calls'])} tool call(s); effect: {effects[0] if effects else 'none'}"
        answered = time.time() - started
        pcm, first = speak(text)
        reply = os.path.join(os.path.dirname(clip), os.path.basename(clip).replace(".wav", "-reply.wav"))
        open(reply, "wb").write(as_wav(pcm))
        line += (f"\n      spoken ({len(pcm) / 48000:.1f} s of speech): {text!r}\n      heard back as: {heard(pcm)!r}"
                 f"\n      end of request to effect: {f'{effect:.1f} s' if effect else 'no effect'} | to first sound of the answer: {answered + (first or 0) / 1000:.1f} s")
        print(line)
    if session:
        session.close()


if __name__ == "__main__":
    main(sys.argv[1:])
