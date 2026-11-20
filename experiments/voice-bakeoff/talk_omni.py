import base64, json, os, subprocess, sys, threading, time, wave
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from voice_ws import WS
HOST, PORT = "127.0.0.1", int(os.environ.get("OMNI_PORT", "8112"))
SAVE = "/home/isaac/obsidian/Projects/voyagershellapp/research/voice-samples/talk-omni"
INSTR = "You are Voyager, a friendly spoken assistant. Reply in one or two short sentences."

def session():
    w = WS(HOST, PORT, "/v1/realtime", timeout=120); w.recv()
    w.send({"type": "session.update", "session": {"type": "realtime", "instructions": INSTR, "output_modalities": ["audio", "text"], "max_output_tokens": 300}})
    return w

def record():
    p = subprocess.Popen(["pw-cat", "-r", "--raw", "--rate", "16000", "--channels", "1", "--format", "s16", "-"], stdout=subprocess.PIPE)
    data = bytearray(); th = threading.Thread(target=lambda: [data.extend(c) for c in iter(lambda: p.stdout.read(3200), b"")], daemon=True); th.start()
    input("  Listening. Press Enter to stop... "); p.terminate(); th.join(timeout=2)
    return bytes(data[: len(data) // 2 * 2])

def turn(w, pcm):
    for i in range(0, len(pcm), 32000): w.send({"type": "input_audio_buffer.append", "audio": base64.b64encode(pcm[i:i + 32000]).decode()})
    t0 = time.time(); w.send({"type": "input_audio_buffer.commit"}); w.send({"type": "response.create"})
    play = subprocess.Popen(["pw-cat", "-p", "--raw", "--rate", "24000", "--channels", "1", "--format", "s16", "-"], stdin=subprocess.PIPE)
    out = bytearray(); first = None
    while True:
        ev = w.recv()
        if ev is None: break
        t = ev.get("type", "")
        if t.endswith("audio.delta"):
            b = base64.b64decode(ev.get("delta", "")); first = first or time.time() - t0; out += b
            try: play.stdin.write(b); play.stdin.flush()
            except BrokenPipeError: pass
        elif t.endswith("audio_transcript.delta") or t.endswith("text.delta"): print(ev.get("delta", ""), end="", flush=True)
        elif t == "error": print("\n  error:", json.dumps(ev)[:200])
        elif t == "response.done": break
    try: play.stdin.close()
    except Exception: pass
    play.wait(); print()
    if first: print(f"  [first sound {first:.2f} s after you stopped]")
    return bytes(out)

def main():
    print("Omni talk. Enter = listen, Enter again = stop.  Commands: reset, save, quit")
    w = session(); last_in = last_out = None
    while True:
        try: cmd = input("\n> ").strip().lower()
        except EOFError: break
        if cmd == "quit": break
        if cmd == "reset": w.close(); w = session(); print("Conversation cleared."); continue
        if cmd == "save":
            if last_in is None: print("Nothing to save yet."); continue
            os.makedirs(SAVE, exist_ok=True); t = time.strftime("%H%M%S")
            for name, pcm, rate in (("you", last_in, 16000), ("reply", last_out, 24000)):
                with wave.open(f"{SAVE}/{t}-{name}.wav", "wb") as f: f.setnchannels(1); f.setsampwidth(2); f.setframerate(rate); f.writeframes(pcm)
            print(f"Saved to {SAVE}/{t}-*.wav"); continue
        if cmd: print("Unknown command. Enter alone starts listening."); continue
        pcm = record()
        if len(pcm) < 8000: print("Heard nothing."); continue
        last_in = pcm; last_out = turn(w, pcm)
main()
