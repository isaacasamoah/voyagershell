import json
import os
from pathlib import Path
import subprocess
import sys
import time
import zlib

from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(root / 'tests/native'))
sys.path.insert(0, str(root / 'experiments/electron-reference'))
from proof_native_control import Native
from proof_common import verify_candidate

out = Path(sys.argv[1])
out.mkdir()
setup = Path('/var/tmp/voyager-performance-cycle-20261107/reference-setup')
env = os.environ | json.loads(Path('/var/tmp/voyager-performance-cycle-20261107/electron-desktop-env.json').read_text())[1]['env']
launch = json.loads((setup / 'launch.json').read_text())
native = Native(env, out)
try:
    with sync_playwright() as playwright:
        browser = playwright.chromium.connect_over_cdp('http://127.0.0.1:9584')
        verify_candidate(browser, setup, launch['session'], root / 'experiments/electron-reference')
        page = next(p for p in browser.contexts[0].pages if p.url.endswith('/electron-reference/index.html'))
        windows = subprocess.check_output(['xdotool', 'search', '--onlyvisible', '--pid', str(launch['pid'])], env=env, text=True).split()
        candidates = []
        for window in windows:
            geometry = dict(line.split('=', 1) for line in subprocess.check_output(['xdotool', 'getwindowgeometry', '--shell', window], env=env, text=True).splitlines())
            candidates.append((int(geometry['WIDTH']) * int(geometry['HEIGHT']), window, geometry))
        _, window, geometry = max(candidates)
        assert subprocess.check_output(['xdotool', 'getwindowpid', window], env=env, text=True).strip() == str(launch['pid'])
        subprocess.check_call(['xdotool', 'windowactivate', '--sync', window], env=env)
        page.evaluate('''() => {
            const tile = document.createElement('div');
            tile.id = 'performance-calibration';
            tile.style.cssText = 'position:fixed;left:16px;top:16px;width:64px;height:64px;background:rgb(0,0,0);z-index:2147483647;pointer-events:none';
            document.body.append(tile);
            window.calibration = {delay:0, count:0};
            const pulse = document.createElement('div');
            pulse.style.cssText = 'position:absolute;left:32px;top:32px;width:2px;height:2px';
            tile.append(pulse);
            let phase = false;
            const paint = () => {
                phase = !phase;
                pulse.style.background = phase ? 'rgb(0,0,255)' : 'rgb(0,0,0)';
                window.calibration.paint = requestAnimationFrame(paint);
            };
            paint();
            window.calibration.key = e => {
                if(e.code !== 'F8') return;
                e.preventDefault(); e.stopImmediatePropagation();
                const n = ++window.calibration.count;
                setTimeout(() => tile.style.background = n % 2 ? 'rgb(255,0,0)' : 'rgb(0,255,0)', window.calibration.delay);
            };
            document.addEventListener('keydown', window.calibration.key, true);
        }''')
        rect = [int(geometry[k]) for k in ['X', 'Y', 'WIDTH', 'HEIGHT']]
        capture = native('capture', str(out / 'initial.png'), rect, 2)['capture']
        native('frames-start', str(out / 'frames'), capture, [48, 48, 64, 64], 1200, 25)
        path = out / 'frames.jsonl'
        for _ in range(100):
            if path.exists() and '"type": "frame"' in path.read_text():
                break
            time.sleep(0.05)
        else:
            raise RuntimeError('No first timestamped frame; no input submitted')
        inputs = []
        for delay in [0, 0, 400, 0, 400, 0]:
            page.evaluate('(delay) => window.calibration.delay = delay', delay)
            assert subprocess.check_output(['xdotool', 'getactivewindow'], env=env, text=True).strip() == window
            down = native('key', 65477, True)['key']
            native('key', 65477, False)
            inputs.append({'delayMs': delay, 'key': down})
            time.sleep(0.8)
        receipt = native('frames-stop')['frames']
        (out / 'dispatch.json').write_text(json.dumps(inputs, indent=2) + '\n')
        (out / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
        page.evaluate('''() => {
            document.removeEventListener('keydown', window.calibration.key, true);
            cancelAnimationFrame(window.calibration.paint);
            document.getElementById('performance-calibration').remove();
            delete window.calibration;
        }''')
        assert receipt['complete'], receipt
finally:
    native.close()
