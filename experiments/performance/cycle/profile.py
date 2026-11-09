import json
import os
from pathlib import Path
import subprocess
import sys
import time

root = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(root / 'tests/native'))
from proof_process import process_identity

run, output = map(Path, sys.argv[1:3])
perf = Path(sys.argv[3])
assert perf.is_absolute() and perf.is_file()
perf_env = os.environ | {'LD_LIBRARY_PATH': str(perf.parent.parent / 'lib64') + (':' + os.environ['LD_LIBRARY_PATH'] if os.environ.get('LD_LIBRARY_PATH') else '')}
version = subprocess.check_output([str(perf), '--version'], env=perf_env, text=True, timeout=5).strip()
deadline = time.monotonic() + 1800
while True:
    path = run / 't1.jsonl'
    if path.exists():
        rows = [json.loads(line) for line in path.read_text().splitlines()]
        outputs = [row for row in rows if row['kind'] == 'output']
        if outputs:
            break
    if time.monotonic() >= deadline:
        raise TimeoutError('Named profiling window did not arrive')
    time.sleep(1)
launch = json.loads((run / 'launch.json').read_text())
age = (time.monotonic_ns() - outputs[0]['beforeNs']) / 1e9
assert age < 10, 'Missed warmup window; no profiling was started'
assert process_identity(launch['pid'], metadata_only=True) == launch['identity']
started = time.monotonic_ns()
result = subprocess.run([str(perf), 'record', '-F', '99', '-g', '--call-graph', 'fp', '-p', str(launch['pid']), '-o', str(output.with_suffix('.perf')), '--', 'sleep', '8'], env=perf_env, capture_output=True, text=True, timeout=15)
ended = time.monotonic_ns()
assert process_identity(launch['pid'], metadata_only=True) == launch['identity']
output.write_text(json.dumps({'run': str(run), 'identity': launch, 'perf': str(perf), 'version': version, 'producerAgeAtStart': age, 'startNs': started, 'endNs': ended, 'returncode': result.returncode, 'stderr': result.stderr, 'scope': 'One named diagnostic during warmup only. Require end before the first resource sample; no GUI input or product change.'}, indent=2) + '\n')
assert result.returncode == 0, result.stderr
