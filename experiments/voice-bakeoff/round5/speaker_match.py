import itertools, json, os, statistics, sys
import librosa, numpy as np, soundfile as sf, torch
from speechbrain.inference.speaker import EncoderClassifier

S = "/home/isaac/obsidian/Projects/voyagershellapp/research/voice-samples"
RAW = "/home/isaac/obsidian/Projects/voyagershellapp/research/voice-bakeoff-samples/round5"
MODEL = "/var/tmp/voyager-crew/scratch/voice/ecapa"
enc = EncoderClassifier.from_hparams(source="speechbrain/spkrec-ecapa-voxceleb", savedir=MODEL, run_opts={"device": "cpu"})


def emb(path):
    x, r = sf.read(path, dtype="float32")
    if x.ndim > 1:
        x = x.mean(1)
    x = librosa.resample(x, orig_sr=r, target_sr=16000)
    with torch.no_grad():
        e = enc.encode_batch(torch.from_numpy(x)[None]).squeeze()
    return torch.nn.functional.normalize(e, dim=0).numpy()


def cos(a, b):
    return float(np.dot(a, b))


groups = {
    "omni_female": [f"{S}/female/omni-speech-female-{i}.wav" for i in range(1, 6)],
    "lfm3_american_female": [f"{S}/female/lfm3-tts-female-{i}.wav" for i in range(1, 6)],
}
singles = {
    "lfm3_american_female_pick": f"{S}/female/lfm3-american-female.wav",
    "lfm3_british_female": f"{S}/female/lfm3-british-female.wav",
    "edge_jenny_us": f"{S}/female/edge-jenny-us.wav",
    "edge_sonia_gb": f"{S}/female/edge-sonia-gb.wav",
    "lfm3_american_male": f"{S}/male/lfm3-american-male.wav",
    "omni_male": f"{RAW}/omni-speech_male-3.wav",
}
E_ = {k: [emb(p) for p in v] for k, v in groups.items()}
M = {k: [emb(p)] for k, p in singles.items()}
allv = {**E_, **M}
mean = {k: (lambda m: m / np.linalg.norm(m))(np.mean(v, 0)) for k, v in allv.items()}
same = lambda k: [cos(a, b) for a, b in itertools.combinations(E_[k], 2)]
out = {"within": {k: round(statistics.mean(same(k)), 3) for k in E_}}
ref = "lfm3_american_female"
out["vs_lfm3_american_female_mean"] = {k: round(cos(mean[k], mean[ref]), 3) for k in allv if k != ref}
out["same_sentence_omni_vs_lfm3"] = [round(cos(E_["omni_female"][i], E_["lfm3_american_female"][i]), 3) for i in range(5)]
out["omni_female_vs_pick_file"] = round(cos(mean["omni_female"], M["lfm3_american_female_pick"][0]), 3)
out["lfm3_female_vs_pick_file"] = round(cos(mean[ref], M["lfm3_american_female_pick"][0]), 3)
json.dump(out, open(f"{RAW}/speaker_match.json", "w"), indent=1)
print(json.dumps(out, indent=1))
