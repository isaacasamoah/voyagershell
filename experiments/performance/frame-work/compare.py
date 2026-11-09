import hashlib
import importlib.util
import json
from contextlib import ExitStack
from pathlib import Path
import subprocess
import sys
import time
from owner import hidden_view, verify_quiet

base = Path('/var/tmp/voyager-typing-latency-20261108')
root = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('typing_driver', root / 'experiments/performance/typing-latency/compare-cpu.py')
driver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(driver)
protocol_path = Path(sys.argv[1]) if len(sys.argv) > 1 else base / 'presentation-protocol.json'
protocol = json.loads(protocol_path.read_text())
out = base / protocol['output']
out.mkdir()
driver.save(out / 'protocol.json', protocol)
for name, digest in protocol['helpers'].items():
    assert hashlib.sha256((root / name).read_bytes()).hexdigest() == digest, name
for key, value in protocol.get('experimentEnvironment', {}).items():
    assert key in ('PATH', 'VOYAGER_HC')
    driver.env[key] = value
for key in ['MESA_VK_WSI_PRESENT_MODE', 'VOYAGER_FRAME_PROFILE', 'VOYAGER_FRAME_PROFILE_STOP']:
    driver.env.pop(key, None)
if protocol.get('pairedBlocks'):
    assert protocol['cases'] == [[variant, block.get('condition', 'quiet')] for block in protocol['pairedBlocks'] for variant in block['measure']]
    assert all(block.get('condition', 'quiet') in ('quiet', 'cpu') for block in protocol['pairedBlocks'])
    assert len(protocol['pairedBlocks']) == 4
    assert all(len(block['launch']) == len(block['measure']) == 2 for block in protocol['pairedBlocks'])
typing_trace = protocol.get('typingTrace', False)
assert type(typing_trace) is bool
if protocol.get('closedOwnerApps'):
    assert not protocol.get('hiddenOwner')
    assert all(not Path(f'/proc/{pid}/exe').exists() for pid in protocol['closedOwnerApps'])
def prepare(index, variant, condition):
    artifact = dict(protocol['artifacts'][variant])
    if artifact.get('inputProgram') == 'stream-echo':
        assert condition in ('quiet', 'burst')
        artifact['outputLoad'] = condition == 'burst'
    assert hashlib.sha256(Path(artifact['binary']).read_bytes()).hexdigest() == artifact['sha256']
    folder = out / f'{index:02d}-{variant}-{condition}'
    before = time.monotonic_ns()
    trace = typing_trace and variant != 'herdr' and artifact.get('traceEnabled', True)
    item = driver.launch('herdr' if variant == 'herdr' else 'voyager', folder, artifact, trace=trace)
    assert hashlib.sha256(Path(f"/proc/{item['record']['pid']}/exe").resolve().read_bytes()).hexdigest() == artifact['sha256']
    environment = Path(f"/proc/{item['record']['pid']}/environ").read_bytes().split(b'\0')
    assert not any(e.startswith(b'MESA_VK_WSI_PRESENT_MODE=') for e in environment)
    if variant != 'herdr':
        assert (b'VOYAGER_TYPING_TRACE=1' if trace else b'VOYAGER_TYPING_TRACE=0') in environment
        assert (b'VOYAGER_TYPING_TRACE_INPUT_ONLY=1' in environment) == artifact.get('inputOnlyTrace', False)
        assert (b'VOYAGER_REDUCED_MOTION=1' in environment) == artifact.get('reducedMotion', False)
        assert not any(e.startswith(b'VOYAGER_REDUCED_MOTION=') and e != b'VOYAGER_REDUCED_MOTION=1' for e in environment)
        assert (b'VOYAGER_EXPERIMENT_VISIBLE_OUTPUT=1' in environment) == artifact.get('visibleOutput', False)
        assert not any(e.startswith(b'VOYAGER_EXPERIMENT_VISIBLE_OUTPUT=') and e != b'VOYAGER_EXPERIMENT_VISIBLE_OUTPUT=1' for e in environment)
        assert (b'VOYAGER_EXPERIMENT_PIXEL_MOTION=1' in environment) == artifact.get('pixelMotion', False)
        assert not any(e.startswith(b'VOYAGER_EXPERIMENT_PIXEL_MOTION=') and e != b'VOYAGER_EXPERIMENT_PIXEL_MOTION=1' for e in environment)
        assert (b'VOYAGER_EXPERIMENT_DIRTY_WAKE=1' in environment) == artifact.get('dirtyWake', False)
        assert not any(e.startswith(b'VOYAGER_EXPERIMENT_DIRTY_WAKE=') and e != b'VOYAGER_EXPERIMENT_DIRTY_WAKE=1' for e in environment)
    driver.save(folder / 'experiment-environment.json', {
        'presentationOverride': False, 'typingTrace': trace,
        'inputOnlyTrace': artifact.get('inputOnlyTrace', False),
        'reducedMotion': artifact.get('reducedMotion', False),
        'visibleOutput': artifact.get('visibleOutput', False),
        'pixelMotion': artifact.get('pixelMotion', False),
        'dirtyWake': artifact.get('dirtyWake', False),
    })
    driver.save(folder / 'startup.json', {'beforeNs': before, 'readyNs': time.monotonic_ns(), 'variant': variant})
    if protocol.get('pairedBlocks'):
        _, pids = driver.process_scope(item)
        item['pairedIdentities'] = {str(pid): driver.process_identity(pid, metadata_only=True) for pid in pids}
        driver.save(folder / 'paired-processes.json', item['pairedIdentities'])
        item['pairedForeground'] = driver.rpc(item['record']['session'], 'terminal.get', {'terminal': 't1'})['foreground']
    return item


