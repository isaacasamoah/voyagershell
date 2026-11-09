import hashlib
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import threading
import time

from PIL import Image

root = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(root / 'tests/native'))
from proof_avatar_window import warm_restore
from proof_native_control import Native
from proof_notes_lifetime import source_variant
from proof_process import process_identity, observe_core_exit
from proof_resources import Resources, collect
from proof_workspace import named_button, core_rpc, chord

protocol_path = Path(sys.argv[1])
protocol = json.loads(protocol_path.read_text())
out = Path(protocol['output'])
out.mkdir()
working = out / 'working'
working.mkdir()
session = protocol['session']
env = os.environ | protocol['desktopEnvironment']
configured_environment = json.loads(Path(protocol['environmentFile']).read_text())[1]['env']
assert configured_environment == protocol['desktopEnvironment']
for key in ('HC_SOCKET', 'HC_SESSION', 'HC_TERMINAL_ID', 'WAYLAND_DISPLAY', 'VOYAGER_REDUCED_MOTION', 'VOYAGER_REDRAW_PROBE', 'VOYAGER_EXPERIMENT_COMPACT_BACKGROUNDS', 'VOYAGER_EXPERIMENT_ROW_PAINT'):
    env.pop(key, None)
renderer = protocol['rendererEnvironment']
assert renderer == {'VOYAGER_EXPERIMENT_COMPACT_BACKGROUNDS': '1', 'VOYAGER_EXPERIMENT_ROW_PAINT': renderer.get('VOYAGER_EXPERIMENT_ROW_PAINT')}
assert renderer['VOYAGER_EXPERIMENT_ROW_PAINT'] in ('0', '1')
env.update(renderer)
binary = Path(protocol['binary'])
assert hashlib.sha256(binary.read_bytes()).hexdigest() == protocol['binarySha256']
socket = Path(env['XDG_RUNTIME_DIR']) / 'herdr-core' / (session + '.sock')
assert not socket.exists() and protocol['soakSeconds'] == 3600
setup = out / 'setup'
command = [sys.executable, str(root / 'prove.py'), '--foundation', '--review', '--compositor', '--binary', str(binary), '--session', session, '--working-directory', str(working), '--evidence', str(setup), '--desktop-env', protocol['environmentFile']]
launch = owner = raw = None
targets = []
core = None
original_package = None
sampling_thread = None
cancel_sampling = threading.Event()
package = setup / 'profile/mods/notes/main.js'


def save(name, value):
    (out / (name + '.json')).write_text(json.dumps(value, indent=2) + '\n')


def event(kind, **values):
    with (out / 'progress.jsonl').open('a') as target:
        target.write(json.dumps({'kind': kind, 'timeNs': time.monotonic_ns(), **values}) + '\n')


def execute(*args):
    return subprocess.check_output(args, env=env, text=True, timeout=10).strip()


def verify():
    assert process_identity(launch['pid'], metadata_only=True) == owner


def native(*args):
    verify()
    if args[0] == 'button' and args[1] or args[0] == 'key' and args[-1]:
        window = execute('xdotool', 'getwindowfocus') if args[0] == 'key' else dict(line.split('=', 1) for line in execute('xdotool', 'getmouselocation', '--shell').splitlines())['WINDOW']
        assert execute('xdotool', 'getwindowpid', window) == str(launch['pid'])
    return raw(*args)


def geometry(window=None):
    verify()
    window = window or launch['window']
    assert execute('xdotool', 'getwindowpid', window) == str(launch['pid'])
    return dict(line.split('=', 1) for line in execute('xdotool', 'getwindowgeometry', '--shell', window).splitlines())


def capture(name, window=None):
    bounds = geometry(window)
    path = out / (name + '-compositor.png')
    receipt = native('capture', str(path), [int(bounds[key]) for key in ('X', 'Y', 'WIDTH', 'HEIGHT')], 2)['capture']
    save(name + '-capture', receipt)
    return Image.open(path).convert('RGB')


