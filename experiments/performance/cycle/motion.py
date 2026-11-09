import json
import os
from pathlib import Path
import subprocess
import sys
import time

from PIL import Image, ImageChops

root = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(root / 'tests/native'))
from proof_native_control import Native
from proof_workspace import core_rpc

out=Path(sys.argv[1]);out.mkdir()
launch=json.loads(Path(sys.argv[2]).read_text());env=os.environ|launch['desktopEnvironment']
native=Native(env,out);held=False
window=str(launch['window'])
def execute(*args):
    return subprocess.check_output(args,env=env,text=True).strip()
def active():
    assert execute('xdotool','getwindowpid',window)==str(launch['pid'])
    assert execute('xdotool','getactivewindow')==window
try:
    execute('xdotool','windowactivate','--sync',window)
    geometry=dict(line.split('=',1) for line in execute('xdotool','getwindowgeometry','--shell',window).splitlines())
    rect=[int(geometry[k]) for k in ['X','Y','WIDTH','HEIGHT']]
    capture=native('capture',str(out/'before.png'),rect,2)['capture']
    image=Image.open(out/'before.png').convert('RGB')
    sx=rect[2]/image.width;sy=rect[3]/image.height
    def point(x,y):
        return rect[0]+round(x*sx),rect[1]+round(y*sy)
    def bright(frame,box):
        area=frame.crop(box)
        masks=[c.point(lambda x:255 if x>190 else 0) for c in area.split()]
        bounds=ImageChops.multiply(ImageChops.multiply(masks[0],masks[1]),masks[2]).getbbox()
        assert bounds is not None, 'No astronaut pixels in declared area'
        return [box[0]+bounds[0],box[1]+bounds[1],box[0]+bounds[2],box[1]+bounds[3]]
    box=bright(image,[round(45*image.width/1450),round(100*image.height/940),round(180*image.width/1450),round(230*image.height/940)])
    grip=((box[0]+box[2])/2,(box[1]+box[3])/2)
    active();native('move',*point(*grip),2)
    pointer=dict(line.split('=',1) for line in execute('xdotool','getmouselocation','--shell').splitlines())
    assert execute('xdotool','getwindowpid',pointer['WINDOW'])==str(launch['pid'])
    native('button',True);held=True
    target=[round(image.width*.4),round(image.height*.45)]
    native('move',*point(*target),2,0)
    time.sleep(.5)
    native('capture',str(out/'held.png'),rect,2)
    body=Image.open(out/'held.png').convert('RGB')
    bounds=bright(body,[target[0]-100,target[1]-100,target[0]+100,target[1]+100])
    roi=[bounds[0]-50,round((bounds[1]+bounds[3])/2)-32,256,64]
    assert roi[0]>=0 and roi[0]+roi[2]<=image.width
    native('frames-start',str(out/'frames'),capture,roi,4096,25)
    for _ in range(100):
        if '"type": "frame"' in (out/'frames.jsonl').read_text():break
        time.sleep(.05)
    else:raise RuntimeError('No first motion frame')
    movements=[]
    for index in range(50):
        active()
        delta=32 if index%2==0 else 0
        request=point(target[0]+delta,target[1])
        result=native('move',*request,2,0)['move']
        pointer=dict(line.split('=',1) for line in execute('xdotool','getmouselocation','--shell').splitlines())
        assert abs(int(pointer['X'])-request[0])<=2 and abs(int(pointer['Y'])-request[1])<=2
        movements.append({'index':index,'target':request,'sourceDelta':delta,'dispatch':result})
        time.sleep(.25)
    receipt=native('frames-stop')['frames']
    (out/'motion.json').write_text(json.dumps({'roi':roi,'body':bounds,'grip':grip,'target':target,'geometry':geometry,'capture':capture,'movements':movements,'receipt':receipt},indent=2)+'\n')
    assert receipt['complete'],receipt
finally:
    if held:
        if execute('xdotool','getactivewindow')==window:
            native('key',65307,True);native('key',65307,False)
        native('button',False)
    native.close()
