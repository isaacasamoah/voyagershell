from contextlib import ExitStack
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import time

from owner import amd_graphics_counters, hidden_view

root = Path(__file__).resolve().parents[3]
base = Path('/var/tmp/voyager-typing-latency-20261108')
spec = importlib.util.spec_from_file_location('typing_driver', root / 'experiments/performance/typing-latency/compare-cpu.py')
driver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(driver)
from proof_native_control import Native
protocol = json.loads(Path(sys.argv[1]).read_text())
out = base / protocol['output']
out.mkdir()
driver.save(out / 'protocol.json', protocol)
for name, digest in protocol['helpers'].items():
    assert hashlib.sha256((root / name).read_bytes()).hexdigest() == digest, name
for artifact in protocol['artifacts'].values():
    assert hashlib.sha256(Path(artifact['binary']).read_bytes()).hexdigest() == artifact['sha256']
for key in ('MESA_VK_WSI_PRESENT_MODE', 'VOYAGER_FRAME_PROFILE', 'VOYAGER_FRAME_PROFILE_STOP'):
    driver.env.pop(key, None)
execute = lambda *args: subprocess.check_output(args, env=driver.env, text=True, timeout=8).strip()


def display():
    return execute('gdbus', 'call', '--session', '--dest', 'org.gnome.Mutter.DisplayConfig',
                   '--object-path', '/org/gnome/Mutter/DisplayConfig', '--method',
                   'org.gnome.Mutter.DisplayConfig.GetCurrentState')


def verify(item, identities, geometry, text):
    record = item['record']
    assert display() == protocol['displayState'], 'Display configuration changed'
    assert execute('xdotool', 'getwindowgeometry', '--shell', record['window']) == geometry
    assert execute('xdotool', 'getactivewindow') == record['window']
    assert execute('xdotool', 'search', '--onlyvisible', '--pid', str(record['pid'])).split() == [record['window']]
    for pid, identity in identities.items():
        assert driver.process_identity(int(pid), metadata_only=True) == identity
    status = driver.rpc(record['session'], 'server.status')
    assert status['pid'] == item['core']['pid'] and status['core']['id'] == item['core']['core']['id']
    terminal = driver.rpc(record['session'], 'terminal.get', {'terminal': 't1'})
    assert terminal['state'] == 'live' and (terminal['cols'], terminal['rows']) == (145, 39)
    assert driver.rpc(record['session'], 'terminal.read', {'terminal': 't1', 'lines': 0})['text'] == text


deadline = time.monotonic() + protocol['maximumSeconds']
try:
    with ExitStack() as views:
        guard = views.enter_context(hidden_view(protocol['owner'], driver, out))
        try:
            for index, case in enumerate(protocol['cases'], 1):
                assert time.monotonic() < deadline, 'Collection budget exhausted'
                guard()
                app, density, reduced = case
                folder = out / f'{index:02d}-{app}-{density}-reduced-{int(reduced)}'
                artifact = protocol['artifacts'][app] | protocol.get('caseArtifacts', {}).get(str(index), {}) | {'inputProgram': 'stream-echo' if density == 'dense' else 'echo',
                                                        'outputLoad': False, 'reducedMotion': reduced}
                driver.env['HERDR_APP_BENCH'] = str(folder / 'herdr-bench.jsonl')
                driver.save(out / 'progress.json', {'case': index, 'condition': case, 'state': 'preparing'})
                item = driver.launch('voyager' if app == 'candidate' else 'herdr', folder, artifact, trace=False)
                record = item['record']
                environment = Path(f"/proc/{record['pid']}/environ").read_bytes().split(b'\0')
                if app == 'candidate':
                    assert (b'VOYAGER_REDUCED_MOTION=1' in environment) == reduced
                    assert b'VOYAGER_TYPING_TRACE=0' in environment
                    assert not any(e.startswith(b'VOYAGER_EXPERIMENT_PIXEL_MOTION=') for e in environment)
                _, pids = driver.process_scope(item)
                manifest = {str(pid): driver.process_identity(pid, metadata_only=True) for pid in sorted(pids)}
                manifest[str(protocol['owner']['pid'])] = driver.process_identity(protocol['owner']['pid'], metadata_only=True)
                driver.save(folder / 'observed-processes.json', manifest)
                geometry = execute('xdotool', 'getwindowgeometry', '--shell', record['window'])
                text = driver.rpc(record['session'], 'terminal.read', {'terminal': 't1', 'lines': 0})['text']
                printed = sum(len(line.rstrip()) for line in text.splitlines()[:34])
                assert printed == (4896 if density == 'dense' else 0), 'Static density mismatch'
                time.sleep(protocol['warmSeconds'])
                verify(item, manifest, geometry, text)
                guard()
                driver.save(out / 'progress.json', {'case': index, 'condition': case, 'state': 'measuring'})
                subprocess.run([sys.executable, str(root / 'experiments/performance/typing-latency/observe.py'),
                                str(folder / 'observed-processes.json'), str(folder / 'resources.jsonl'),
                                '--samples', str(protocol['samples'])], env=driver.env, check=True, timeout=30)
                verify(item, manifest, geometry, text)
                guard()
                rows = [json.loads(line) for line in (folder / 'resources.jsonl').read_text().splitlines()]
                graphics = [amd_graphics_counters(row['processes'][str(protocol['owner']['pid'])]['graphics'])
                            for row in rows if 'graphics' in row['processes'][str(protocol['owner']['pid'])]]
                assert len(graphics) >= 3 and graphics[0] and all(value == graphics[0] for value in graphics)
                driver.save(folder / 'static-verified.json', {'printed': printed, 'geometry': geometry,
                            'textSha256': hashlib.sha256(text.encode()).hexdigest(), 'condition': case})
                capture = folder / 'capture'
                capture.mkdir()
                native = Native(driver.env, capture)
                try:
                    bounds = dict(line.split('=', 1) for line in geometry.splitlines())
                    native('capture', str(capture / 'scene.png'), [int(bounds[key]) for key in ('X', 'Y', 'WIDTH', 'HEIGHT')], 2)
                finally:
                    native.close()
                if index in protocol['stackCases']:
                    with (folder / 'stack.txt').open('x') as log:
                        result = subprocess.run(['eu-stack', '-1', '-p', str(record['pid']), '-n', '35'],
                                                env=driver.env, stdout=log, stderr=subprocess.STDOUT, timeout=15)
                    driver.save(folder / 'stack-status.json', {'returncode': result.returncode, 'outsideScoredWindow': True})
                if artifact.get('checkCommands'):
                    from proof_deliberate_motion import prove
                    prove(item, driver, not reduced, packs=artifact.get("checkAnimationPacks", False))
                driver.cleanup(item)
                driver.save(out / 'progress.json', {'case': index, 'condition': case, 'state': 'complete'})
        finally:
            for item in reversed(driver.owned):
                if not item['closed']:
                    driver.cleanup(item)
finally:
    driver.save(out / 'input-released.json', {'ownerUnchanged': (out / 'owner-restored.json').exists(),
                                            'atNs': time.monotonic_ns()})
