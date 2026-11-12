#!/bin/bash
# One traced session through the most-used pathways. Coordinates assume the default Xvfb screen
# (1920x1200) where voyager-shell opens its 1450x940 window at (182,130) with a new profile.
# Usage: drive-main.sh NAME BINARY SYMBOLS   (ATLAS_RUN_DIR chooses where the run is recorded)
set -euo pipefail
cd "$(dirname "$0")"
NAME=$1; BIN=$2; SYMS=$3
r() { python3 run.py "$@"; }
r start "$NAME" --binary "$BIN" --symbols "$SYMS"
sleep 30; r shot "$NAME" start
r act "$NAME" mark:typing click:1000,600 type:'echo hello' key:Return wait:2
r act "$NAME" mark:split-vessel key:ctrl+shift+o wait:1.5 click:1482,222 wait:3
r act "$NAME" mark:resize-split drag:1019,605:819,605 wait:2
r act "$NAME" mark:move-vessel drag:510,194:1240,1000 wait:2
r act "$NAME" mark:portal-setup click:1000,400 key:ctrl+shift+t wait:1.5 click:555,180 wait:3
r act "$NAME" mark:portal click:1607,149 wait:1 move:1480,290 wait:0.5 move:1480,182 wait:0.4 click:1480,180 wait:3 click:1500,500 type:'echo portal-marker' key:Return wait:1
r act "$NAME" mark:switch-fleet click:452,149 wait:2
r shot "$NAME" canvas
r act "$NAME" mark:dock-avatar drag:292,275:453,149 wait:3
r act "$NAME" mark:avatar-open-chat click:311,406 wait:2
r act "$NAME" mark:ask-by-text click:270,453 type:'open a terminal here' key:Return wait:45
r shot "$NAME" asked
r act "$NAME" mark:launch-setup click:680,300 key:ctrl+shift+o wait:1.5
r act "$NAME" mark:launch-agent click:1476,249 wait:10
r act "$NAME" mark:notes-setup click:600,850 key:ctrl+shift+o wait:1.5 click:951,734 wait:3
r act "$NAME" mark:notes-save click:860,830 type:'Atlas trace note' wait:1 click:600,300 wait:4
r shot "$NAME" notes
r act "$NAME" mark:avatar-float click:445,149 wait:3
r shot "$NAME" floated
r stop "$NAME"
