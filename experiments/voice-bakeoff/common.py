import json, os, re, subprocess, time, threading
S="/var/tmp/voyager-crew/scratch/voice"
OUT="/var/tmp/voyager-crew/scratch/voice/out"
SCRIPT=json.load(open(os.path.join(os.path.dirname(__file__),"script.json")))
REPLIES=["Two things are blocked in the build Fleet: the avatar pull request is waiting on a verdict, and the Core adapter is waiting on a rebase.","Opening the roadmap now.","Three Vessels are running in the Release Fleet.","I've asked the verifier to review the avatar pull request.","Moving the research Vessel into the Experiment Fleet.","You've used twenty two percent of this week's budget.","Four pull requests merged since yesterday, mostly the diagnostics seam and the vocabulary change.","I'll stop the scratch terminal in the Experiment Fleet. Confirm?"]
def norm(s): return re.sub(r"[^a-z0-9 ]","",s.lower().replace("-"," ")).split()
def wer(ref,hyp):
    r,h=norm(ref),norm(hyp); d=list(range(len(h)+1))
    for i in range(1,len(r)+1):
        p=d[:]; d[0]=i
        for j in range(1,len(h)+1): d[j]=min(p[j]+1,d[j-1]+1,p[j-1]+(r[i-1]!=h[j-1]))
    return d[len(h)]/max(1,len(r))
def handoff(text):
    env={k:v for k,v in os.environ.items() if k not in("HC_SOCKET","HC_TERMINAL_ID")}; env["HC_SESSION"]="voyager-voice-test"
    subprocess.run(["hc","send","t1",text],env=env,check=True,capture_output=True)
def handoff_log(): return open(S+"/handoff.log").read()
class Sampler(threading.Thread):
    def __init__(s,pid): super().__init__(daemon=True); s.pid=pid; s.cpu=[];s.rss=[];s.gpu=[];s.stop=False
    def run(s):
        prev=None; hz=os.sysconf("SC_CLK_TCK")
        while not s.stop:
            try:
                f=open(f"/proc/{s.pid}/stat").read().rsplit(")",1)[1].split(); t=(int(f[11])+int(f[12]))/hz; now=time.time()
                if prev: s.cpu.append((t-prev[0])/(now-prev[1])*100)
                prev=(t,now)
                for l in open(f"/proc/{s.pid}/status"):
                    if l.startswith("VmRSS"): s.rss.append(int(l.split()[1])/1e6)
                o=subprocess.run(["nvidia-smi","--query-compute-apps=pid,used_memory","--format=csv,noheader,nounits"],capture_output=True,text=True).stdout
                for l in o.splitlines():
                    p,m=l.split(","); 
                    if int(p)==s.pid: s.gpu.append(int(m)/1024)
            except Exception: pass
            time.sleep(0.5)
    def summary(s): return {"cpu_pct_peak":round(max(s.cpu or [0]),0),"cpu_pct_mean":round(sum(s.cpu)/max(1,len(s.cpu)),0),"rss_gb_peak":round(max(s.rss or [0]),2),"gpu_gb_peak":round(max(s.gpu or [0]),2)}
