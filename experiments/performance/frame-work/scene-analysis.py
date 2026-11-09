import json
from pathlib import Path
import sys

from owner import amd_graphics_counters

folder = Path(sys.argv[1])
protocol = json.loads((folder / 'protocol.json').read_text())
assert json.loads((folder / 'owner-before.json').read_text()) == json.loads((folder / 'owner-restored.json').read_text())
assert json.loads((folder / 'input-released.json').read_text())['ownerUnchanged']
runs = []
for index, case in enumerate(protocol['cases'], 1):
    app, density, reduced = case
    path = folder / f'{index:02d}-{app}-{density}-reduced-{int(reduced)}'
    record = json.loads((path / 'launch.json').read_text())
    manifest = json.loads((path / 'observed-processes.json').read_text())
    rows = [json.loads(line) for line in (path / 'resources.jsonl').read_text().splitlines()]
    assert len(rows) == protocol['samples'] and [r['sample'] for r in rows] == list(range(protocol['samples']))
    assert all(a['beforeNs'] < a['afterNs'] < b['beforeNs'] for a, b in zip(rows, rows[1:]))
    assert all({pid: process['identity'] for pid, process in row['processes'].items()} == manifest for row in rows)
    owner_pid = str(protocol['owner']['pid'])
    graphics = [amd_graphics_counters(row['processes'][owner_pid]['graphics']) for row in rows
                if 'graphics' in row['processes'][owner_pid]]
    assert len(graphics) >= 3 and all(value == graphics[0] for value in graphics), 'Owner GPU advanced'
    assert json.loads((path / 'static-verified.json').read_text())['condition'] == case
    cleanup = json.loads((path / 'cleanup-confirmed.json').read_text())
    assert cleanup['appExited'] and cleanup['coreStop']
    first, last = rows[0], rows[-1]
    span = (last['beforeNs'] + last['afterNs'] - first['beforeNs'] - first['afterNs']) / 2
    low_span, high_span = last['beforeNs'] - first['afterNs'], last['afterNs'] - first['beforeNs']
    pid = str(record['pid'])
    core_pid = str(json.loads((path / 'ownership.json').read_text())['core']['pid'])

    def cpu(selected, thread):
        before = list(map(int, first['processes'][selected]['threads'][thread]['schedstat'].split()))
        after = list(map(int, last['processes'][selected]['threads'][thread]['schedstat'].split()))
        assert all(b >= a for a, b in zip(before, after))
        elapsed = after[0] - before[0]
        return {'percentOneCore': 100 * elapsed / span,
                'readBracketBounds': [100 * elapsed / high_span, 100 * elapsed / low_span],
                'schedulerWaitMs': (after[1] - before[1]) / 1e6}

    result = {'case': index, 'app': app, 'density': density, 'reducedMotion': reduced,
              'variant': protocol.get('caseArtifacts', {}).get(str(index), {}).get('variant', app),
              'windowSeconds': span / 1e9, 'ui': cpu(pid, pid), 'coreMain': cpu(core_pid, core_pid),
              'source': str(path), 'screenshot': str(path / 'capture/scene.png')}
    if app == 'herdr':
        bench = [json.loads(line) for line in (path / 'herdr-bench.jsonl').read_text().splitlines()]
        bench = [r for r in bench if first['wallNs'] / 1e9 + 1 <= r['t'] <= last['wallNs'] / 1e9]
        assert len(bench) >= 8
        result['herdrBench'] = {'reports': len(bench), 'scope': 'Mean of complete one-second benchmark reports inside resource window',
                               **{key: sum(r[key] for r in bench) / len(bench)
                                  for key in ('window', 'terminal', 'grid', 'rows', 'scripts', 'materialize', 'frame_ms')}}
    runs.append(result)
summary = {'scope': protocol['scope'], 'runs': runs, 'ownerRestored': True,
           'limits': 'Static-scene CPU discriminator, not typing latency. Reduced motion is diagnostic only. Sparse controls have one observation. Stack samples are outside scored windows. Actual per-window accessibility is unobserved.'}
(folder / 'analysis.json').write_text(json.dumps(summary, indent=2) + '\n')
for run in runs:
    print(run['case'], run['variant'], run['density'], 'reduced' if run['reducedMotion'] else 'ordinary',
          round(run['ui']['percentOneCore'], 3), run.get('herdrBench', {}))
