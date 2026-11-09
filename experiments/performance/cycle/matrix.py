import argparse
import hashlib
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import time

root = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(root / 'tests/native'))
from proof_native_control import Native
from proof_process import process_identity, observe_core_exit
from proof_resources import Resources, collect
from proof_workspace import core_rpc, stop_existing_core

parser = argparse.ArgumentParser()
parser.add_argument('protocol', type=Path)
args = parser.parse_args()
protocol = json.loads(args.protocol.read_text())
out = Path(protocol['output'])
out.mkdir()
env = os.environ | protocol['desktopEnvironment']
for key in ['HC_SOCKET', 'HC_SESSION', 'HC_TERMINAL_ID', 'WAYLAND_DISPLAY', 'VOYAGER_REDRAW_PROBE', 'VOYAGER_REDUCED_MOTION', 'VOYAGER_EXPERIMENT_ROW_PAINT', 'VOYAGER_EXPERIMENT_COMPACT_BACKGROUNDS']:
    env.pop(key, None)
binary = Path(protocol['binary'])
assert hashlib.sha256(binary.read_bytes()).hexdigest() == protocol['binarySha256']
assert protocol['warmSeconds'] == 60 and protocol['sampleSeconds'] == 60
row_confirmation = protocol.get('comparisonScope') == 'row-paint-confirmation'
assert protocol['counts'] == ([1, 16] if row_confirmation else [1, 4, 8, 16]) and protocol['repeats'] == 3
if row_confirmation:
    assert not protocol.get('carriedCells')
    assert protocol['conditions'] == {'busy': [4096, 16]}
    assert protocol['variants'] == {
        '0': {'VOYAGER_EXPERIMENT_COMPACT_BACKGROUNDS': '1', 'VOYAGER_EXPERIMENT_ROW_PAINT': '0'},
        '1': {'VOYAGER_EXPERIMENT_COMPACT_BACKGROUNDS': '1', 'VOYAGER_EXPERIMENT_ROW_PAINT': '1'},
    }
carried = protocol.get('carriedCells')
if carried:
    analysis = Path(carried['analysis'])
    assert hashlib.sha256(analysis.read_bytes()).hexdigest() == carried['sha256']
    completed_cells = json.loads(analysis.read_text())['cells']
    assert carried['cells'] == [[1, 'ordinary'], [1, 'busy']]
    assert all(any(row['countWorkload'] == count and row['condition'] == condition and row['complete'] and len(row['pairs']) == 3 for row in completed_cells) for count, condition in carried['cells'])
native = Native(env, out)
quit_requested = set()
owned_sessions = {}


