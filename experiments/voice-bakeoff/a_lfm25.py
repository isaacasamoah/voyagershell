import json, os, sys, time, statistics
sys.path.insert(0,os.path.dirname(__file__)); from common import *
import torch, torchaudio, soundfile as sf
from liquid_audio import LFM2AudioModel, LFM2AudioProcessor, ChatState, LFMModality
os.makedirs(OUT+"/lfm25",exist_ok=True)
smp=Sampler(os.getpid()); smp.start()
R="LiquidAI/LFM2.5-Audio-1.5B"; t0=time.time()
proc=LFM2AudioProcessor.from_pretrained(R,device='cuda').eval(); model=LFM2AudioModel.from_pretrained(R,device='cuda').eval()
res={"load_s":round(time.time()-t0,1),"device":str(next(model.parameters()).device)}
dev=next(model.parameters()).device
def asr(path):
    c=ChatState(proc); c.new_turn("system"); c.add_text("Perform ASR."); c.end_turn()
    c.new_turn("user"); d,sr=sf.read(path,dtype="float32"); w=torch.from_numpy(d)[None]; c.add_audio(w,sr); c.end_turn(); c.new_turn("assistant")
    out=[]
    for t in model.generate_sequential(**c,max_new_tokens=256):
        if t.numel()==1: out.append(t)
    d=proc.text.decode(torch.stack(out,1)) if out else ""; return (d if isinstance(d,str) else " ".join(d)).strip()
def tts(text):
    c=ChatState(proc); c.new_turn("system"); c.add_text("Perform TTS. Use the US male voice."); c.end_turn()
    c.new_turn("user"); c.add_text(text); c.end_turn(); c.new_turn("assistant")
    a=[];ts=[];t=time.time()
    for x in model.generate_sequential(**c,max_new_tokens=1024,audio_temperature=0.8,audio_top_k=64):
        if x.numel()>1: a.append(x); ts.append(time.time())
    tot=time.time()-t
    w=proc.decode(torch.stack(a[:-1],1).unsqueeze(0)).cpu().numpy().squeeze()
    return w,ts,t,tot
asr(OUT+"/in/0.wav"); tts("Warm up.")
rows=[];lat=[]
for r in range(2):
    for i,t in enumerate(SCRIPT):
        t1=time.time(); h=asr(f"{OUT}/in/{i}.wav").replace("<|im_end|>","").strip(); lat.append(time.time()-t1)
        if r==0: rows.append({"ref":t,"heard":h,"wer":round(wer(t,h),3)}); handoff("[lfm2.5] "+h)
res["asr"]={"rows":rows,"mean_wer":round(sum(x["wer"] for x in rows)/len(rows),3),"asr_s_median":round(statistics.median(lat),3)}
half=[];tot=[]
for r in range(2):
    for i,t in enumerate(REPLIES):
        w,ts,t0_,tt=tts(t); dur=len(w)/24000; fps=len(ts)/dur; k=max(1,int(0.5*fps))
        half.append(ts[min(k,len(ts))-1]-t0_); tot.append((tt,dur))
        if r==0: sf.write(f"{OUT}/lfm25/reply{i}.wav",w,24000)
res["tts_time_to_0.5s_of_frames_s_median"]=round(statistics.median(half),3)
res["tts_total_s_median"]=round(statistics.median(a for a,b in tot),3); res["tts_audio_s_median"]=round(statistics.median(b for a,b in tot),3)
res["load"]=smp.summary(); smp.stop=True
json.dump(res,open(OUT+"/lfm25.json","w"),indent=1); print(json.dumps(res,indent=1))
