#!/bin/sh
set -eu
root=${1:?usage: flip-probe.sh <empty folder>}
mkdir -p "$root/builds/a" "$root/builds/b"
cp "$(command -v sleep)" "$root/builds/a/voyager-shell"
cp "$(command -v sleep)" "$root/builds/b/voyager-shell"
ln -sfn builds/a "$root/current"
"$root/current/voyager-shell" 30 &
pid=$!
sleep 0.2
echo "running exe resolves to: $(readlink /proc/$pid/exe | sed "s|$root|<root>|")"
ln -sfn builds/b "$root/current.next"
mv -T "$root/current.next" "$root/current"
echo "current now: $(readlink "$root/current")"
kill -0 "$pid" && echo "old process still running after flip"
echo "running exe still: $(readlink /proc/$pid/exe | sed "s|$root|<root>|")"
mv "$root/builds/a" "$root/builds/a.pruned"
kill -0 "$pid" && echo "old process still running after its folder moved"
echo "running exe after move: $(readlink /proc/$pid/exe | sed "s|$root|<root>|")"
kill "$pid"
wait "$pid" 2>/dev/null || true