def rpc(method, params=None):
    assert socket.is_socket()
    return core_rpc(session, env, method, params or {})


def document():
    return rpc('doc.get', {'name': 'voyager-layout-v1'})['value']


def wait(get, predicate, label, seconds=15):
    end = time.monotonic() + seconds
    while True:
        value = get()
        if predicate(value):
            return value
        if time.monotonic() >= end:
            raise TimeoutError(f'{label}: {value!r}')
        time.sleep(0.05)


def click(name, occurrence=None):
    native('accessibility-state', True)
    roles = ('button', 'push button', 'menu item', 'menu_item', 'switch', 'terminal')
    if occurrence is None:
        x, y = named_button(native, setup, name, roles=roles)
    else:
        fields = native('fields', launch['pid'], [name], 'window')['fields']
        assert name == 'Note text' and len(fields) == 2 and occurrence == 1
        field = fields[occurrence]
        assert field['width'] > 0 and field['height'] > 0
        x, y = (field['x'] + field['width'] / 2) / 2, (field['y'] + field['height'] / 2) / 2
    bounds = geometry()
    native('move', int(bounds['X']) + round(x * 2), int(bounds['Y']) + round(y * 2), 2)
    native('button', True)
    native('button', False)
    targets.append({'name': name, 'windowPoint': [x * 2, y * 2]})


def key(value):
    native('key', value, True)
    native('key', value, False)


def portal_visible(value):
    wait(document, lambda item: item['voyages'][0]['portalLayout']['visible'] == value, 'Portal presentation')


def manifest(label):
    status = rpc('server.status')
    assert status['pid'] == core['pid'] and status['core']['id'] == core['core']['id']
    assert process_identity(status['pid'], metadata_only=True) == core['identity']
    terminals = rpc('terminal.list', {'all': True})['terminals']
    return {'protocol': str(protocol_path), 'run': label, 'variant': renderer, 'session': session, 'binarySha256': protocol['binarySha256'], 'app': {'pid': launch['pid'], 'identity': owner}, 'terminals': [item['address'] for item in terminals if item['state'] == 'live'], 'core': {'socket': str(socket), 'executable': core['identity']['executable'], 'id': status['core']['id'], 'version': status['version']}}


def stable():
    current = document()
    assert current['context'] == initial['context']
    assert {item['id']: item.get('backend') for item in current['contents']} == bindings
    assert {item['address']: item['pid'] for item in rpc('terminal.list', {'all': True})['terminals'] if item['state'] == 'live'} == terminals
    assert {name: Path(name).read_bytes() for name in note_files} == note_files


def cycle(index):
    click(hidden_name)
    wait(document, lambda item: item['selectedFleet'] == hidden_id, 'Hidden Fleet')
    click('Fleet 1')
    wait(document, lambda item: item['selectedFleet'] == main_id, 'Main Fleet')
    click('Hide Portals')
    portal_visible(False)
    click('Show Portals')
    portal_visible(True)
    before_restore = time.monotonic_ns()
    restored = warm_restore(original=launch, native=native, capture=capture, geometry=geometry, env=env, wait=wait, name=f'cycle-{index}')
    save(f'cycle-{index}-restore', {'observedUpperNs': time.monotonic_ns() - before_restore, 'includesCaptureOverhead': True, **restored})
    native('accessibility-state', False)
    time.sleep(1.1)
    stable()


def drag_control(source, target):
    native('accessibility-state', True)
    items = native('fields', launch['pid'], [source, target, 'Terminal'], 'window')['fields']
    save('drag-targets-' + target, items)
    first = next(item for item in items if item['name'] == source)
    last = next(item for item in items if item['name'] == target)
    if target == 'Vessel dock':
        terminals = [item for item in items if item['name'] == 'Terminal' and item['role'] == 'terminal']
        assert len(terminals) == 1
        last = terminals[0]
        assert any(item['name'] == target and item['x'] <= last['x'] and item['x'] + item['width'] >= last['x'] + last['width'] for item in items)
    bounds = geometry()
    start = [int(bounds['X']) + first['x'] + first['width'] / 2, int(bounds['Y']) + first['y'] + first['height'] / 2]
    end = [int(bounds['X']) + last['x'] + last['width'] / 2, int(bounds['Y']) + last['y'] + last['height'] / 2]
    native('move', *map(round, start), 2)
    native('button', True)
    try:
        for index in range(1, 13):
            native('move', *[round(a + (b - a) * index / 12) for a, b in zip(start, end)], 2, 0)
            time.sleep(0.016)
    finally:
        native('button', False)


