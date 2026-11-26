#!/bin/sh
set -eu

releases=${VOYAGER_RELEASES_URL:-https://github.com/isaacasamoah/voyagershell/releases/latest/download}
herdr=${HERDR_RELEASES_URL:-https://releases.herdr.dev}
data=${XDG_DATA_HOME:-$HOME/.local/share}
bin=$HOME/.local/bin
root=$data/voyagershell
target=linux-x86_64

say() { printf '%s\n' "$*"; }
fail() { say "voyagershell: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || fail "needs $1"; }
need curl
need tar

[ "$(uname -s)" = Linux ] || fail "no build for $(uname -s)"
case "$(uname -m)" in
  x86_64 | amd64) ;;
  *) fail "no build for $(uname -m)" ;;
esac

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

point() {
  ln -s "$2" "$root/.$1.new"
  mv -T "$root/.$1.new" "$root/$1"
}

older() {
  awk -v a="$1" -v b="$2" 'BEGIN {
    split(a, x, "."); split(b, y, ".")
    for (i = 1; i <= 3; i++) {
      if (x[i] + 0 < y[i] + 0) exit 0
      if (x[i] + 0 > y[i] + 0) exit 1
    }
    exit 1
  }'
}

tmp=$(mktemp -d)
part=
trap 'rm -rf "$tmp"; [ -z "$part" ] || rm -rf "$part"' EXIT

curl -fsSL "$releases/latest.json" -o "$tmp/latest.json" || fail "cannot reach $releases/latest.json"
flat=$(tr -d '\n ' < "$tmp/latest.json")
entry=$(printf '%s' "$flat" | sed -n "s/.*\"$target\":{\([^}]*\)}.*/\1/p")
url=$(printf '%s' "$entry" | sed -n 's/.*"url":"\([^"]*\)".*/\1/p')
want=$(printf '%s' "$entry" | sed -n 's/.*"sha256":"\([^"]*\)".*/\1/p')
version=$(printf '%s' "$flat" | sed -n 's/^{"version":"\([^"]*\)".*/\1/p')
core_min=$(printf '%s' "$flat" | sed -n 's/.*"core_min":"\([^"]*\)".*/\1/p')
[ -n "$url" ] && [ -n "$want" ] && [ -n "$version" ] || fail "no build for $target in $releases/latest.json"
case "$version" in
  *[!0-9.]* | .* | *. | *..*) fail "the manifest names an odd version: $version" ;;
esac

say "Installing VoyagerShell $version..."
curl -fsSL "$url" -o "$tmp/archive.tar.gz" || fail "download failed: $url"
[ "$(sha256 "$tmp/archive.tar.gz")" = "$want" ] || fail "the download is damaged (checksum mismatch); try again"

mkdir -p "$root/builds"
build=$root/builds/$version
if [ -d "$build" ]; then
  say "Build $version is already in $root/builds."
else
  part=$build.part
  rm -rf "$part"
  mkdir "$part"
  tar -xzf "$tmp/archive.tar.gz" -C "$part" --strip-components=1
  [ -x "$part/voyager-shell" ] && [ -x "$part/voyager" ] || fail "the archive lacks voyager-shell or voyager"
  found=$("$part/voyager-shell" --version | sed -n '1s/^voyager-shell //p') || fail "the downloaded build does not run on this machine"
  [ "$found" = "$version" ] || fail "the build says $found, the manifest says $version"
  mv -T "$part" "$build"
  part=
fi

current=
if [ -L "$root/current" ]; then current=$(readlink "$root/current"); fi
if [ -z "$current" ]; then
  point current "builds/$version"
  say "Build $version is current."
elif [ "$current" = "builds/$version" ]; then
  say "Build $version is already current."
else
  point next "builds/$version"
  say "Build $version is staged. Restart VoyagerShell, or run: voyager start"
fi

mkdir -p "$bin" "$data/applications"
ln -sfn "$root/current/voyager" "$bin/voyager"

if [ ! -e "$root/start.json" ]; then
  case "$data" in
    *[\"\\]*) fail "$data holds a quote or backslash; write $root/start.json by hand" ;;
  esac
  printf '{"profile": "%s/voyagershell-profile", "session": "voyager-daily"}\n' "$data" > "$root/start.json"
fi

cat > "$data/applications/voyagershell.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=VoyagerShell
Comment=Terminals and coding agents that keep running
Exec=$bin/voyager start
Terminal=false
Categories=Development;
EOF
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$data/applications" 2>/dev/null || true

have=
if command -v hc >/dev/null 2>&1; then have=$(command -v hc)
elif command -v herdr-core >/dev/null 2>&1; then have=$(command -v herdr-core)
elif [ -x "$bin/herdr-core" ]; then have=$bin/herdr-core
fi
if [ -z "$have" ]; then
  say "Installing Herdr Core with its own installer..."
  curl -fsSL "$herdr/core/install.sh" | HC_INSTALL_DIR="$bin" HERDR_RELEASES_URL="$herdr" sh ||
    say "Herdr Core did not install. Run: curl -fsSL $herdr/core/install.sh | sh"
else
  core=$("$have" --version 2>/dev/null | sed -n '1s/^[^ ]* \([0-9][0-9.]*\).*/\1/p' || true)
  if [ -n "$core" ] && [ -n "$core_min" ] && older "$core" "$core_min"; then
    say "Herdr Core $core is older than the $core_min this build needs. It was left alone. To update it: curl -fsSL $herdr/core/install.sh | sh"
  fi
fi

say "VoyagerShell $version is installed. Open it from your apps, or run: voyager start"
case ":$PATH:" in
  *":$bin:"*) ;;
  *) say "Add $bin to your PATH to use voyager from a terminal." ;;
esac