def verify_pair(items):
    if 'displayState' in protocol:
        actual = subprocess.check_output(
            ['gdbus', 'call', '--session', '--dest', 'org.gnome.Mutter.DisplayConfig',
             '--object-path', '/org/gnome/Mutter/DisplayConfig', '--method',
             'org.gnome.Mutter.DisplayConfig.GetCurrentState'], env=driver.env, text=True).strip()
        assert actual == protocol['displayState'], 'Display configuration changed'
    geometries = {}
    for variant, item in items.items():
        record = item['record']
        for pid, expected in item['pairedIdentities'].items():
            assert driver.process_identity(int(pid), metadata_only=True) == expected, 'A peer process changed'
        core = driver.rpc(record['session'], 'server.status')
        assert core['pid'] == item['core']['pid'] and core['core']['id'] == item['core']['core']['id']
        terminal = driver.rpc(record['session'], 'terminal.get', {'terminal': 't1'})
        foreground = item['workload'] if 'workload' in item else item['pairedForeground']
        assert terminal['state'] == 'live' and terminal['foreground']['pid'] == foreground['pid']
        assert terminal['foreground']['argv'][1:] == foreground['argv'][1:], 'A peer workload changed'
        assert all(record['identity'][key] == value for key, value in driver.process_identity(record['pid'], metadata_only=True).items())
        visible = subprocess.check_output(['xdotool', 'search', '--onlyvisible', '--pid', str(record['pid'])], env=driver.env, text=True).split()
        assert visible == [record['window']], 'A peer view disappeared'
        raw = subprocess.check_output(['xdotool', 'getwindowgeometry', '--shell', record['window']], env=driver.env, text=True)
        value = dict(line.split('=', 1) for line in raw.splitlines())
        rectangle = [int(value[key]) for key in ('X', 'Y', 'WIDTH', 'HEIGHT')]
        assert rectangle == protocol['pairedGeometry'][variant], 'Peer placement changed'
        x, y, width, height = rectangle
        assert 0 <= x < x + width <= 6880 and 0 <= y < y + height <= 2880
        geometries[variant] = rectangle
    a, b = geometries.values()
    assert a[0] + a[2] <= b[0] or b[0] + b[2] <= a[0], 'Peer windows overlap'
    return geometries