def snapshot_resources(sampler, label):
    value = sampler.sample()
    save(label, value)
    assert value['error'] is None
    return value


def edit_and_undo(index):
    native('accessibility-state', True)
    click('Note text', 1)
    key(65367)
    key(ord('x'))
    capture(f'soak-edit-draft-{index}')
    click('Terminal')
    wait(lambda: {name: Path(name).read_bytes() for name in note_files}, lambda value: value != note_files, 'real Notes edit saved')
    click('Note text', 1)
    native('key', 65507, True)
    try:
        key(ord('z'))
    finally:
        native('key', 65507, False)
    click('Terminal')
    wait(lambda: {name: Path(name).read_bytes() for name in note_files}, lambda value: value == note_files, 'real Notes undo saved')
    capture(f'soak-edit-undo-{index}')


def split_and_hide(index):
    global bindings, note_files
    click('Terminal')
    before = document()
    chord(native, 'o')
    click('Create Notes Vessel')
    changed = wait(document, lambda value: len(value['contents']) == len(before['contents']) + 1, 'one split Notes instance')
    added = next(item for item in changed['contents'] if item['id'] not in bindings)
    assert added['typeId'] == 'notes' and added.get('backend') is None
    placement = next(item for fleet in changed['voyages'][0]['fleets'] for item in fleet['vessels'] if item['content'] == added['id'])
    capture(f'soak-split-{index}')
    click('Close Vessel ' + placement['name'])
    def contains(tree):
        if tree is None:
            return False
        return tree.get('placement') == placement['id'] or any(contains(tree.get(key)) for key in ('first', 'second'))
    closed = wait(document, lambda value: not any(contains(fleet['root']) for fleet in value['voyages'][0]['fleets']), 'split view hidden')
    assert any(item['id'] == placement['id'] and item['content'] == added['id'] for fleet in closed['voyages'][0]['fleets'] for item in fleet['vessels'])
    current = {item['id']: item.get('backend') for item in closed['contents']}
    assert all(current.get(key) == value for key, value in bindings.items())
    assert set(current) - set(bindings) <= {added['id']}
    bindings = current
    file = Path(added['configuration']['notesFile']['directory']) / added['configuration']['notesFile']['filename']
    note_files[str(file)] = file.read_bytes()
    event('split-view-hidden', addedContent=added['id'], retainedFile=str(file), contentStillRetained=added['id'] in bindings)


def resize_split(index):
    native('accessibility-state', True)
    def target():
        fields = native('fields', launch['pid'], ['Resize side by side panes', 'Terminal', 'Note text'], 'window')['fields']
        save(f'soak-divider-candidates-{index}', fields)
        terminals = [item for item in fields if item['name'] == 'Terminal' and item['role'] == 'terminal']
        notes = [item for item in fields if item['name'] == 'Note text']
        if len(terminals) != 1 or len(notes) != 2:
            return None
        terminal = terminals[0]
        choices = [item for item in fields if item['name'] == 'Resize side by side panes' and item['width'] > 0 and item['height'] > item['width'] and terminal['x'] + terminal['width'] <= item['x'] + 2 and item['x'] < notes[0]['x']]
        return choices[0] if len(choices) == 1 else None
    field = wait(target, bool, 'one divider between the Terminal and Fleet Note, excluding the Portal edge')
    save(f'soak-divider-target-{index}', field)
    assert field['height'] > field['width'] > 0
    bounds = geometry()
    x = int(bounds['X']) + field['x'] + field['width'] / 2
    y = int(bounds['Y']) + field['y'] + field['height'] / 2
    before = document()['voyages'][0]['fleets'][0]['root']
    native('move', round(x), round(y), 2)
    native('button', True)
    try:
        for step in range(1, 9):
            native('move', round(x + step * (4 if index % 20 == 0 else -4)), round(y), 2, 0)
            time.sleep(0.02)
    finally:
        native('button', False)
    changed = wait(document, lambda value: value['voyages'][0]['fleets'][0]['root'] != before, 'split resize persisted')
    assert 0 < changed['voyages'][0]['fleets'][0]['root']['share'] < 10000
    capture(f'soak-divider-resize-{index}')


