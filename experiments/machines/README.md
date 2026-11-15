# Machines probe

Throwaway prototype. It asks one question: can VoyagerShell's own Core adapter (`voyager_app::core::Core`) drive a terminal whose program runs on a second Herdr Core, reached through `hc machine add --via`?

It fakes other machines with isolated Cores on one host. `machine.sh <side>` runs a command with a private `HOME`, `XDG_CONFIG_HOME`, `XDG_STATE_HOME` and `XDG_RUNTIME_DIR` under `$MACHINES_EVIDENCE/<side>`, with the caller's Core variables cleared. `delay.py <ms>` holds each chunk for that many milliseconds in each direction, so a line can have a round trip. `drop.sh <side>` ends the `herdr-core connect` process serving that side.

```sh
P=target/release/machines-probe
cargo build --release
./machine.sh a hc server start
./machine.sh b hc server start
./machine.sh c hc server start
./machine.sh a hc machine add --name box --via "$PWD/machine.sh b sh -c"
./machine.sh a hc machine add --name far --via "python3 -I $PWD/delay.py 20 $PWD/machine.sh c sh -c"
./machine.sh a $P local box far
./machine.sh a $P hold far 15
./machine.sh a $P get box/t1
for s in a b c; do ./machine.sh $s hc server stop; done
```

Prefix every command with `env -u HC_SOCKET -u HC_SESSION -u HC_TERMINAL_ID -u HC_SCOPE -u HC_TERMINAL_SOCKET -u WAYLAND_DISPLAY -u DISPLAY` when the shell runs inside Herdr.

Every machine in this probe shares one filesystem, one PATH and one clock, so the probe cannot show path, program or clock differences between machines.
