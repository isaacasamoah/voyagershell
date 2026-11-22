import re
import sys
from collections import Counter
from pathlib import Path

FRAME = re.compile(r"^#\d+\s+0x[0-9a-f]+\s+(?:in\s+)?(.+?)(?:\s+-\s+.*)?$")


def frames(text):
    names = []
    for line in text.splitlines():
        match = FRAME.match(line.strip())
        if match:
            names.append(re.sub(r"::h[0-9a-f]{16}$", "", match.group(1)))
    return names


def main():
    folder, prefix = Path(sys.argv[1]), sys.argv[2]
    focus = sys.argv[3] if len(sys.argv) > 3 else None
    inclusive = Counter()
    leaf = Counter()
    total = 0
    for path in sorted(folder.glob(f"{prefix}-*.txt")):
        stack = frames(path.read_text())
        if not stack:
            continue
        if focus and not any(focus in name for name in stack):
            continue
        total += 1
        leaf[stack[0]] += 1
        for name in set(stack):
            inclusive[name] += 1
    print(f"samples {total}")
    for name, count in inclusive.most_common(int(sys.argv[4]) if len(sys.argv) > 4 else 45):
        print(f"{count / total:6.1%} {name[:170]}")
    print("leaf")
    for name, count in leaf.most_common(12):
        print(f"{count / total:6.1%} {name[:170]}")


if __name__ == "__main__":
    main()