try:
    subprocess.run(command + ['--launch'], env=env, stdout=(out / 'launch.log').open('x'), stderr=subprocess.STDOUT, check=True, timeout=90)
    launch = json.loads((setup / 'launch.json').read_text())
    assert launch['desktopEnvironment'] == protocol['desktopEnvironment']
    actual_environment = Path(f"/proc/{launch['pid']}/environ").read_bytes().split(b'\0')
    assert all((key + '=' + value).encode() in actual_environment for key, value in renderer.items())
    env.update(launch['desktopEnvironment'])
    owner = process_identity(launch['pid'], metadata_only=True)
    status = rpc('server.status')
    core = {**status, 'identity': process_identity(status['pid'], metadata_only=True)}
    save('core-owner', core)
    raw = Native(env, out)
    click('Terminal')
    chord(native, 'o')
    click('Create Notes Vessel')
    wait(document, lambda item: any(c['typeId'] == 'notes' for c in item['contents']), 'Notes Vessel')
    click('Show Portals')
    click('Create Notes Portal')
    wait(document, lambda item: bool(item['voyages'][0]['portals']), 'Notes Portal')
    click('Create Fleet')
    click('Create Terminal Vessel')
    wait(document, lambda item: len(item['voyages'][0]['fleets']) == 2 and all(c.get('backend') for c in item['contents'] if c['typeId'] == 'terminal'), 'second Fleet and its actual backend')
    second = document()['voyages'][0]['fleets'][1]
    hidden_name = second['name']
    main_id = document()['voyages'][0]['fleets'][0]['id']
    hidden_id = second['id']
    click('Fleet 1')
    wait(document, lambda item: item['selectedFleet'] == main_id and all(c.get('backend') for c in item['contents'] if c['typeId'] == 'terminal'), 'all backend bindings')
    initial = document()
    bindings = {item['id']: item.get('backend') for item in initial['contents']}
    terminals = {item['address']: item['pid'] for item in rpc('terminal.list', {'all': True})['terminals'] if item['state'] == 'live'}
    assert len(terminals) == 2
    notes = [item for item in initial['contents'] if item['typeId'] == 'notes']
    assert len(notes) == 2 and len(initial['voyages'][0]['portals']) == 1
    note_files = {str(Path(item['configuration']['notesFile']['directory']) / item['configuration']['notesFile']['filename']): b'' for item in notes}
    note_files = {name: Path(name).read_bytes() for name in note_files}
    save('initial-layout', initial)
    capture('initial-vessel-and-portal')
    original_package = package.read_text()
    for label, source in [('valid', source_variant(original_package, 'valid', 'PERF_VALID')), ('error', source_variant(original_package, 'parse', 'PERF_BROKEN')), ('repair', source_variant(original_package, 'valid', 'PERF_REPAIRED'))]:
        before = time.monotonic_ns()
        package.write_text(source)
        time.sleep(0.4)
        capture('live-' + label)
        event('live-edit-observed', case=label, elapsedUpperNs=time.monotonic_ns() - before, timingAccepted=False, visualReviewRequired=True)
    package.write_text(original_package)
    time.sleep(0.5)
    capture('live-original-restored')
    stable()
    native('accessibility-state', False)
    sampler = Resources(manifest('retention'))
    retention = []
    for index in range(25):
        cycle(index)
        if index >= 4:
            retention.append(snapshot_resources(sampler, f'retention-{index}'))
        event('retention-cycle', index=index, warmup=index < 5)
    baseline = retention[0]['totals']['pssBytes']
    settled = retention[-1]['totals']['pssBytes']
    save('retention-result', {'warmups': 5, 'measuredCycles': 20, 'baselinePss': baseline, 'settledPss': settled, 'growthBytes': settled - baseline, 'limitBytes': max(16 * 1024 * 1024, baseline * 0.1), 'withinMemoryLimit': settled - baseline <= max(16 * 1024 * 1024, baseline * 0.1), 'scope': 'Fleet switch, Portal hide/reveal and workspace close/restore, exact content/file/backend identities retained; complete lifetime acceptance remains separate'})
    contents = {item['id']: item for item in initial['contents']}
    visible = next(contents[item['content']]['backend'] for item in initial['voyages'][0]['fleets'][0]['vessels'] if contents[item['content']]['typeId'] == 'terminal')
    producer_path = out / 'soak-producer.jsonl'
    command = f'python3 -u {shlex.quote(str(Path(__file__).with_name("producer.py")))} --chunk 1024 --hz 4 --seconds 3620 --out {shlex.quote(str(producer_path))}'
    save('producer-dispatch', {'command': command, 'receipt': rpc('terminal.send', {'terminal': visible, 'text': command, 'submit': True, 'wait': False})})
    wait(lambda: producer_path.exists(), bool, 'soak producer')
    sampler = Resources(manifest('soak'))
    sampling_thread = threading.Thread(target=collect, args=(sampler, out / 'soak-resources.jsonl'), kwargs={'count': 3601, 'interval': 1, 'cancel': cancel_sampling})
    sampling_thread.start()
    started = time.monotonic()
    inputs = []
    for index in range(60):
        time.sleep(max(0, started + index * 60 - time.monotonic()))
        cycle('soak-' + str(index))
        click('Terminal')
        inputs.append(native('key', ord('x'), True)['key'])
        native('key', ord('x'), False)
        wait(lambda: [json.loads(line) for line in producer_path.read_text().splitlines() if '"kind": "input"' in line], lambda value: len(value) == index + 1, 'exact producer input count')
        if index % 10 == 0:
            edit_and_undo(index)
            resize_split(index)
            bounds = geometry()
            execute('xdotool', 'windowsize', '--sync', launch['window'], str(int(bounds['WIDTH']) - 64), bounds['HEIGHT'])
            capture(f'soak-resize-{index}')
            execute('xdotool', 'windowsize', '--sync', launch['window'], bounds['WIDTH'], bounds['HEIGHT'])
            drag_control('Voyager avatar', 'Vessel dock')
            wait(document, lambda item: item['context']['kind'] == 'vessel', 'actual Vessel dock')
            capture(f'soak-vessel-dock-{index}')
            drag_control('Voyager avatar', 'Overwatch dock')
            wait(document, lambda item: item['context'] == initial['context'], 'actual Overwatch dock')
            capture(f'soak-home-dock-{index}')
        if index in (0, 15, 45):
            split_and_hide(index)
        native('accessibility-state', False)
        event('soak-cycle', index=index, elapsedSeconds=time.monotonic() - started)
    time.sleep(max(0, started + protocol['soakSeconds'] - time.monotonic()))
    stable()
    sampling_thread.join(timeout=5)
    assert not sampling_thread.is_alive(), 'Whole-set sampler did not finish'
    samples = [json.loads(line) for line in (out / 'soak-resources.jsonl').read_text().splitlines()]
    assert samples[-1]['complete'] and samples[-1]['samples'] == 3601 and samples[-1]['errors'] == 0
    save('soak-inputs', inputs)
    completion = wait(lambda: [json.loads(line) for line in producer_path.read_text().splitlines()][-1], lambda value: value['kind'] == 'complete', 'finite soak producer exit', 30)
    assert completion['inputs'] == 60
    transition = sampler.sample()
    save('settled-transition', transition)
    assert all(item['pid'] not in terminals.values() and item['pid'] != core['pid'] and item['pid'] != launch['pid'] for item in transition['exits'])
    time.sleep(1)
    snapshot_resources(sampler, 'settled-after-soak')
    capture('final-vessel-and-portal')
    save('result', {'retentionCycles': 25, 'soakSeconds': time.monotonic() - started, 'soakInputCount': len(inputs), 'exactStateRetained': True, 'liveEditTimingAccepted': False, 'remaining': ['live-edit screenshot review and calibrated timings', 'process reattachment breadth beyond same-window restore', 'startup repeat comparison', 'full proof-size gate', 'formal frame and reference timing'], 'wholeFoundationAccepted': False})
    event('completed')
