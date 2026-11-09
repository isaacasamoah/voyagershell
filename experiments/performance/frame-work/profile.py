from contextlib import ExitStack
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import time

root = Path(__file__).resolve().parents[3]
base = Path('/var/tmp/voyager-typing-latency-20261108')
spec = importlib.util.spec_from_file_location('typing_driver', root / 'experiments/performance/typing-latency/compare-cpu.py')
driver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(driver)
from proof_avatar_window import warm_restore
from proof_native_control import Native
from owner import hidden_view, verify_quiet

protocol = json.loads(Path(sys.argv[1]).read_text())
out = base / protocol['output']
out.mkdir()
driver.save(out / 'protocol.json', protocol)
for name, digest in protocol['helpers'].items():
    assert hashlib.sha256((root / name).read_bytes()).hexdigest() == digest, name
assert hashlib.sha256(Path(protocol['artifact']['binary']).read_bytes()).hexdigest() == protocol['artifact']['sha256']
driver.env.pop('MESA_VK_WSI_PRESENT_MODE', None)
load = None
views = ExitStack()
hidden_guard = None
try:
    if protocol.get('hiddenOwner'):
        assert protocol['hiddenOwner'] == json.loads(Path('/home/isaac/.local/share/voyagershell-foundation/active-preview.json').read_text())
        hidden_guard = views.enter_context(hidden_view(protocol['hiddenOwner'], driver, out))
    for index, condition in enumerate(protocol['conditions'], 1):
        if hidden_guard:
            hidden_guard()
        folder = out / f'{index:02d}-clock-{condition}'
        stop = folder / 'frame-work.stop'
        driver.env.update({'VOYAGER_FRAME_PROFILE': '1', 'VOYAGER_FRAME_PROFILE_STOP': str(stop)})
        driver.save(out / 'progress.json', {'condition': condition, 'state': 'preparing'})
        item = driver.launch('voyager', folder, protocol['artifact'])
        environment = Path(f"/proc/{item['record']['pid']}/environ").read_bytes().split(b'\0')
        pixel_motion = protocol['artifact'].get('pixelMotion', False)
        assert type(pixel_motion) is bool
        assert (b'VOYAGER_EXPERIMENT_PIXEL_MOTION=1' in environment) == pixel_motion
        assert not any(e.startswith(b'VOYAGER_EXPERIMENT_PIXEL_MOTION=') and e != b'VOYAGER_EXPERIMENT_PIXEL_MOTION=1' for e in environment)
        driver.save(folder / 'experiment-environment.json', {'pixelMotion': pixel_motion})
        window = item['record']['window']
        def geometry(selected=None):
            return dict(line.split('=', 1) for line in subprocess.check_output(['xdotool', 'getwindowgeometry', '--shell', selected or window], env=driver.env, text=True, timeout=5).splitlines())
        if condition == 'motion':
            phases = []
            for phase in protocol['motionPhases']:
                label, position, monitor = phase['name'], phase['position'], phase['monitorBounds']
                before, wall = time.monotonic_ns(), time.time_ns()
                subprocess.check_call(['xdotool', 'windowmove', '--sync', window, *map(str, position)], env=driver.env, timeout=5)
                time.sleep(4)
                actual = geometry()
                bounds = [int(actual[key]) for key in ['X', 'Y', 'WIDTH', 'HEIGHT']]
                phases.append({'name': label, 'beforeNs': before, 'wallNs': wall, 'endNs': time.monotonic_ns(), 'actualBounds': bounds, 'monitorBounds': monitor})
                driver.save(folder / 'motion-phases.json', phases)
                assert monitor[0] <= bounds[0] and monitor[1] <= bounds[1]
                assert bounds[0]+bounds[2] <= monitor[0]+monitor[2] and bounds[1]+bounds[3] <= monitor[1]+monitor[3]
            native = Native(driver.env, folder)
            def capture(name, selected):
                g = geometry(selected)
                return native('capture', str(folder / (name+'.png')), [int(g[k]) for k in ['X', 'Y', 'WIDTH', 'HEIGHT']], 2)
            try:
                result = warm_restore(original=item['record'], native=native, capture=capture, geometry=geometry, env=driver.env, wait=driver.wait, name='clock')
                driver.save(folder / 'warm-restore.json', result)
            finally:
                native.close()
        if condition == 'cpu':
            load = subprocess.Popen([sys.executable, str(root / 'experiments/performance/typing-latency/cpu-load.py'), '--out', str(folder / 'load.jsonl')], env=driver.env,
                                    stdout=(folder / 'load.stdout').open('x'), stderr=(folder / 'load.stderr').open('x'), start_new_session=True)
            driver.save(folder / 'load-owner.json', {'pid': load.pid, 'identity': driver.process_identity(load.pid, metadata_only=True)})
            driver.wait(lambda: (folder / 'load.jsonl').exists(), bool, 'CPU workers started')
        time.sleep(10)
        config = dict(protocol['config'], binarySha256=protocol['artifact']['sha256'])
        driver.save(out / 'progress.json', {'condition': condition, 'state': 'typing'})
        driver.measure(item, config, condition)
        if hidden_guard:
            hidden_guard()
            verify_quiet(protocol['hiddenOwner'], driver, folder)
        dispatch = json.loads((folder / 'input/dispatch.json').read_text())
        clocks = [d['clock'] for d in dispatch]
        assert all(c['beforeNs'] <= c['afterNs'] for c in clocks)
        low = min(c['wallNs']-c['afterNs'] for c in clocks)
        high = max(c['wallNs']-c['beforeNs'] for c in clocks)
        assert 0 <= high-low <= 1_000_000
        stopped = json.loads((folder / 'input/receipt.json').read_text())['stoppedNs']
        path = stop.with_suffix('.jsonl')
        def drained_after_capture():
            complete = path.read_text().rsplit('\n', 1)[0] if path.exists() else ''
            for line in complete.splitlines()[-100:]:
                row = json.loads(line)
                if row.get('start_age_ns') is not None and row['wall_before_ns']-row['start_age_ns'] >= stopped+high:
                    return True
            return False
        driver.wait(drained_after_capture, bool, 'Journal drain beyond capture', 10)
        stop.write_text('requested after native collection\n')
        driver.wait(lambda: path.read_text() if path.exists() else '', lambda value: 'voyager_frame_work_end' in value, 'Profile completion', 10)
        records = [json.loads(line) for line in path.read_text().splitlines()]
        end = records[-1]
        assert end['requested_stop'] and not end['capped'] and not end['expired'] and end['lost'] == 0
        assert end['last_drain_wall_ns']-high >= stopped
        assert [r['sequence'] for r in records[:-1]] == list(range(end['records']))
        if protocol.get('glyphProbe'):
            native = (folder / 'native.log').read_text()
            events = [
                json.loads(line)['record'] for line in native.splitlines()
                if line.startswith('{"event":"voyager_typing_trace",')
            ]
            first = {}
            stages = ['glyph_snapshot', 'glyph_paint_callback']
            if protocol.get('parsedGlyphProbe'):
                stages.insert(0, 'glyph_parsed')
            for stage in stages:
                selected = sorted(
                    (event for event in events if event['stage'] == stage),
                    key=lambda event: event['elapsed_before_ns'],
                )
                values = [event['value'] for event in selected]
                assert all(type(value) is int and 1 <= value <= 12 for value in values), stage
                assert values and values == sorted(values) and set(values) == set(range(1, 13)), stage
                first[stage] = {
                    value: next(event for event in selected if event['value'] == value)
                    for value in range(1, 13)
                }
            for value in range(1, 13):
                if protocol.get('parsedGlyphProbe'):
                    assert first['glyph_parsed'][value]['elapsed_after_ns'] <= first['glyph_snapshot'][value]['elapsed_before_ns'], value
                assert (
                    first['glyph_snapshot'][value]['elapsed_after_ns']
                    <= first['glyph_paint_callback'][value]['elapsed_before_ns']
                ), value
            assert 'Terminal row paint failed' not in native and 'Terminal row background failed' not in native
            driver.save(folder / 'glyph-probe.json', {'prefixes': list(range(1, 13)), 'stages': stages})
        driver.cleanup(item)
        if load:
            assert load.wait(timeout=40) == 0
            completed = json.loads((folder / 'load.jsonl').read_text().splitlines()[-1])
            assert completed['kind'] == 'complete' and len(completed['workers']) == 20
            load = None
        driver.save(out / 'progress.json', {'condition': condition, 'state': 'complete'})
finally:
    try:
        for item in reversed(driver.owned):
            stop = item['folder'] / 'frame-work.stop'
            if not stop.exists():
                stop.write_text('cleanup requested\n')
            if not item['closed']:
                driver.cleanup(item)
        if load is not None:
            assert load.wait(timeout=65) == 0
    finally:
        views.close()
    owner = json.loads(Path('/home/isaac/.local/share/voyagershell-foundation/active-preview.json').read_text())
    assert all(v == owner['identity'][k] for k, v in driver.process_identity(owner['pid'], metadata_only=True).items())
    subprocess.check_call(['xdotool', 'windowactivate', '--sync', owner['window']], env=driver.env)
    driver.save(out / 'input-released.json', {'ownerUnchanged': True, 'atNs': time.monotonic_ns()})
