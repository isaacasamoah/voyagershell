import copy
import json
from pathlib import Path
import time
import subprocess

from proof_avatar_window import floating_windows


def prove(item, driver, native, field, move, key, button, clip, context):
    record = item['record']
    folder = item['folder'] / 'profile/avatar'
    configuration_path = folder / 'configuration.json'
    original = json.loads(configuration_path.read_text())
    pack = json.loads((folder / original['pack']).read_text())
    before = context()
    evidence = item['folder'] / 'animation-packs'
    evidence.mkdir()

    def execute(*args):
        return subprocess.check_output(args, env=driver.env, text=True, timeout=5).strip()

    def geometry(window=record['window']):
        return dict(line.split('=', 1) for line in execute('xdotool', 'getwindowgeometry', '--shell', window).splitlines())

    def reload():
        native('focus', record['pid'], 'Voyager avatar', 0)
        key(65474, True)
        key(65474, False)

    def assert_pack(name):
        driver.wait(lambda: field('Voyager avatar')['description'], lambda text: f'pack {name}.' in text, 'Compiled animation pack changed')

    def assert_error(fragment):
        observed = []
        def read():
            nonlocal observed
            observed = native('fields', record['pid'], None, 'window')['fields']
            return observed
        try:
            driver.wait(read, lambda values: any(fragment in str(value['name']) + str(value['value']) for value in values), 'Visible animation refusal')
            assert_pack('custom-trial')
        finally:
            driver.save(evidence / (fragment.split()[0] + '-refusal.json'), observed)
            bounds = geometry()
            native('capture', str(evidence / (fragment.split()[0] + '-refusal.png')), [int(bounds[k]) for k in ('X', 'Y', 'WIDTH', 'HEIGHT')], 2)

    modified = copy.deepcopy(pack)
    modified['id'] = 'custom-trial'
    driver.save(folder / 'custom.json', modified)
    configuration = original | {'pack': 'custom.json', 'triggers': original['triggers'] | {'hover': 'float'}}
    driver.save(configuration_path, configuration)
    reload()
    assert_pack('custom-trial')
    move(field('Vessel dock'))
    clip('custom-hover-float', 'hover')
    move(field('Vessel dock'))
    invalid = copy.deepcopy(configuration)
    invalid['triggers']['hover'] = 'missing'
    driver.save(configuration_path, invalid)
    reload()
    assert_error('Unknown trigger clip missing')
    clip('last-good-after-reference', 'hover')
    move(field('Vessel dock'))
    driver.save(configuration_path, configuration)
    modified['images']['rest'] = 'broken.png'
    (folder / 'broken.png').write_bytes(b'not a PNG')
    driver.save(folder / 'custom.json', modified)
    reload()
    assert_error('Loading animation image broken.png')
    clip('last-good-after-png', 'hover')
    move(field('Vessel dock'))
    driver.save(configuration_path, original)
    reload()
    assert_pack('voyager-default')
    driver.wait(lambda: native('fields', record['pid'], None, 'window')['fields'],
                lambda values: not any('Loading animation image broken.png' in str(value['name']) + str(value['value']) for value in values), 'Resolved animation error cleared')
    driver.wait(lambda: field('Voyager avatar')['focused'], bool, 'Avatar commands stay focused')
    bounds_before = geometry()
    move(field('Voyager avatar'))
    time.sleep(4)
    button(True)
    button(False)
    driver.wait(lambda: execute('xprop', '-id', record['window'], 'WM_STATE'), lambda text: 'Iconic' in text, 'Click minimizes workspace')
    floating = driver.wait(lambda: floating_windows(record, geometry, driver.env), lambda windows: len(windows) == 1, 'One floating avatar')[0]
    bounds = geometry(floating)
    native('move', int(bounds['X']) + int(bounds['WIDTH']) // 2, int(bounds['Y']) + int(bounds['HEIGHT']) // 2, 2)
    button(True)
    button(False)
    driver.wait(lambda: execute('xprop', '-id', record['window'], 'WM_STATE'), lambda text: 'Normal' in text, 'Click restores workspace')
    driver.wait(lambda: floating_windows(record, geometry, driver.env), lambda windows: not windows, 'Floating view retired')
    assert all(geometry()[key] == bounds_before[key] for key in ('X', 'Y', 'WIDTH', 'HEIGHT'))
    driver.wait(lambda: execute('xdotool', 'getactivewindow'), lambda window: window == record['window'], 'Restored workspace is active')
    assert context() == before
    driver.save(evidence / 'verified.json', {'customPack': 'custom-trial', 'lastGoodAfterInvalidReference': True, 'lastGoodAfterInvalidPng': True, 'clickMinimizeRestore': True, 'sameBounds': True, 'sameContext': True})
