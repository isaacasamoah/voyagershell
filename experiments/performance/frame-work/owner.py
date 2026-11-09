from contextlib import contextmanager
import json
import subprocess
import time


def amd_graphics_counters(graphics):
    values = {}
    for client, fields in graphics.items():
        if fields.get('drm-driver') == 'amdgpu' and 'drm-engine-gfx' in fields:
            assert fields.get('drm-pdev') and fields.get('drm-client-id')
            value, unit = fields['drm-engine-gfx'].split()
            assert unit == 'ns' and int(value) >= 0
            values[client] = int(value)
    assert values, 'Owner AMD graphics activity is unavailable'
    return values


def verify_quiet(owner, driver, folder):
    keys = json.loads((folder / 'characters.json').read_text())['keys']
    begin, end = keys[0]['dispatchNs'][0], keys[-1]['matchingFrameNs'][1]
    pid = str(owner['pid'])
    rows = [json.loads(line) for line in (folder / 'input/resources.jsonl').read_text().splitlines()]
    samples = [row for row in rows if 'graphics' in row['processes'][pid]]
    preceding = [row for row in samples if row['afterNs'] <= begin]
    following = [row for row in samples if row['beforeNs'] >= end]
    assert preceding and following, 'Owner graphics observations do not cover the keys'
    selected = [row for row in samples if preceding[-1]['beforeNs'] <= row['beforeNs'] <= following[0]['beforeNs']]
    counters = []
    for row in selected:
        record = row['processes'][pid]
        assert all(owner['identity'][key] == value for key, value in record['identity'].items())
        counters.append(amd_graphics_counters(record['graphics']))
    assert len(counters) >= 3 and all(values == counters[0] for values in counters), 'Owner graphics advanced or changed identity while hidden'
    driver.save(folder / 'hidden-owner-gpu.json', {'samples': len(counters), 'beforeNs': selected[0]['beforeNs'], 'afterNs': selected[-1]['afterNs'], 'counters': counters[0], 'noObservedAdvance': True})


@contextmanager
def hidden_view(owner, driver, out):
    pid, window = owner['pid'], owner['window']
    identity = driver.process_identity(pid, metadata_only=True)
    assert all(value == owner['identity'][key] for key, value in identity.items())

    def command(*args):
        return subprocess.check_output(args, env=driver.env, text=True, timeout=8).strip()

    def geometry():
        return dict(line.split('=', 1) for line in command('xdotool', 'getwindowgeometry', '--shell', window).splitlines())

    def window_state():
        value = command('xprop', '-id', window, '_NET_WM_STATE')
        return sorted(state for state in ('MAXIMIZED_VERT', 'MAXIMIZED_HORZ', 'FULLSCREEN')
                      if '_NET_WM_STATE_' + state in value)

    def windows():
        result = subprocess.run(['xdotool', 'search', '--onlyvisible', '--pid', str(pid)], env=driver.env, text=True, capture_output=True, timeout=5)
        assert result.returncode in (0, 1)
        return result.stdout.split()

    def retained():
        status = driver.rpc(owner['session'], 'server.status')
        programs = driver.rpc(owner['session'], 'terminal.list', {'all': True})['terminals']
        return {'corePid': status['pid'], 'core': driver.process_identity(status['pid'], metadata_only=True),
                'coreId': status['core']['id'],
                'layout': driver.rpc(owner['session'], 'doc.get', {'name': 'voyager-layout-v1'}),
                'live': {t['address']: {'pid': t['pid'], 'identity': driver.process_identity(t['pid'], metadata_only=True)} for t in programs if t['state'] == 'live'}}

    def verify_hidden():
        assert driver.process_identity(pid, metadata_only=True) == identity
        assert windows() == [], 'An owner view became visible during the comparison'

    command('xdotool', 'windowactivate', '--sync', window)
    before = {'identity': identity, 'geometry': geometry(), 'windowState': window_state(), 'windows': windows(), 'retained': retained()}
    assert before['windows'] == [window]
    assert command('xdotool', 'getwindowpid', window) == str(pid)
    driver.save(out / 'owner-before.json', before)
    requested = False
    try:
        intent = out / 'owner-unmap-intent.json'
        assert not intent.exists()
        driver.save(intent, {'pid': pid, 'window': window, 'identity': identity})
        requested = True
        command('xdotool', 'windowunmap', '--sync', window)
        driver.wait(windows, lambda values: not values, 'All owner views hidden', 5)
        assert retained() == before['retained']
        driver.save(out / 'owner-hidden.json', {'visibleWindows': [], 'retained': True})
        yield verify_hidden
    finally:
        if requested:
            assert driver.process_identity(pid, metadata_only=True) == identity
            intent = out / 'owner-map-intent.json'
            assert not intent.exists()
            driver.save(intent, {'pid': pid, 'window': window, 'identity': identity})
            command('xdotool', 'windowmap', '--sync', window)
            command('xdotool', 'windowactivate', '--sync', window)
            expected = before['geometry']
            extents = command('xprop', '-id', window, '_NET_FRAME_EXTENTS').split('=', 1)[1].split(',')
            left, _, top, _ = map(int, extents)
            command('xdotool', 'windowmove', '--sync', window, str(int(expected['X'])-left), str(int(expected['Y'])-top))
            if before['windowState']:
                for state in ('MAXIMIZED_VERT', 'MAXIMIZED_HORZ', 'FULLSCREEN'):
                    if state in before['windowState']:
                        command('xdotool', 'windowstate', '--add', state, window)
                        driver.wait(window_state, lambda actual: state in actual, 'Saved window state restored', 5)
            else:
                command('xdotool', 'windowsize', '--sync', window, expected['WIDTH'], expected['HEIGHT'])
            for state in window_state():
                if state not in before['windowState']:
                    command('xdotool', 'windowstate', '--remove', state, window)
                    driver.wait(window_state, lambda actual: state not in actual, 'Temporary window state retired', 5)
            driver.wait(geometry, lambda actual: actual == expected, 'Exact owner geometry restored', 10)
            after = {'identity': driver.process_identity(pid, metadata_only=True), 'geometry': geometry(), 'windowState': window_state(), 'windows': windows(), 'retained': retained()}
            assert after == before
            assert command('xdotool', 'getactivewindow') == window
            driver.save(out / 'owner-restored.json', after)
