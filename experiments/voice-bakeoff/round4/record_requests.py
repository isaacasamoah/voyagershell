import argparse, json, os, subprocess, sys, threading, time, wave

sys.path.insert(0, os.path.dirname(__file__))
from requests4 import R, HELD_OUT

RATE = 16000
DEFAULT_DIR = os.path.expanduser("~/.local/share/voyagershell-voice-recordings")
SYNC_MARKERS = (".stfolder", ".dropbox", ".nextcloudsync", ".owncloudsync")
SYNC_NAMES = ("dropbox", "nextcloud", "owncloud", "syncthing", "google drive", "onedrive", "icloud", "obsidian")


def refuse_unsafe(path):
    real = os.path.realpath(path)
    home = os.path.expanduser("~")
    p = real
    while True:
        for m in (".git",) + SYNC_MARKERS:
            if os.path.exists(os.path.join(p, m)):
                sys.exit(f"refusing {real}: {p} contains {m}; recordings are personal voice data")
        if p == os.path.dirname(p):
            break
        p = os.path.dirname(p)
    parts = [x.lower() for x in real.split(os.sep)]
    for n in SYNC_NAMES:
        if any(n in x for x in parts):
            sys.exit(f"refusing {real}: path looks synced or inside Obsidian ({n})")
    if real.startswith(os.path.join(home, "obsidian")):
        sys.exit(f"refusing {real}: inside the Obsidian folder")


class MicSource:
    def start(self):
        self.p = subprocess.Popen(["pw-cat", "-r", "--raw", "--rate", str(RATE), "--channels", "1", "--format", "s16", "-"], stdout=subprocess.PIPE)
        self.buf = bytearray()
        self.t = threading.Thread(target=self._read, daemon=True)
        self.t.start()

    def _read(self):
        while True:
            b = self.p.stdout.read(3200)
            if not b:
                return
            self.buf += b

    def stop(self):
        self.p.terminate()
        self.p.wait()
        self.t.join(timeout=1)
        return bytes(self.buf)


class WavSource:
    def __init__(self, path):
        with wave.open(path, "rb") as w:
            assert (w.getframerate(), w.getnchannels(), w.getsampwidth()) == (RATE, 1, 2), "test wav must be 16 kHz mono s16"
            self.data = w.readframes(w.getnframes())

    def start(self):
        pass

    def stop(self):
        return self.data


def write_wav(path, data):
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(data)


def load_manifest(path):
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return {"rate": RATE, "channels": 1, "format": "s16", "requests": {}}


def save_manifest(path, m):
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(m, f, indent=1)
    os.replace(tmp, path)


def main():
    ap = argparse.ArgumentParser(description="Record the spoken requests of the voice hillclimb set, one wav each, plus a manifest.")
    ap.add_argument("save_dir", nargs="?", default=DEFAULT_DIR, help=f"folder for the wavs and manifest.json, created at the first recording (default {DEFAULT_DIR}); outside any repository, Obsidian or synced folder")
    ap.add_argument("--test-wav", help="16 kHz mono s16 wav used instead of the mic")
    ap.add_argument("--redo-all", action="store_true", help="ask for every request again, ignoring earlier takes")
    a = ap.parse_args()

    refuse_unsafe(a.save_dir)
    mpath = os.path.join(a.save_dir, "manifest.json")
    m = load_manifest(mpath)
    src = WavSource(a.test_wav) if a.test_wav else MicSource()
    held = set(HELD_OUT)
    total = len(R)

    for i, (cat, text, kind, _g, _w) in enumerate(R):
        key = f"{i + 1:02d}"
        if key in m["requests"] and not a.redo_all:
            continue
        fname = f"{key}-{cat}.wav"
        while True:
            print(f"\n[{i + 1}/{total}] {cat}\n    Say:  {text}")
            cmd = input("    Enter to start (q quits): ").strip().lower()
            if cmd == "q":
                if m["requests"]:
                    save_manifest(mpath, m)
                print(f"stopped; {len(m['requests'])}/{total} saved in {a.save_dir}")
                return
            src.start()
            t0 = time.time()
            input("    Recording. Enter to stop: ")
            data = src.stop()
            secs = len(data) / 2 / RATE
            wall = time.time() - t0
            os.makedirs(a.save_dir, mode=0o700, exist_ok=True)
            write_wav(os.path.join(a.save_dir, fname), data)
            print(f"    {secs:.1f} s captured")
            cmd = input("    Enter keeps it, r redoes: ").strip().lower()
            if cmd == "r":
                continue
            break
        m["requests"][key] = {
            "index": i,
            "category": cat,
            "kind": kind,
            "split": "held_out" if i in held else "tune",
            "text": text,
            "file": fname,
            "seconds": round(secs, 2),
            "recorded_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        }
        save_manifest(mpath, m)

    print(f"\ndone: {len(m['requests'])}/{total} saved in {a.save_dir}")


if __name__ == "__main__":
    main()
