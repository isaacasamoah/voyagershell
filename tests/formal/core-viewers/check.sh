#!/bin/sh
set -eu

root=$(git rev-parse --show-toplevel)
here="$root/tests/formal/core-viewers"
skill="$root/.agents/skills/core-viewers/SKILL.md"
version=1.7.4
digest=936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88
cache="${CARGO_TARGET_DIR:-$root/target}/tla"
jar="$cache/tla2tools-$version.jar"

if [ ! -f "$jar" ]; then
    mkdir -p "$cache"
    curl -fsSL -o "$jar.part" "https://github.com/tlaplus/tlaplus/releases/download/v$version/tla2tools.jar"
    mv "$jar.part" "$jar"
fi
echo "$digest  $jar" | sha256sum -c --quiet

sync=$(sed -n 's/^Sync commit is `\([0-9a-f]\{40\}\)`\.$/\1/p' "$skill")
if [ -z "$sync" ]; then
    echo "$skill has no line like: Sync commit is \`<40 hex digits>\`."
    exit 1
fi
covered=$(sed -n 's/^| `\([^`]*\)` |.*/\1/p' "$skill" | sort -u)
drift=0
if ! git -C "$root" diff --quiet "$sync" -- $covered; then
    echo "Covered code changed since sync commit $sync:"
    git -C "$root" diff --stat "$sync" -- $covered
    drift=1
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cp "$here/CoreViewers.tla" "$here"/*.cfg "$work/"

failed=0
for config in CoreViewers; do
    if (cd "$work" && java -XX:+UseParallelGC -cp "$jar" tlc2.TLC -workers auto \
        -metadir "$work/states-$config" -config "$config.cfg" CoreViewers.tla \
        >"$work/$config.out" 2>&1); then
        outcome=holds
    else
        outcome=violated
    fi
    expected=$(sed -n "s/^| $config | \([a-z]*\) |.*/\1/p" "$skill")
    states=$(sed -n 's/^\([0-9]*\) distinct states found.*/\1/p; s/.* \([0-9]*\) distinct states found.*/\1/p' "$work/$config.out" | tail -1)
    if grep -q "^Error: \(TLC threw\|Parsing\|Semantic\)" "$work/$config.out" \
        || ! grep -q "distinct states found" "$work/$config.out"; then
        echo "$config: the model did not run"
        cat "$work/$config.out"
        failed=1
    elif [ "$outcome" = "$expected" ]; then
        echo "$config: $outcome as recorded ($states distinct states)"
    else
        echo "$config: $outcome, but the skill records $expected"
        sed -n '/is violated/,/distinct states found/p' "$work/$config.out"
        failed=1
    fi
done

if [ "$drift" = 1 ]; then
    echo "Review the covered code against the model before advancing the sync commit."
fi
if [ "$failed" = 1 ]; then
    exit 1
fi
if [ "$drift" = 1 ]; then
    exit 2
fi