except BaseException as error:
    try:
        save('failure-state', {'layout': document(), 'terminals': rpc('terminal.list', {'all': True})})
        if launch is not None and raw is not None:
            capture('failure')
    except Exception as observation_error:
        save('failure-observation-error', {'error': repr(observation_error)})
    event('failed', error=repr(error))
    raise
finally:
    primary_error = sys.exc_info()[0] is not None
    cleanup_errors = []
    try:
        save('input-targets', targets)
    except Exception as error:
        cleanup_errors.append('input evidence: ' + repr(error))
    cancel_sampling.set()
    if sampling_thread is not None:
        sampling_thread.join(timeout=5)
        if sampling_thread.is_alive():
            cleanup_errors.append('resource sampler did not stop')
    if original_package is not None:
        try:
            package.write_text(original_package)
        except Exception as error:
            cleanup_errors.append('package restore: ' + repr(error))
    if raw is not None:
        try:
            raw.close()
        except Exception as error:
            cleanup_errors.append('input cleanup: ' + repr(error))
    try:
        if launch is None and (setup / 'launch.json').exists():
            launch = json.loads((setup / 'launch.json').read_text())
        if launch and Path(f"/proc/{launch['pid']}/stat").exists():
            actual = process_identity(launch['pid'], metadata_only=True)
            assert all(actual[key] == launch['identity'][key] for key in ('uid', 'start', 'executable'))
            state = Path(f"/proc/{launch['pid']}/stat").read_text().rsplit(') ', 1)[1].split()[0]
            if state != 'Z':
                with (out / 'quit.log').open('x') as log:
                    quit_command = [sys.executable, str(root / 'prove.py'), '--foundation', '--quit', '--compositor', '--binary', str(binary), '--session', session, '--working-directory', str(working), '--evidence', str(setup), '--desktop-env', protocol['environmentFile']]
                    subprocess.run(quit_command, env=env, stdout=log, stderr=subprocess.STDOUT, check=True, timeout=30)
        elif launch is None:
            cleanup_errors.append('No confirmed launch identity; inspect launch-pending.json before any action')
    except Exception as error:
        cleanup_errors.append('view cleanup: ' + repr(error))
    try:
        if core is not None and socket.exists():
            status = rpc('server.status')
            assert status['pid'] == core['pid'] and status['core']['id'] == core['core']['id'] and process_identity(status['pid'], metadata_only=True) == core['identity']
            records = [{'pid': item['pid'], 'start': process_identity(item['pid'], metadata_only=True)['start']} for item in [status, *status['holders'], *rpc('terminal.list', {'all': True})['terminals']] if item.get('pid')]
            from proof_workspace import stop_existing_core
            save('core-cleanup', {'stop': stop_existing_core(session, env), 'exits': observe_core_exit(session, env, records)})
        elif socket.exists():
            cleanup_errors.append('Core was not bound before failure; inspect exact socket peer before stopping it')
    except Exception as error:
        cleanup_errors.append('Core cleanup: ' + repr(error))
    save('cleanup', {'errors': cleanup_errors, 'complete': not cleanup_errors})
    if cleanup_errors and not primary_error:
        raise RuntimeError(cleanup_errors)