load = None
views = ExitStack()
hidden_guard = None
deadline = time.monotonic() + protocol['budget']['maximumMinutes'] * 60
try:
    if protocol.get('hiddenOwner'):
        assert protocol['hiddenOwner'] == json.loads(Path('/home/isaac/.local/share/voyagershell-foundation/active-preview.json').read_text())
        hidden_guard = views.enter_context(hidden_view(protocol['hiddenOwner'], driver, out))
    first_case = protocol.get('firstCase', 1)
    assert 1 <= first_case <= len(protocol['cases'])
    assert not protocol.get('pairedBlocks') or first_case % 2 == 1
    for index, (variant, condition) in enumerate(protocol['cases'], 1):
        if index < first_case:
            continue
        assert time.monotonic() < deadline, 'Collection budget exhausted; stop new runs'
        if hidden_guard:
            hidden_guard()
        config = dict(protocol['configs'][variant])
        if protocol.get('pairedBlocks'):
            if index % 2 == 1:
                block = protocol['pairedBlocks'][(index - 1) // 2]
                assert set(block['launch']) == set(block['measure']) == {'candidate', 'herdr'}
                peers = {name: prepare(index + block['measure'].index(name), name, condition) for name in block['launch']}
                time.sleep(protocol['warmSeconds'])
            item = peers[variant]
            _, peer_pids = driver.process_scope(peers[next(name for name in peers if name != variant)])
            config['backgroundObservers'] = config.get('backgroundObservers', {}) | {str(pid): driver.process_identity(pid, metadata_only=True) for pid in peer_pids}
            driver.save(item['folder'] / 'peers-before.json', verify_pair(peers))
        else:
            item = prepare(index, variant, condition)
        folder = item['folder']
        if condition == 'cpu':
            load = subprocess.Popen([sys.executable, str(root / 'experiments/performance/typing-latency/cpu-load.py'), '--out', str(folder / 'load.jsonl')], env=driver.env,
                                    stdout=(folder / 'load.stdout').open('x'), stderr=(folder / 'load.stderr').open('x'), start_new_session=True)
            driver.save(folder / 'load-owner.json', {'pid': load.pid, 'identity': driver.process_identity(load.pid, metadata_only=True)})
            driver.wait(lambda: (folder / 'load.jsonl').exists(), bool, 'CPU workers started')
        if not protocol.get('pairedBlocks') or condition == 'cpu':
            time.sleep(protocol['warmSeconds'])
        driver.save(out / 'progress.json', {'case': index, 'variant': variant, 'condition': condition, 'state': 'typing'})
        driver.measure(item, config, condition)
        if hidden_guard:
            hidden_guard()
            verify_quiet(protocol['hiddenOwner'], driver, folder)
        if protocol.get('pairedBlocks'):
            driver.save(folder / 'peers-after.json', verify_pair(peers))
            if index % 2 == 0:
                for peer in reversed(list(peers.values())):
                    driver.cleanup(peer)
        else:
            driver.cleanup(item)
        if load:
            assert load.wait(timeout=40) == 0
            completion = [json.loads(line) for line in (folder / 'load.jsonl').read_text().splitlines()]
            assert completion[-1]['kind'] == 'complete' and len(completion[-1]['workers']) == 20
            load = None
        driver.save(out / 'progress.json', {'case': index, 'variant': variant, 'condition': condition, 'state': 'complete'})
finally:
    try:
        if load is not None:
            assert load.wait(timeout=65) == 0
        for item in reversed(driver.owned):
            if not item['closed']:
                driver.cleanup(item)
    finally:
        views.close()
    if protocol.get('closedOwnerApps'):
        assert not protocol.get('hiddenOwner')
        assert all(not Path(f'/proc/{pid}/exe').exists() for pid in protocol['closedOwnerApps'])
        target = protocol['returnFocus']
        if target:
            assert driver.process_identity(target['pid'], metadata_only=True) == target['identity']
            assert subprocess.check_output(['xdotool', 'getwindowpid', target['window']], env=driver.env, text=True).strip() == str(target['pid'])
            subprocess.check_call(['xdotool', 'windowactivate', '--sync', target['window']], env=driver.env)
        driver.save(out / 'input-released.json', {'closedOwnersRemainClosed': True, 'returnFocusRestored': True if target else None, 'atNs': time.monotonic_ns()})
    else:
        owner = json.loads(Path('/home/isaac/.local/share/voyagershell-foundation/active-preview.json').read_text())
        assert all(value == owner['identity'][key] for key, value in driver.process_identity(owner['pid'], metadata_only=True).items())
        subprocess.check_call(['xdotool', 'windowactivate', '--sync', owner['window']], env=driver.env)
        driver.save(out / 'input-released.json', {'ownerUnchanged': True, 'atNs': time.monotonic_ns()})
