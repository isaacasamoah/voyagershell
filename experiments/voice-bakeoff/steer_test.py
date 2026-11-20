import sys, numpy as np, librosa, torch, soundfile as sf
sys.argv=["x","--none"]
exec(open("talk_lfm3.py").read().rsplit("\nmain()",1)[0])
model,proc,codec,dev=load()
w,_=sf.read("/var/tmp/voyager-crew/scratch/voice/test/q.wav",dtype="float32")
def run(sys_prompt):
    msgs=[{"role":"system","content":sys_prompt},{"role":"user","content":[{"type":"audio","audio":w}]},{"role":"assistant","content":"<|mixed_start|>"}]
    inp=proc.apply_chat_template(msgs,continue_final_message=True,tokenize=True,return_dict=True,return_tensors="pt").to(dev)
    torch.manual_seed(0)
    with torch.no_grad():
        o=model.generate(**inp,max_new_tokens=300,return_dict_in_generate=True,**AUDIO_KW)
        a=codec.decode(o.audio_codes[:1,:,:o.audio_lengths[0]]).audio_values[0].float().cpu().numpy()
    f0,v,_=librosa.pyin(a,fmin=70,fmax=400,sr=24000); return round(float(np.nanmedian(f0))), len(a)/24000
base="Respond with interleaved text and audio."
for name,p in [("default",base),("female",base+" Use a female voice."),("male",base+" Use a male voice."),("american female",base+" Respond in an American English female voice."),("british male",base+" Respond in a British English male voice.")]:
    print(name,[run(p) for _ in range(2)],flush=True)
for loc,g in [("American English","female"),("American English","male")]:
    x=tts_wave(model,proc,codec,dev,SENTENCE,loc,g); f0,_,_=librosa.pyin(x,fmin=70,fmax=400,sr=24000); print("tts ref",loc,g,round(float(np.nanmedian(f0))))
