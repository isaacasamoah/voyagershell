import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import time

root = Path(__file__).resolve().parents[3]
target = Path(os.environ['CARGO_TARGET_DIR'])
assert target.is_absolute() and target.is_dir()
assert os.environ['CARGO_PROFILE_DEV_DEBUG'] == '0'
assert Path(os.environ['XDG_RUNTIME_DIR']).is_dir()
matrix, out = map(Path, sys.argv[1:3])
out.mkdir()
deadline = time.monotonic() + 10800
while True:
    text = (matrix / 'progress.jsonl').read_text()
    rows = [json.loads(line) for line in text.splitlines()]
    if any(row['kind'] == 'failed' for row in rows):
        raise RuntimeError('The preceding matrix failed; review it before building')
    if rows[-1]['kind'] == 'matrix-completed':
        break
    if time.monotonic() > deadline:
        raise TimeoutError('Matrix completion was not confirmed')
    time.sleep(2)
files = set(subprocess.check_output(['git', 'ls-files', '-co', '--exclude-standard', '--', 'Cargo.toml', 'Cargo.lock', 'contract', 'app', 'desktop', 'content', 'experiments/performance/row-paint'], cwd=root, text=True).splitlines())
files = sorted(name for name in files if (root / name).is_file())
sources = {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in files}
with tarfile.open(out / 'source.tar.gz', 'w:gz') as archive:
    for name in files:
        archive.add(root / name, arcname=name, recursive=False)
(out / 'source.json').write_text(json.dumps(sources, indent=2) + '\n')
commands = [
    ('sdk', ['python3', 'desktop/prepare-sdk.py', '--check']),
    ('install', ['npm', 'ci', '--ignore-scripts']),
    ('fmt', ['cargo', 'fmt', '--all', '--check']),
    ('tests', ['cargo', 'test', '--workspace', '--locked']),
    ('clippy', ['cargo', 'clippy', '--workspace', '--all-targets', '--locked', '--', '-D', 'warnings']),
    ('script-format', ['npm', 'run', 'format:check']),
    ('script-tests', ['npm', 'test']),
    ('contract', ['npm', 'run', 'contract:check']),
    ('release', ['cargo', 'build', '--release', '--locked', '-p', 'voyager-desktop', '--bin', 'voyager-shell']),
]
for name, command in commands:
    (out / 'status.json').write_text(json.dumps({'stage': name, 'completed': False}) + '\n')
    with (out / (name + '.log')).open('x') as log:
        result = subprocess.run(command, cwd=root, stdout=log, stderr=subprocess.STDOUT, timeout=900)
    if result.returncode:
        raise RuntimeError(f'{name} failed with status {result.returncode}')
assert all(hashlib.sha256((root / name).read_bytes()).hexdigest() == value for name, value in sources.items())
artifact = out / 'voyager-shell'
shutil.copy2(target / 'release/voyager-shell', artifact)
(out / 'status.json').write_text(json.dumps({'stage': 'ready-for-native-checks', 'completed': True, 'binary': str(artifact), 'sha256': hashlib.sha256(artifact.read_bytes()).hexdigest(), 'sourceArchive': str(out / 'source.tar.gz')}, indent=2) + '\n')