def save(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')


def event(kind, **fields):
    with (out / 'progress.jsonl').open('a') as target:
        target.write(json.dumps({'timeNs': time.monotonic_ns(), 'kind': kind, **fields}) + '\n')


def execute(*command):
    return subprocess.check_output(command, env=env, text=True, timeout=10).strip()


def rpc(session, method, params=None):
    return core_rpc(session, env, method, params or {})


def core_owner(session):
    status = rpc(session, 'server.status')
    assert {'pid': status['pid'], 'identity': process_identity(status['pid'], metadata_only=True), 'id': status['core']['id'], 'version': status['version']} == owned_sessions[session]
    return status


def wait_for(predicate, seconds=60):
    deadline = time.monotonic() + seconds
    while True:
        result = predicate()
        if result:
            return result
        if time.monotonic() > deadline:
            raise TimeoutError('Required state did not arrive; no automatic replay')
        time.sleep(0.1)


def geometry(record):
    window = record['window']
    assert execute('xdotool', 'getwindowpid', window) == str(record['pid'])
    execute('xdotool', 'windowactivate', '--sync', window)
    execute('xdotool', 'windowstate', '--remove', 'MAXIMIZED_VERT', window)
    execute('xdotool', 'windowstate', '--remove', 'MAXIMIZED_HORZ', window)
    values = protocol['geometry']
    execute('xdotool', 'windowsize', '--sync', window, values['WIDTH'], values['HEIGHT'])
    execute('xdotool', 'windowmove', '--sync', window, values['X'], values['Y'])
    def matched():
        actual = dict(line.split('=', 1) for line in execute('xdotool', 'getwindowgeometry', '--shell', window).splitlines())
        return actual if all(actual[key] == values[key] for key in ['X', 'Y', 'WIDTH', 'HEIGHT']) else None
    record['geometry'] = wait_for(matched)


def close(record, session, terminals):
    assert record['pid'] not in quit_requested
    assert process_identity(record['pid'], metadata_only=True) == record['identity']
    execute('xdotool', 'windowactivate', '--sync', record['window'])
    assert execute('xdotool', 'getactivewindow') == record['window']
    quit_requested.add(record['pid'])
    native('key', 65507, True)
    try:
        native('key', ord('q'), True)
        native('key', ord('q'), False)
    finally:
        native('key', 65507, False)
    def exited():
        path = Path(f"/proc/{record['pid']}/stat")
        return not path.exists() or path.read_text().rsplit(') ', 1)[1].split()[0] == 'Z'
    wait_for(exited, 10)
    current = {item['address']: item['pid'] for item in rpc(session, 'terminal.list', {'all': True})['terminals'] if item['state'] == 'live'}
    assert current == terminals


def reopen(folder, profile, session, variant):
    started = time.monotonic_ns()
    overrides = protocol.get('variants', {}).get(str(variant), {'VOYAGER_EXPERIMENT_COMPACT_BACKGROUNDS': str(variant)})
    process = subprocess.Popen([str(binary), '--profile', str(profile), '--session', session], cwd=folder / 'working', env=env | {'VOYAGER_WORKSPACE_SESSION': session} | overrides, stdout=(folder / 'native.log').open('a'), stderr=subprocess.STDOUT, start_new_session=True)
    save(folder / 'launch-pending.json', {'pid': process.pid, 'session': session, 'identity': process_identity(process.pid, metadata_only=True)})
    def visible():
        assert process.poll() is None
        windows = subprocess.run(['xdotool', 'search', '--onlyvisible', '--pid', str(process.pid)], env=env, capture_output=True, text=True).stdout.split()
        return windows[0] if len(windows) == 1 else None
    window = wait_for(visible, 10)
    actual_env = Path(f'/proc/{process.pid}/environ').read_bytes().split(b'\0')
    assert all((key + '=' + value).encode() in actual_env for key, value in overrides.items())
    record = {'pid': process.pid, 'window': window, 'session': session, 'identity': process_identity(process.pid, metadata_only=True), 'desktopEnvironment': protocol['desktopEnvironment'], 'profile': str(profile), 'visibleUpperNs': time.monotonic_ns() - started, 'environmentOverrides': overrides}
    save(folder / 'launch.json', record)
    geometry(record)
    save(folder / 'launch.json', record)
    return record


def prepare(count):
    folder = out / f'count-{count}'
    folder.mkdir()
    (folder / 'working').mkdir()
    session = f"{protocol['sessionPrefix']}-{count}"
    assert not (Path(env['XDG_RUNTIME_DIR']) / 'herdr-core' / (session + '.sock')).exists()
    command = [sys.executable, str(root / 'prove.py'), '--foundation', '--launch', '--review', '--compositor', '--binary', str(binary), '--session', session, '--working-directory', str(folder / 'working'), '--evidence', str(folder / 'setup'), '--desktop-env', protocol['environmentFile']]
    subprocess.run(command, env=env, stdout=(folder / 'setup.log').open('x'), stderr=subprocess.STDOUT, check=True, timeout=90)
    initial = json.loads((folder / 'setup/launch.json').read_text())
    status = rpc(session, 'server.status')
    owned_sessions[session] = {'pid': status['pid'], 'identity': process_identity(status['pid'], metadata_only=True), 'id': status['core']['id'], 'version': status['version']}
    save(folder / 'core-owner.json', owned_sessions[session])
    record = {**initial, 'identity': process_identity(initial['pid'], metadata_only=True)}
    geometry(record)
    profile = folder / 'setup/profile'
    header = profile / 'mods/header/main.js'
    source = header.read_text()
    assert 'benchmark.js' not in source
    assert source.count('    this.startContext(cx);') == 1
    (header.parent / 'benchmark.js').write_text((Path(__file__).with_name('bootstrap.js')).read_text())
    header.write_text('import { seed } from "./benchmark.js";\n' + source.replace('    this.startContext(cx);', f'    this.startContext(cx);\n    seed(this, cx, {count});'))
    def seeded():
        layout = rpc(session, 'doc.get', {'name': 'voyager-layout-v1'})['value']
        voyage = layout['voyages'][0]
        fleets = voyage['fleets']
        contents = {item['id']: item for item in layout['contents']}
        expected = 3 if count > 1 else 1
        visible = [contents[item['content']] for item in fleets[0]['vessels']]
        ready = len(contents) == count + 1 and layout['selectedFleet'] == fleets[0]['id'] and len(visible) == expected
        ready = ready and sorted(item['typeId'] for item in visible) == (['notes', 'notes', 'terminal'] if count > 1 else ['terminal'])
        ready = ready and all(item.get('backend') for item in contents.values() if item['typeId'] == 'terminal')
        return layout if ready else None
    layout = wait_for(seeded, 90)
    terminals = {item['address']: item['pid'] for item in rpc(session, 'terminal.list', {'all': True})['terminals'] if item['state'] == 'live'}
    assert len(terminals) == (count - 2 if count > 1 else 1)
    save(folder / 'layout.json', layout)
    close(record, session, terminals)
    contents = {item['id']: item for item in layout['contents']}
    visible = next(contents[item['content']]['backend'] for item in layout['voyages'][0]['fleets'][0]['vessels'] if contents[item['content']]['typeId'] == 'terminal')
    hidden = [contents[item['content']]['backend'] for fleet in layout['voyages'][0]['fleets'][1:] for item in fleet['vessels']]
    assert set(terminals) == {visible, *hidden}
    return folder, profile, session, terminals, visible, hidden


try:
    for count in protocol['counts']:
        folder, profile, session, terminals, visible, hidden = prepare(count)
        addresses = list(terminals)
        for condition, rates in protocol['conditions'].items():
            if carried and [count, condition] in carried['cells']:
                event('carried-complete-cell', count=count, condition=condition, source=carried['analysis'])
                continue
            for repeat in range(3):
                order = [0, 1] if repeat % 2 == 0 else [1, 0]
                for variant in order:
                    run = folder / f'{condition}-{repeat + 1}-{variant}'
                    run.mkdir()
                    (run / 'working').symlink_to(folder / 'working', target_is_directory=True)
                    event('start', count=count, condition=condition, repeat=repeat + 1, variant=variant, path=str(run))
                    record = reopen(run, profile, session, variant)
                    core_owner(session)
                    assert {item['address']: item['pid'] for item in rpc(session, 'terminal.list', {'all': True})['terminals'] if item['state'] == 'live'} == terminals
                    for index, address in enumerate(addresses):
                        flood = hidden[-1] if hidden else visible
                        chunk, hz = rates if condition != 'flood' or address == flood else protocol['conditions']['ordinary']
                        command = f'python3 -u {shlex.quote(str(Path(__file__).with_name("producer.py")))} --chunk {chunk} --hz {hz} --seconds 135 --barrier {shlex.quote(str(run / "start-output"))} --out {shlex.quote(str(run / (address + ".jsonl")))}'
                        receipt = rpc(session, 'terminal.send', {'terminal': address, 'text': command, 'submit': True, 'wait': False})
                        save(run / (address + '-dispatch.json'), {'command': command, 'receipt': receipt})
                    wait_for(lambda: all((run / (address + '.jsonl')).exists() and '"kind": "ready"' in (run / (address + '.jsonl')).read_text() for address in addresses), 20)
                    (run / 'start-output').touch(exist_ok=False)
                    wait_for(lambda: all('"kind": "output"' in (run / (address + '.jsonl')).read_text() for address in addresses), 5)
                    time.sleep(protocol['warmSeconds'])
                    status = core_owner(session)
                    save(run / 'terminals-before.json', rpc(session, 'terminal.list', {'all': True}))
                    manifest = {'protocol': str(args.protocol), 'run': run.name, 'variant': variant, 'session': session, 'binarySha256': protocol['binarySha256'], 'app': record, 'terminals': addresses, 'core': {'socket': str(Path(env['XDG_RUNTIME_DIR']) / 'herdr-core' / (session + '.sock')), 'executable': str(Path('/proc/' + str(status['pid']) + '/exe').resolve()), 'id': status['core']['id'], 'version': status['version']}}
                    save(run / 'resources-manifest.json', manifest)
                    sampler = Resources(manifest)
                    collect(sampler, run / 'resources.jsonl', count=61, interval=1)
                    resource_result = json.loads((run / 'resources.jsonl').read_text().splitlines()[-1])
                    assert resource_result['complete'] and resource_result['errors'] == 0, resource_result
                    with (run / 'input-check.log').open('x') as log:
                        anchor = {**record, 'inputTerminal': visible}
                        save(run / 'input-launch.json', anchor)
                        subprocess.run([sys.executable, str(Path(__file__).with_name('native-anchor.py')), str(run / 'input'), str(run / 'input-launch.json'), str(run / (visible + '.jsonl'))], env=env, stdout=log, stderr=subprocess.STDOUT, check=True, timeout=35)
                    def finished():
                        return all(any(json.loads(line)['kind'] == 'complete' for line in (run / (address + '.jsonl')).read_text().splitlines()) for address in addresses)
                    wait_for(finished, 35)
                    for address in addresses:
                        rows = [json.loads(line) for line in (run / (address + '.jsonl')).read_text().splitlines()]
                        assert rows[-1]['kind'] == 'complete'
                        assert rows[-1]['inputs'] == (18 if address == visible else 0)
                        output = [item for item in rows if item['kind'] == 'output']
                        assert [item['sequence'] for item in output] == list(range(rows[-1]['outputs']))
                        assert sum(item['bytes'] for item in output) == rows[-1]['bytes']
                    save(run / 'layout-after.json', rpc(session, 'doc.get', {'name': 'voyager-layout-v1'})['value'])
                    save(run / 'terminals-after.json', rpc(session, 'terminal.list', {'all': True}))
                    close(record, session, terminals)
                    save(run / 'result.json', {'complete': True, 'countWorkload': count, 'countActual': count + 1, 'measurementAcceptance': False})
                    event('complete', count=count, condition=condition, repeat=repeat + 1, variant=variant)
        roster = list(sampler.previous.values())
        core_owner(session)
        stop = stop_existing_core(session, env)
        save(folder / 'cleanup.json', {'stop': stop, 'exits': observe_core_exit(session, env, [{'pid': item['pid'], 'start': item['start']} for item in roster if 'app' not in item['roles']])})
    event('matrix-completed')
except BaseException as error:
    event('failed', error=repr(error))
    for pending in sorted(out.glob('count-*/**/launch-pending.json')):
        if not pending.with_name('launch.json').exists():
            event('pending-launch-unreconciled', record=json.loads(pending.read_text()))
    for pending in sorted(out.glob('count-*/**/launch.json')):
        record = json.loads(pending.read_text())
        if not Path(f"/proc/{record['pid']}").exists() or record['pid'] in quit_requested:
            continue
        try:
            identity = process_identity(record['pid'], metadata_only=True)
            assert all(identity[key] == record['identity'][key] for key in ('uid', 'start', 'executable'))
            record['identity'] = identity
            current = {item['address']: item['pid'] for item in rpc(record['session'], 'terminal.list', {'all': True})['terminals'] if item['state'] == 'live'}
            close(record, record['session'], current)
        except Exception as cleanup_error:
            event('view-cleanup-unconfirmed', pid=record['pid'], error=repr(cleanup_error))
    for session, owner in owned_sessions.items():
        socket = Path(env['XDG_RUNTIME_DIR']) / 'herdr-core' / (session + '.sock')
        if not socket.exists():
            continue
        try:
            status = core_owner(session)
            identity = process_identity(status['pid'], metadata_only=True)
            assert status['pid'] == owner['pid'] and identity == owner['identity'] and status['core']['id'] == owner['id']
            event('failed-session-cleanup', session=session, stop=stop_existing_core(session, env), exits=observe_core_exit(session, env, [{'pid': status['pid'], 'start': identity['start']}]))
        except Exception as cleanup_error:
            event('session-cleanup-unconfirmed', session=socket.stem, error=repr(cleanup_error))
    raise
finally:
    native.close()
