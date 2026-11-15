import re
import subprocess
import sys

root = sys.argv[1]
check = sys.argv[2:]
total = 0
sites = []
for round_ in range(20):
    out = subprocess.run(check, cwd=root, capture_output=True, text=True).stderr
    hits = sorted(set(re.findall(r"^([^\s:]+\.rs):(\d+):(\d+): error\[E0063\]", out, re.M)), reverse=True)
    if not hits:
        others = [line for line in out.splitlines() if re.match(r"^\S+\.rs:\d+:\d+: error", line)]
        print(f"rounds={round_} sites={total}")
        for line in others[:20]:
            print("other:", line)
        break
    for path, line, col in hits:
        full = f"{root}/{path}"
        lines = open(full).read().split("\n")
        text = lines[int(line) - 1]
        brace = text.index("{", int(col) - 1)
        lines[int(line) - 1] = text[: brace + 1] + " rest: Default::default()," + text[brace + 1 :]
        open(full, "w").write("\n".join(lines))
        sites.append(f"{path}:{line}")
        total += 1
for site in sites:
    print("site", site)
