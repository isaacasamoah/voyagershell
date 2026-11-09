import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import time

from PIL import Image, ImageChops

root = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(root / 'tests/native'))
from proof_native_control import Native
from proof_workspace import core_rpc

out = Path(sys.argv[1])
out.mkdir()
launch = json.loads(Path(sys.argv[2] if len(sys.argv)>2 else '/var/tmp/voyager-performance-cycle-20261107/native-setup/launch.json').read_text())
env = os.environ | launch['desktopEnvironment']
native = Native(env, out)
try:
    if len(sys.argv) < 4:
        command = 'python3 -u ' + shlex.quote(str(Path(__file__).with_name('producer.py'))) + ' --chunk 1024 --hz 4 --seconds 35 --out ' + shlex.quote(str(out / 'producer.jsonl'))
        reply = core_rpc(launch['session'], env, 'terminal.send', {'terminal':'t1','text':command,'submit':True,'wait':False})
        (out / 'dispatch-producer.json').write_text(json.dumps({'command':command,'reply':reply}, indent=2))
        for _ in range(100):
            if (out / 'producer.jsonl').exists():
                break
            time.sleep(0.05)
        else:
            raise RuntimeError('Producer did not start; no replay')
    else:
        producer = Path(sys.argv[3])
        assert producer.is_absolute() and producer.is_file()
        assert not any(json.loads(line)['kind'] == 'complete' for line in producer.read_text().splitlines())
    window = launch['window']
    assert subprocess.check_output(['xdotool','getwindowpid',window], env=env, text=True).strip() == str(launch['pid'])
    subprocess.check_call(['xdotool','windowactivate','--sync',window], env=env)
    geometry = dict(line.split('=',1) for line in subprocess.check_output(['xdotool','getwindowgeometry','--shell',window],env=env,text=True).splitlines())
    rect = [int(geometry[k]) for k in ['X','Y','WIDTH','HEIGHT']]
    capture = native('capture', str(out / 'initial.png'), rect, 2)['capture']
    frame = Image.open(out / 'initial.png').convert('RGB')
    channels = [c.point(lambda x, value=value:255 if x==value else 0) for c,value in zip(frame.split(),(255,0,0))]
    mask = ImageChops.multiply(ImageChops.multiply(channels[0],channels[1]),channels[2])
    box = mask.getbbox()
    assert box is not None and box[2]-box[0]>=8 and box[3]-box[1]>=8
    x,y = box[0]+2,box[1]+2
    assert 0<=x<x+8<=frame.width and 0<=y<y+8<=frame.height
    native('move',rect[0]+round(x*rect[2]/frame.width),rect[1]+round(y*rect[3]/frame.height),2)
    pointer = dict(line.split('=',1) for line in subprocess.check_output(['xdotool','getmouselocation','--shell'],env=env,text=True).splitlines())
    assert subprocess.check_output(['xdotool','getwindowpid',pointer['WINDOW']],env=env,text=True).strip()==str(launch['pid'])
    native('button',True)
    native('button',False)
    native('frames-start',str(out / 'frames'),capture,[x,y,8,8],1200,15)
    for _ in range(100):
        if '"type": "frame"' in (out / 'frames.jsonl').read_text():
            break
        time.sleep(0.05)
    else:
        raise RuntimeError('No first timestamped frame')
    inputs=[]
    for index in range(18):
        assert subprocess.check_output(['xdotool','getactivewindow'],env=env,text=True).strip()==window
        key=native('key',ord('x'),True)['key']
        native('key',ord('x'),False)
        inputs.append({'sequence':index+1,'key':key})
        time.sleep(0.2)
    receipt=native('frames-stop')['frames']
    (out / 'dispatch.json').write_text(json.dumps(inputs,indent=2)+'\n')
    (out / 'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
    assert receipt['complete'],receipt
finally:
    native.close()
