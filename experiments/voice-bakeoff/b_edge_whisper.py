import asyncio, json, os, sys, time, statistics, subprocess
sys.path.insert(0,os.path.dirname(__file__)); from common import *
import edge_tts
from faster_whisper import WhisperModel
os.makedirs(OUT+"/in",exist_ok=True); os.makedirs(OUT+"/edge",exist_ok=True)
async def synth(text,path,voice,first=None):
    t0=time.time(); c=edge_tts.Communicate(text,voice); f=open(path,"wb"); 
    async for ch in c.stream():
        if ch["type"]=="audio":
            if first is not None and not first: first.append(time.time()-t0)
            f.write(ch["data"])
    f.close()
def wav(mp3,w): subprocess.run(["ffmpeg","-y","-loglevel","error","-i",mp3,"-ar","16000","-ac","1",w],check=True)
for i,t in enumerate(SCRIPT):
    asyncio.run(synth(t,f"{OUT}/in/{i}.mp3","en-GB-RyanNeural")); wav(f"{OUT}/in/{i}.mp3",f"{OUT}/in/{i}.wav")
smp=Sampler(os.getpid()); smp.start()
res={}
for name in ["small.en","base.en"]:
    m=WhisperModel(name,device="cuda",compute_type="float16")
    list(m.transcribe(f"{OUT}/in/0.wav")[0])
    rows=[];lat=[]
    for r in range(2):
        for i,t in enumerate(SCRIPT):
            t0=time.time(); segs,_=m.transcribe(f"{OUT}/in/{i}.wav",language="en",beam_size=1); txt=" ".join(s.text.strip() for s in segs); asr=time.time()-t0
            if r==0: rows.append({"ref":t,"heard":txt,"wer":round(wer(t,txt),3)})
            handoff(txt) if (name=="small.en" and r==0) else None
            lat.append(asr)
    res[name]={"rows":rows,"mean_wer":round(sum(x["wer"] for x in rows)/len(rows),3),"asr_s_median":round(statistics.median(lat),3)}
ttfa=[]
for r in range(3):
    for i,t in enumerate(REPLIES):
        first=[]; asyncio.run(synth(t,f"{OUT}/edge/{i}.mp3","en-GB-RyanNeural",first)); ttfa.append(first[0])
res["edge_tts_first_audio_s_median"]=round(statistics.median(ttfa),3); res["edge_tts_n"]=len(ttfa)
res["e2e_first_audio_s_median_small"]=round(res["small.en"]["asr_s_median"]+res["edge_tts_first_audio_s_median"],3)
res["load"]=smp.summary(); smp.stop=True
json.dump(res,open(OUT+"/edge_whisper.json","w"),indent=1); print(json.dumps(res,indent=1))
