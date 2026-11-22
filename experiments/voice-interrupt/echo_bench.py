import argparse, json, os, sys, time
import numpy as np, soundfile as sf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import RATE, FRAME, SCRATCH, ROUND6, Silero, Gate, load, active_rms_db, onset_time
from aec import make, TEN
from room import Room, scale_to, noise

NEAR_DB = -26.0
NOISE_DB = -65.0
GAP = 0.6


def far_session():
    meta = json.load(open(os.path.join(SCRATCH, "audio", "far", "far.json")))
    parts = []
    for m in meta:
        parts += [load(m["file"]), np.zeros(int(GAP * RATE), np.float32)]
    return np.concatenate(parts)


def near_cases():
    cases = {c["name"]: c for c in json.load(open(os.path.join(ROUND6, "cases.json")))}
    out = []
    for i in range(47):
        text = cases[f"plain-{i:02d}"]["text"]
        a = load(os.path.join(ROUND6, "set", f"_full{i}.wav"))
        out.append((i, text, a))
    return out


def run_aec(canceller, mic, far):
    out = np.zeros_like(mic)
    for k in range(0, len(mic) - TEN + 1, TEN):
        out[k:k + TEN] = canceller.process(mic[k:k + TEN], far[k:k + TEN])
    return out


def onsets(signal, detector):
    gate = Gate(detector)
    found = []
    for k in range(0, len(signal) - FRAME + 1, FRAME):
        ev, _ = gate.push(signal[k:k + FRAME])
        if ev == "onset":
            found.append((k + FRAME) / RATE)
        if ev in ("ended", "cap"):
            gate = Gate(detector)
    return found


def coupling(room, far, er_db):
    e = room.echo(far)
    return 10 ** ((NEAR_DB + er_db - active_rms_db(e)) / 20)


def false_turns(args, far, detector):
    rows = []
    for er in args.er:
        room = Room(delay_s=args.delay, rt60=args.rt60, drive=args.drive)
        g = coupling(room, far, er)
        mic = room.echo(far) * g + noise(len(far), NOISE_DB, 7)
        for name in args.aec:
            c = make(name, int(args.delay * 1000) if args.hint else None)
            t0 = time.perf_counter(); out = run_aec(c, mic, far); spent = time.perf_counter() - t0
            found = onsets(out, detector)
            erle = 10 * np.log10(np.mean(mic[int(10 * RATE):] ** 2) / (np.mean(out[int(10 * RATE):] ** 2) + 1e-12))
            rows.append({"test": "false", "aec": c.name, "er_db": er, "minutes": len(far) / RATE / 60, "false_onsets": len(found),
                         "in_first_10s": sum(t < 10 for t in found), "times": [round(t, 2) for t in found],
                         "erle_db_after_10s": round(float(erle), 1), "cpu_s_per_audio_s": round(spent / (len(far) / RATE), 4)})
            print(json.dumps(rows[-1]), flush=True)
    return rows


def barge_in(args, far, near, detector):
    rows = []
    warm = int(args.warm * RATE)
    for er in args.er:
        room = Room(delay_s=args.delay, rt60=args.rt60, drive=args.drive)
        g = coupling(room, far, er)
        for name in args.aec:
            for i, text, a in near:
                start = warm + int(((i * 0.61) % 4.0 + 1.0) * RATE)
                ff = far[: start + len(a) + int(2 * RATE)]
                if len(ff) < start + len(a):
                    ff = np.pad(ff, (0, start + len(a) - len(ff)))
                n = scale_to(a, NEAR_DB)
                true_on = start / RATE + onset_time(a)
                c = make(name, int(args.delay * 1000) if args.hint else None)
                gate = Gate(detector)
                echo = room.echo(ff) * g
                mic_base = echo + noise(len(ff), NOISE_DB, i)
                mic_base[start:start + len(n)] += n
                cut = None; detected = None; early = []; utter = None
                k = 0
                while k + FRAME <= len(ff):
                    mic = mic_base[k:k + FRAME]
                    farf = ff[k:k + FRAME]
                    out = np.concatenate([c.process(mic[j:j + TEN], farf[j:j + TEN]) for j in (0, TEN)])
                    ev, _ = gate.push(out)
                    t = (k + FRAME) / RATE
                    if ev == "onset":
                        if t < true_on - 0.05:
                            early.append(round(t, 2)); gate = Gate(detector)
                        elif detected is None:
                            detected = t
                            cut = k + FRAME + int(args.stop * RATE)
                            ff = ff.copy(); ff[cut:] = 0
                            tail = room.echo(ff) * g
                            mic_base = tail + noise(len(ff), NOISE_DB, i)
                            mic_base[start:start + len(n)] += n
                    if ev in ("ended", "cap") and detected is not None:
                        utter = gate.utterance(); break
                    k += FRAME
                if detected is not None and utter is None:
                    utter = gate.utterance()
                wav = None
                if utter is not None and args.save:
                    d = os.path.join(SCRATCH, "runs", args.save); os.makedirs(d, exist_ok=True)
                    wav = os.path.join(d, f"{c.name}_er{er:+.0f}_{i:02d}.wav"); sf.write(wav, utter, RATE)
                rows.append({"test": "barge", "aec": c.name, "er_db": er, "case": i, "text": text,
                             "true_onset": round(true_on, 3), "detected": detected and round(detected, 3),
                             "latency": detected and round(detected - true_on, 3), "early": early,
                             "overlap_s": detected and round(detected + args.stop - true_on, 3), "wav": wav})
            got = [r for r in rows if r["aec"] == c.name and r["er_db"] == er]
            lat = [r["latency"] for r in got if r["latency"] is not None]
            print(json.dumps({"aec": c.name, "er_db": er, "cases": len(got), "missed": sum(r["detected"] is None for r in got),
                              "early_cases": sum(bool(r["early"]) for r in got),
                              "latency_median": lat and round(float(np.median(lat)), 3), "latency_p90": lat and round(float(np.percentile(lat, 90)), 3)}), flush=True)
    return rows


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--test", choices=["false", "barge", "both"], default="both")
    p.add_argument("--aec", nargs="+", default=["none", "speex", "speex+residual", "webrtc-aec3", "webrtc-aec3+ns"])
    p.add_argument("--er", nargs="+", type=float, default=[-6, 0, 6])
    p.add_argument("--delay", type=float, default=0.1)
    p.add_argument("--rt60", type=float, default=0.35)
    p.add_argument("--drive", type=float, default=2.0)
    p.add_argument("--hint", type=int, default=1)
    p.add_argument("--stop", type=float, default=0.1)
    p.add_argument("--warm", type=float, default=12.0)
    p.add_argument("--cases", type=int, default=47)
    p.add_argument("--save", default="")
    p.add_argument("--out", required=True)
    args = p.parse_args()
    far = far_session(); detector = Silero()
    rows = []
    if args.test in ("false", "both"):
        rows += false_turns(args, far, detector)
    if args.test in ("barge", "both"):
        rows += barge_in(args, far, near_cases()[: args.cases], detector)
    json.dump({"args": vars(args), "rows": rows}, open(args.out, "w"), indent=1)


main()
