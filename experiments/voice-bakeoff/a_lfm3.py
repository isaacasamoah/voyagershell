import json, os, sys, time, statistics
sys.path.insert(0,os.path.dirname(__file__)); from common import *
import torch, soundfile as sf, librosa
from transformers import AutoModelForMultimodalLM, AutoProcessor
os.makedirs(OUT+"/lfm3",exist_ok=True)
smp=Sampler(os.getpid()); smp.start()
t0=time.time(); mid="LiquidAI/LFM3-Audio-2B"; dev="cuda"
model=AutoModelForMultimodalLM.from_pretrained(mid,dtype=torch.bfloat16,device_map=dev,trust_remote_code=True).eval()
proc=AutoProcessor.from_pretrained(mid,trust_remote_code=True); codec=proc.audio_tokenizer.to(device=dev).eval()
res={"load_s":round(time.time()-t0,1)}
def asr(path):
    conv=[{"role":"system","content":"Perform ASR in English."},{"role":"user","content":[{"type":"audio","audio":path}]}]
    inp=proc.apply_chat_template(conv,add_generation_prompt=True,tokenize=True,return_dict=True,return_tensors="pt").to(dev)
    with torch.no_grad(): o=model.generate(**inp,max_new_tokens=256,suppress_mixed=True,suppress_audio_out=True,return_dict_in_generate=True)
    return proc.decode(o.sequences[0,inp["input_ids"].shape[1]:],skip_special_tokens=True).strip()
class First:
    def __init__(s): s.t=None; s.n=0; s.ts=[]; s.shape=None
    def put(s,x):
        if s.t is None: s.t=time.time(); s.shape=tuple(getattr(x,'shape',()))
        s.n+=1; s.ts.append(time.time())
    def end(s): pass
def tts(text,voice="male"):
    conv=[{"role":"system","content":f"Perform TTS in American English using a {voice} voice."},{"role":"user","content":text},{"role":"assistant","content":"<|audio_start|>"}]
    inp=proc.apply_chat_template(conv,continue_final_message=True,tokenize=True,return_dict=True,return_tensors="pt").to(dev)
    f=First(); t=time.time()
    with torch.no_grad():
        o=model.generate(**inp,max_new_tokens=512,audio_temperature=1.0,audio_top_k=128,audio_repetition_penalty=1.1,audio_repetition_window=4096,return_dict_in_generate=True,audio_streamer=f)
        w=codec.decode(o.audio_codes[:1,:,:o.audio_lengths[0]]).audio_values[0]
    tot=time.time()-t
    return w.float().cpu().numpy(),(f.t-t if f.t else None),tot,f,t,len(w)/24000
asr(OUT+"/in/0.wav"); tts("Warm up.")
rows=[];lat=[]
for r in range(2):
    for i,t in enumerate(SCRIPT):
        t1=time.time(); h=asr(f"{OUT}/in/{i}.wav"); lat.append(time.time()-t1)
        if r==0:
            rows.append({"ref":t,"heard":h,"wer":round(wer(t,h),3)}); handoff("[lfm3] "+h)
res["asr"]={"rows":rows,"mean_wer":round(sum(x["wer"] for x in rows)/len(rows),3),"asr_s_median":round(statistics.median(lat),3)}
first=[];tot=[];half=[];shp=None
for r in range(2):
    for i,t in enumerate(REPLIES):
        w,f,tt,fo,t0_,dur=tts(t); fps=fo.n/dur; k=max(1,int(0.5*fps)); half.append(fo.ts[min(k,len(fo.ts))-1]-t0_); shp=fo.shape
        if r==0: sf.write(f"{OUT}/lfm3/reply{i}.wav",w,24000)
        first.append(f); tot.append((tt,len(w)/24000))
res["tts_first_stream_frame_s_median"]=round(statistics.median([x for x in first if x] or [0]),3)
res["tts_stream_item_shape"]=str(shp); res["tts_time_to_0.5s_of_frames_s_median"]=round(statistics.median(half),3)
res["tts_first_frame_missing"]=sum(1 for x in first if not x)
res["tts_total_s_median"]=round(statistics.median(a for a,b in tot),3)
res["tts_audio_s_median"]=round(statistics.median(b for a,b in tot),3)
res["load"]=smp.summary(); smp.stop=True
json.dump(res,open(OUT+"/lfm3.json","w"),indent=1); print(json.dumps(res,indent=1))
