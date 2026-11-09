import argparse
import hashlib
import json
import os
from pathlib import Path
import shlex
import signal
import subprocess
import sys
import time

root = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(root / "tests/native"))
from proof_process import process_identity
from proof_resources import child_processes
from proof_workspace import core_rpc, stop_existing_core
from proof_native_control import stable_geometry

base = Path('/var/tmp/voyager-typing-latency-20261108')
desktop_file = Path('/var/tmp/voyager-performance-cycle-20261107/matrix-desktop-env.json')
desktop = json.loads(desktop_file.read_text())[1]['env']
env = os.environ | desktop
for key in ['HC_SESSION', 'HC_SOCKET', 'HC_TERMINAL_ID', 'WAYLAND_DISPLAY']:
    env.pop(key, None)
work = base / 'typing-working'
argv = json.loads((base / 'voyager-calibration-02/codex-launch-intent.json').read_text())['argv'] + ['-c', 'check_for_update_on_startup=false']
owned = []


def save(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')


def rpc(session, method, params=None):
    return core_rpc(session, env, method, params or {})


def wait(get, predicate, label, seconds=15):
    deadline = time.monotonic() + seconds
    while True:
        value = get()
        if predicate(value):
            return value
        assert time.monotonic() < deadline, label
        time.sleep(.1)


def launch(app, folder, artifact, trace=True):
    session = 'voyager-typing-' + hashlib.sha256(str(folder).encode()).hexdigest()[:16]
    assert not (Path(env['XDG_RUNTIME_DIR']) / 'herdr-core' / (session + '.sock')).exists()
    program = artifact.get('inputProgram', 'codex')
    assert program in ('codex', 'echo', 'stream-echo')
    origin = artifact.get('windowOrigin', [2980, 200])
    assert len(origin) == 2 and all(type(value) is int for value in origin)
    initial_argv = argv if program == 'codex' else ['bash', '--noprofile', '--norc']
    if app == 'voyager':
        command = [sys.executable, str(root / 'prove.py'), '--foundation', '--review', '--compositor', '--launch',
                   '--binary', artifact['binary'], '--session', session, '--evidence', str(folder),
                   '--desktop-env', str(desktop_file), '--working-directory', str(work), '--window-origin', *map(str, origin)]
        run_env = env | {'VOYAGER_TYPING_TRACE': '1' if trace else '0', 'VOYAGER_EXPERIMENT_COMPACT_BACKGROUNDS': '1'}
        run_env.pop('VOYAGER_TYPING_TRACE_INPUT_ONLY', None)
        if artifact.get('inputOnlyTrace', False):
            assert trace and artifact['inputOnlyTrace'] is True
            run_env['VOYAGER_TYPING_TRACE_INPUT_ONLY'] = '1'
        reduced_motion = artifact.get('reducedMotion', False)
        assert type(reduced_motion) is bool, 'Reduced-motion control must be boolean'
        run_env.pop('VOYAGER_REDUCED_MOTION', None)
        if reduced_motion:
            run_env['VOYAGER_REDUCED_MOTION'] = '1'
        visible_output = artifact.get('visibleOutput', False)
        assert type(visible_output) is bool, 'Visible-output control must be boolean'
        run_env.pop('VOYAGER_EXPERIMENT_VISIBLE_OUTPUT', None)
        if visible_output:
            run_env['VOYAGER_EXPERIMENT_VISIBLE_OUTPUT'] = '1'
        pixel_motion = artifact.get('pixelMotion', False)
        assert type(pixel_motion) is bool, 'Pixel-motion control must be boolean'
        run_env.pop('VOYAGER_EXPERIMENT_PIXEL_MOTION', None)
        if pixel_motion:
            run_env['VOYAGER_EXPERIMENT_PIXEL_MOTION'] = '1'
        dirty_wake = artifact.get('dirtyWake', False)
        assert type(dirty_wake) is bool, 'Dirty-wake control must be boolean'
        run_env.pop('VOYAGER_EXPERIMENT_DIRTY_WAKE', None)
        if dirty_wake:
            run_env['VOYAGER_EXPERIMENT_DIRTY_WAKE'] = '1'
        with folder.with_suffix('.launch.log').open('x') as log:
            subprocess.run(command, env=run_env, cwd=root, stdout=log, stderr=subprocess.STDOUT, check=True, timeout=25)
        record = json.loads((folder / 'launch.json').read_text())
    else:
        folder.mkdir()
        profile = folder / 'profile'
        profile.mkdir()
        save(profile / 'settings.json', {'zoom': 1, 'font': 'DejaVu Sans Mono', 'font_size': 13,
                                        'telemetry': False, 'font_ligatures': False, 'minimum_contrast': 1})
        save(profile / 'shared.json', {'frame.welcomed': 'skipped'})
        run_env = env | {'HERDR_APP_HOME': str(profile), 'XDG_STATE_HOME': str(folder / 'state'), 'HC_SESSION': session}
        if artifact.get('coreBinary'):
            settings = json.loads((profile / 'settings.json').read_text()) | {'core': artifact['coreBinary']}
            save(profile / 'settings.json', settings)
        if artifact.get('releasesUrl'):
            run_env['HERDR_RELEASES_URL'] = artifact['releasesUrl']
        with (folder / 'native.log').open('x') as log:
            process = subprocess.Popen([artifact['binary']], env=run_env, cwd=work, stdout=log, stderr=log, start_new_session=True)
        pending = {'pid': process.pid, 'identity': process_identity(process.pid, metadata_only=True)}
        save(folder / 'launch-pending.json', pending)
        window = wait(lambda: subprocess.run(['xdotool', 'search', '--onlyvisible', '--pid', str(process.pid)],
                      env=env, capture_output=True, text=True).stdout.split(), lambda v: len(v) == 1, 'Herdr window')[0]
        record = pending | {'window': window, 'session': session, 'desktopEnvironment': desktop, 'profile': str(profile)}
        save(folder / 'launch.json', record)
    core = rpc(session, 'server.status')
    assert core['pid'] not in [8951, 7049, 1137809, 255377]
    item = {'record': record, 'core': core, 'folder': folder, 'app': app, 'closed': False}
    owned.append(item)
    save(folder / 'ownership.json', {'launch': record, 'core': core})
    if app == 'herdr':
        for attempt in range(40):
            result = subprocess.run([artifact['binary'], 'do', 'space.new', json.dumps({'name': 'Typing', 'folder': str(work), 'tab': 'Codex', 'argv': initial_argv})],
                                    env=run_env, text=True, capture_output=True, timeout=15)
            save(folder / f'create-{attempt}.json', {'returncode': result.returncode, 'stdout': result.stdout, 'stderr': result.stderr})
            if result.returncode == 0:
                break
            assert json.loads(result.stdout).get('error') == "This machine's layout is unavailable. Try again when it reconnects."
            time.sleep(.25)
        assert result.returncode == 0
    elif program == 'codex':
        save(folder / 'codex-send.json', rpc(session, 'terminal.send', {'terminal': 't1', 'text': shlex.join(argv), 'wait': False}))
    width, height = (2788, 1700) if app == 'voyager' else (2900, 1880)
    window = record['window']
    actions = [['windowactivate', '--sync', window], ['windowsize', '--sync', window, str(width), str(height)]]
    if 'windowOrigin' in artifact:
        actions.insert(0, ['windowmove', '--sync', window, *map(str, origin)])
    for args in actions:
        subprocess.check_call(['xdotool', *args], env=env)
    if 'windowOrigin' in artifact:
        execute = lambda *args: subprocess.check_output(args, env=env, text=True).strip()
        placed = stable_geometry(window, execute)
        correction = [2 * target - int(placed[key]) for target, key in zip(origin, ['X', 'Y'])]
        if correction != origin:
            subprocess.check_call(['xdotool', 'windowmove', '--sync', window, *map(str, correction)], env=env)
        settled = stable_geometry(window, execute)
        save(folder / 'placement.json', {'target': origin, 'firstObserved': placed, 'correction': correction, 'settled': settled})
        assert [int(settled[key]) for key in ['X', 'Y', 'WIDTH', 'HEIGHT']] == [*origin, width, height]
    if program in ('echo', 'stream-echo'):
        wait(lambda: rpc(session, 'terminal.get', {'terminal': 't1'}),
             lambda t: t['cols'] == 145 and t['rows'] == 39, 'Echo grid ready before start')
        echo_argv = ['bash', '--noprofile', '--norc', '-c',
                     r"stty raw -echo && printf '\033[2J\033[36;1H› ' && exec cat"]
        if program == 'stream-echo':
            assert type(artifact['outputLoad']) is bool
            workload = root / 'experiments/performance/typing-latency/echo-output.py'
            echo_argv = [sys.executable, str(workload), '--marker', str(folder / 'output.start'),
                         '--receipt', str(folder / 'output.jsonl'), '--mode', 'burst' if artifact['outputLoad'] else 'quiet', '--seconds', '6']
            item['workload'] = {'argv': echo_argv, 'marker': str(folder / 'output.start'),
                                'receipt': str(folder / 'output.jsonl'), 'mode': echo_argv[-3],
                                'seconds': 6, 'sha256': hashlib.sha256(workload.read_bytes()).hexdigest()}
        save(folder / 'echo-start-intent.json', {'argv': echo_argv, 'terminal': 't1', 'session': session})
        save(folder / 'echo-send.json', rpc(session, 'terminal.send', {'terminal': 't1', 'text': shlex.join(echo_argv), 'wait': False}))
    foreground = Path(sys.executable).name if program == 'stream-echo' else ('cat' if program == 'echo' else 'codex')
    wait(lambda: rpc(session, 'terminal.get', {'terminal': 't1'}),
         lambda t: ((t.get('foreground') or {}).get('argv', [])[1:] == echo_argv[1:]
                    if program == 'stream-echo' else (t.get('foreground') or {}).get('name') == foreground), 'Input program foreground')
    terminal = wait(lambda: rpc(session, 'terminal.get', {'terminal': 't1'}), lambda t: t['cols'] == 145 and t['rows'] == 39, 'Matched145x39 grid')
    ready = wait(lambda: rpc(session, 'terminal.read', {'terminal': 't1', 'lines': 0}),
                 lambda t: (
                     len(t['text'].splitlines()) >= 36 and t['text'].splitlines()[35].rstrip() == '›'
                     if program in ('echo', 'stream-echo') else
                     'Ask Codex to do anything' in t['text'] and 'enter continue' not in t['text']
                 ), 'Input program ready')
    save(folder / 'geometry.json', terminal)
    save(folder / 'ready.json', ready)
    if program == 'stream-echo':
        path = Path(item['workload']['receipt'])
        receipt = wait(lambda: [json.loads(line) for line in path.read_bytes().split(b'\n')[:-1]] if path.exists() else [],
                       bool, 'Producer ready receipt')
        assert len(receipt) == 1 and receipt[0]['event'] == 'ready'
        assert receipt[0]['pid'] == terminal['foreground']['pid'] and receipt[0]['argv'] == echo_argv[1:]
        assert Path(f"/proc/{receipt[0]['pid']}/exe").resolve() == Path(sys.executable).resolve()
        item['workload']['pid'] = receipt[0]['pid']
        save(folder / 'workload.json', item['workload'])
    assert len([t for t in rpc(session, 'terminal.list', {'all': True})['terminals'] if t['state'] == 'live']) == 1
    return item


def cleanup(item):
    if item['closed']:
        return
    record, folder = item['record'], item['folder']
    status = rpc(record['session'], 'server.status')
    assert status['pid'] == item['core']['pid'] and status['core']['id'] == item['core']['core']['id']
    assert not (folder / 'cleanup-intent.json').exists()
    save(folder / 'cleanup-intent.json', {'launch': record, 'core': status})
    for terminal in rpc(record['session'], 'terminal.list', {'all': True})['terminals']:
        if terminal['state'] == 'live':
            save(folder / ('killed-' + terminal['address'] + '.json'), rpc(record['session'], 'terminal.kill', {'terminal': terminal['address']}))
    assert all(v == record['identity'][k] for k, v in process_identity(record['pid'], metadata_only=True).items())
    os.kill(record['pid'], signal.SIGTERM)
    def ended():
        path = Path(f"/proc/{record['pid']}/stat")
        return not path.exists() or path.read_text().rsplit(') ', 1)[1].split()[0] == 'Z'
    wait(ended, bool, 'Scratch app exit', 5)
    stopped = stop_existing_core(record['session'], env)
    save(folder / 'cleanup-confirmed.json', {'appExited': True, 'coreStop': stopped})
    item['closed'] = True


def process_scope(item):
    record = item['record']
    terminal = rpc(record['session'], 'terminal.get', {'terminal': 't1'})
    descendants = child_processes(Path('/proc'))
    pids = {record['pid'], item['core']['pid'], terminal['pid'], terminal['foreground']['pid']}
    pending = list(pids)
    while pending:
        for pid in descendants.get(pending.pop(), {}):
            if pid not in pids:
                pids.add(pid)
                pending.append(pid)
    discovered = {str(pid): process_identity(pid, metadata_only=True) for pid in sorted(pids) if Path(f'/proc/{pid}').exists()}
    stable = {record['pid'], item['core']['pid'], terminal['pid'], terminal['foreground']['pid']}
    core_executable = process_identity(item['core']['pid'], metadata_only=True)['executable']
    for pid in pids - stable:
        try:
            command = Path(f'/proc/{pid}/cmdline').read_bytes().split(b'\0')
        except OSError:
            continue
        arguments = command[1:]
        if arguments and arguments[-1] == b'':
            arguments = arguments[:-1]
        if (arguments in ([b'connect'], [b'connect', b'--session', record['session'].encode()])
                and discovered[str(pid)]['executable'] == core_executable
                and b'HC_SESSION=' + record['session'].encode() in Path(f'/proc/{pid}/environ').read_bytes().split(b'\0')):
            stable.add(pid)
    return discovered, stable


def measure(item, config, label):
    folder, record = item['folder'], item['record']
    discovered, stable = process_scope(item)
    for pid, identity in config.get('backgroundObservers', {}).items():
        assert process_identity(int(pid), metadata_only=True) == identity
        stable.add(int(pid))
    save(folder / 'resource-scope.json', {'scope': 'Selected app/Core/terminal/Codex and identified hc-connect bridge only. Other helpers are contextual inventory, not complete cost accounting.', 'discovered': discovered, 'selected': sorted(stable)})
    pids = stable
    assert len(pids) <= 16
    manifest = {str(pid): process_identity(pid, metadata_only=True) for pid in sorted(pids)}
    save(folder / 'observed-processes.json', manifest)
    protocol = config | {'launch': str(folder / 'launch.json'), 'resourceManifest': str(folder / 'observed-processes.json'), 'condition': label}
    if 'workload' in item:
        protocol['workload'] = item['workload']
    actual_hash = hashlib.sha256(Path(f"/proc/{record['pid']}/exe").resolve().read_bytes()).hexdigest()
    if label != 'calibration':
        assert actual_hash == config['binarySha256'], "Application binary changed after protocol freeze"
    protocol['binarySha256'] = actual_hash
    if label == 'calibration':
        protocol.pop('resourceManifest', None)
    save(folder / 'typing-protocol.json', protocol)
    with (folder / 'typing.log').open('x') as log:
        subprocess.run([sys.executable, str(Path(__file__).with_name('codex-keys.py')), str(folder / 'typing-protocol.json'), str(folder / 'input')],
                       env=env, cwd=root, stdout=log, stderr=subprocess.STDOUT, timeout=45, check=True)
    with (folder / 'characters.json').open('x') as result, (folder / 'character-errors.log').open('x') as errors:
        subprocess.run([sys.executable, str(Path(__file__).with_name('characters.py')), str(folder / 'typing-protocol.json'), str(folder / 'input')],
                       env=env, cwd=root, stdout=result, stderr=errors, check=True, timeout=10)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['calibrate', 'calibrate-herdr', 'run'])
    args = parser.parse_args()
    out = base / {'calibrate': 'cpu-calibration-01', 'calibrate-herdr': 'cpu-calibration-02', 'run': 'cpu-comparison-01'}[args.mode]
    out.mkdir()
    artifact = json.loads((base / 'trace-build-02/artifact.json').read_text())
    assert hashlib.sha256(Path(artifact['binary']).read_bytes()).hexdigest() == artifact['sha256']
    if args.mode in ['calibrate', 'calibrate-herdr']:
        cases = [('herdr', 'calibration')] if args.mode == 'calibrate-herdr' else [('voyager', 'calibration'), ('herdr', 'calibration')]
        configs = {'voyager': json.loads((base / 'voyager-calibration-protocol.json').read_text()) | {'roi': [257, 717, 112, 18]},
                   'herdr': json.loads((base / 'herdr-calibration-protocol-repaired.json').read_text())}
    else:
        frozen = json.loads((base / 'cpu-protocol.json').read_text())
        assert frozen['artifact'] == artifact
        cases, configs = frozen['cases'], frozen['configs']
    load = None
    try:
        for index, (app, condition) in enumerate(cases, 1):
            folder = out / f'{index:02d}-{app}-{condition}'
            save(out / 'progress.json', {'case': index, 'app': app, 'condition': condition, 'state': 'preparing'})
            item = launch(app, folder, artifact)
            if condition == 'cpu':
                log = folder / 'load.jsonl'
                load = subprocess.Popen([sys.executable, str(Path(__file__).with_name('cpu-load.py')), '--out', str(log)], env=env,
                                        stdout=(folder / 'load.stdout').open('x'), stderr=(folder / 'load.stderr').open('x'), start_new_session=True)
                save(folder / 'load-owner.json', {'pid': load.pid, 'identity': process_identity(load.pid, metadata_only=True)})
                wait(lambda: log.exists() and '"started"' in log.read_text(), bool, 'CPU workers started')
            time.sleep(10)
            save(out / 'progress.json', {'case': index, 'app': app, 'condition': condition, 'state': 'typing'})
            measure(item, configs[app], condition)
            cleanup(item)
            if load:
                assert load.wait(timeout=40) == 0
                completion = [json.loads(line) for line in log.read_text().splitlines()]
                assert completion[-1]['kind'] == 'complete' and len(completion[-1]['workers']) == 20
                load = None
            save(out / 'progress.json', {'case': index, 'app': app, 'condition': condition, 'state': 'complete'})
    finally:
        if load is not None:
            assert load.wait(timeout=65) == 0
        for item in reversed(owned):
            if not item['closed']:
                cleanup(item)
        owner = json.loads(Path('/home/isaac/.local/share/voyagershell-foundation/active-preview.json').read_text())
        assert all(v == owner['identity'][k] for k, v in process_identity(owner['pid'], metadata_only=True).items())
        subprocess.check_call(['xdotool', 'windowactivate', '--sync', owner['window']], env=env)
        save(out / 'input-released.json', {'ownerUnchanged': True, 'atNs': time.monotonic_ns()})


if __name__ == '__main__':
    main()
