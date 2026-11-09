import hashlib
import json
from pathlib import Path
import subprocess
import time

from PIL import Image

from proof_native_control import Native


def prove(item, driver, expected, packs=False):
    out = item['folder'] / 'deliberate-motion'
    out.mkdir()
    record = item['record']
    native = Native(driver.env, out)
    held = set()
    notes = []
    drags = []
    pointer_moves = []

    def command(*args):
        return subprocess.check_output(args, env=driver.env, text=True, timeout=5).strip()

    def geometry():
        return dict(line.split('=', 1) for line in command('xdotool', 'getwindowgeometry', '--shell', record['window']).splitlines())

    def field(name):
        values = driver.wait(lambda: native('fields', record['pid'], [name], 'window')['fields'],
                             lambda values: len(values) == 1 and values[0]['width'] > 0, name)
        return values[0]

    def move(control):
        g = geometry()
        target = [int(g[axis]) + round(control[point] + control[dimension] / 2)
                  for axis, point, dimension in [('X', 'x', 'width'), ('Y', 'y', 'height')]]
        injected = [round(value / 2) * 2 for value in target]
        samples = []
        pointer_moves.append({'requested': target, 'injected': injected, 'observed': samples})
        native('move', *injected, 2)
        try:
            for _ in range(50):
                actual = dict(line.split('=', 1) for line in command('xdotool', 'getmouselocation', '--shell').splitlines())
                samples.append([int(actual[axis]) for axis in ('X', 'Y')])
                if len(samples) >= 3 and samples[-3:] == [samples[-1]] * 3 and all(abs(a - b) <= 1 for a, b in zip(samples[-1], injected)):
                    return
                time.sleep(.02)
            raise AssertionError(f'Pointer delivery changed: {pointer_moves[-1]}')
        finally:
            driver.save(out / 'pointer-delivery.json', pointer_moves)

    def key(code, down):
        native('key', code, down)
        held.add(code) if down else held.discard(code)

    def button(down):
        native('button', down)
        held.add('button') if down else held.discard('button')

    def capture(name):
        g = geometry()
        return native('capture', str(out / (name + '.png')), [int(g[k]) for k in ('X', 'Y', 'WIDTH', 'HEIGHT')], 2)['capture']

    def clip(name, trigger=None, hold=0):
        avatar = field('Voyager avatar')
        capture_data = capture(name)
        x, y, width, height = [avatar[k] / 2 for k in ('x', 'y', 'width', 'height')]
        roi = ([round(x), round(y), int(width) // 4 * 4, int(height)] if packs else
               [round(x + width * .15), round(y + height * .15), int(width * .68) // 4 * 4, int(height * .68)])
        path = out / name
        native('frames-start', str(path), capture_data, roi, 2400, 25)
        driver.wait(lambda: path.with_suffix('.jsonl').read_text(), lambda text: '"type": "frame"' in text, 'First motion frame')
        time.sleep(.4)
        trigger_ns = time.monotonic_ns()
        if trigger == 'shift-click':
            move(avatar)
            key(65505, True)
            button(True)
            button(False)
            key(65505, False)
            move(field('Vessel dock'))
        elif trigger == 'hover':
            move(avatar)
        elif trigger in ('dock', 'dock-voyage'):
            native('focus', record['pid'], 'Voyage dock' if trigger == 'dock-voyage' else 'Vessel dock', 0)
            key(65505, True)
            key(65293, True)
            key(65293, False)
            key(65505, False)
        elif trigger == 'keyboard':
            key(ord('s'), True)
            time.sleep(hold)
            key(ord('s'), False)
        time.sleep(max(5, hold) if trigger else 9)
        receipt = native('frames-stop')['frames']
        assert receipt['complete'] and not receipt.get('error'), receipt
        frames = [json.loads(line) for line in path.with_suffix('.jsonl').read_text().splitlines()
                  if json.loads(line)['type'] == 'frame']
        assert len(frames) == receipt['frames'] and frames
        assert all(frame['stride'] == frame['width'] * 3 and frame['width'] == roi[2] and frame['height'] == roi[3] for frame in frames)
        assert all(b['source']['offset'] == a['source']['offset'] + 1 and b['source']['ptsNs'] > a['source']['ptsNs'] for a, b in zip(frames, frames[1:])), 'Motion capture lost source frames'
        hashes = [frame['pixelSha256'] for frame in frames]
        changed = [value != hashes[0] for value in hashes]
        cycles = sum(value and (i == 0 or not changed[i - 1]) for i, value in enumerate(changed))
        assert hashes[0] == hashes[-1], 'Motion did not return to the idle image'
        def authored_hold(a, b):
            return (packs and name in ('hover-once', 'explicit-shift', 'held-s', 'fresh-s')
                    and .80 <= (a['sourceReceivedBeforeNs'] - trigger_ns) / 1e9
                    and (b['sourceReceivedBeforeNs'] - trigger_ns) / 1e9 <= 3.10
                    and b['sourceReceivedBeforeNs'] - a['sourceReceivedBeforeNs'] <= 2_150_000_000)

        exempt = []
        for i, (a, b) in enumerate(zip(frames, frames[1:])):
            if not (changed[i] and changed[i + 1]) or b['sourceReceivedBeforeNs'] - a['sourceReceivedBeforeNs'] < 250_000_000:
                continue
            if packs and hashes[i] == hashes[i + 1] and authored_hold(a, b):
                continue
            assert authored_hold(a, b), 'Changing animation has a capture gap outside its authored hold'
            exempt.append(i)
        assert len(exempt) <= 1, 'Multiple changing-frame gaps claimed the authored hold'

        if trigger and expected:
            assert len(set(hashes)) >= 3, 'No visible pose transition'
        capture(name + '-end')
        with Image.open(out / (name + '-end.png')) as image:
            x, y, w, h = roi
            end_hash = hashlib.sha256(image.convert('RGB').crop((x, y, x + w, y + h)).tobytes()).hexdigest()
        assert end_hash == hashes[0], 'Fresh end capture is not the original idle image'
        assert cycles == (1 if trigger and expected else 0), (name, cycles)
        notes.append({'clip': name, 'frames': len(frames), 'changedFrames': sum(changed), 'cycles': cycles,
                      'expectedAnimation': bool(trigger and expected), 'heldSeconds': hold, 'triggerNs': trigger_ns, 'exemptChangingPairs': exempt, 'freshEndHash': end_hash, 'receipt': receipt})
        driver.save(out / (name + '-analysis.json'), notes[-1])
        assert command('xdotool', 'getactivewindow') == record['window']

    def context():
        return driver.rpc(record['session'], 'doc.get', {'name': 'voyager-layout-v1'})['value']['context']

    def drag(target, cancel=False):
        before = context()
        source = field('Voyager avatar')
        move(source)
        button(True)
        for step in range(1, 9):
            point = {key: source[key] + (target[key] - source[key]) * step / 8 for key in ('x', 'y', 'width', 'height')}
            move(point)
        driver.wait(lambda: field('Voyager avatar'),
                    lambda value: all(abs(value[key] + value[size] / 2 - target[key] - target[size] / 2) <= 3
                                      for key, size in [('x', 'width'), ('y', 'height')]), 'Dragged avatar follows pointer')
        capture('drag-preview-' + str(len(drags)))
        if cancel:
            key(65307, True)
            key(65307, False)
        button(False)
        if cancel:
            driver.wait(lambda: field('Voyager avatar'),
                        lambda value: all(abs(value[key] - source[key]) <= 3 for key in ('x', 'y', 'width', 'height')),
                        'Cancelled drag returns to its original dock')
        drags.append({'before': before, 'target': target, 'cancel': cancel})
        driver.save(out / 'drags.json', drags)
        return before

    try:
        native('focus', record['pid'], 'Voyager avatar', 0)
        driver.wait(lambda: field('Voyager avatar')['focused'], bool, 'Avatar focus')
        original = context()
        move(field('Vessel dock'))
        clip('idle')
        if packs:
            clip('hover-once', 'hover', 8)
            move(field('Vessel dock'))
        clip('explicit-shift', 'shift-click')
        assert context() == original, 'Explicit animation changed context'
        driver.wait(lambda: field('Voyager avatar')['focused'], bool, 'Command focus retained')
        clip('held-s', 'keyboard', 6)
        clip('fresh-s', 'keyboard')
        assert context() == original
        if expected:
            drag(field('Vessel dock'))
            driver.wait(context, lambda value: value['kind'] == 'vessel', 'Native vessel dock')
            if packs:
                time.sleep(2.3)
                clip('post-dock', 'dock')
                drag(field('Voyage dock'))
                driver.wait(context, lambda value: value['kind'] == 'voyage', 'Compact native voyage dock')
                time.sleep(2.3)
                clip('compact-dock', 'dock-voyage')
            before = drag(field('Voyage dock'), cancel=True)
            assert context() == before, 'Cancelled drag changed context'
            drag(field('Overwatch dock'))
            driver.wait(context, lambda value: value['kind'] == 'workspace', 'Native home dock')
            if packs:
                from proof_animation_pack import prove as prove_pack
                prove_pack(item, driver, native, field, move, key, button, clip, context)
            driver.save(out / 'before-terminal-focus.json', {'activeWindow': command('xdotool', 'getactivewindow'), 'terminal': field('Terminal')})
            native('focus', record['pid'], 'Terminal', 0)
            focused = driver.wait(lambda: field('Terminal'), lambda value: value['focused'], 'Terminal focus applied before key')
            driver.save(out / 'terminal-focused.json', {'activeWindow': command('xdotool', 'getactivewindow'), 'terminal': focused})
            assert command('xdotool', 'getactivewindow') == record['window']
            key(ord('s'), True)
            key(ord('s'), False)
            receipt = Path(item['workload']['receipt'])
            driver.wait(lambda: receipt.read_text(), lambda text: '"event": "invalid_input"' in text,
                        'Terminal receives S instead of avatar command')
        capture('final')
        status = driver.rpc(record['session'], 'server.status')
        assert status['pid'] == item['core']['pid'] and status['core']['id'] == item['core']['core']['id']
        driver.save(out / 'verified.json', {'clips': notes, 'drags': drags, 'context': context(), 'sameCore': True,
                    'pointerDockAndCancel': expected, 'terminalSDelivered': expected})
    finally:
        try:
            for code in held:
                native('button', False) if code == 'button' else native('key', code, False)
        finally:
            native.close()
