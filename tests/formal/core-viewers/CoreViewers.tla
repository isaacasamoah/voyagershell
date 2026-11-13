---------------------------- MODULE CoreViewers ----------------------------
EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS Channels, ViewerLimit, Credit, ViewLimit, ControlCapacity, Requests, AttachTimeouts

TotalLimit == ViewerLimit * Credit

VARIABLES
    link,
    core,
    window,
    pipe,
    control,
    present,
    bytes,
    closed,
    total,
    held,
    pending,
    waiting,
    attached,
    issued,
    used

vars == <<link, core, window, pipe, control, present, bytes, closed, total,
          held, pending, waiting, attached, issued, used>>

Up == "up"
None == 0

Occupied(c) == c \in present /\ (~closed[c] \/ bytes[c] > 0)
OccupiedCount == Cardinality({c \in present : Occupied(c)})

RECURSIVE SumBytes(_)
SumBytes(S) == IF S = {} THEN 0
               ELSE LET c == CHOOSE x \in S : TRUE IN bytes[c] + SumBytes(S \ {c})

Enqueue(frame) ==
    /\ link = Up
    /\ Len(control) < ControlCapacity
    /\ control' = Append(control, frame)

Init ==
    /\ link = Up
    /\ core = [c \in Channels |-> "none"]
    /\ window = [c \in Channels |-> 0]
    /\ pipe = <<>>
    /\ control = <<>>
    /\ present = {}
    /\ bytes = [c \in Channels |-> 0]
    /\ closed = [c \in Channels |-> FALSE]
    /\ total = 0
    /\ held = {}
    /\ pending = [c \in Channels |-> 0]
    /\ waiting = None
    /\ attached = None
    /\ issued = 0
    /\ used = {}

Attach ==
    /\ waiting = None
    /\ attached = None
    /\ issued < Requests
    /\ OccupiedCount < ViewerLimit
    /\ Enqueue([kind |-> "attach", ch |-> issued + 1, n |-> 0])
    /\ issued' = issued + 1
    /\ waiting' = issued + 1
    /\ UNCHANGED <<link, core, window, pipe, present, bytes, closed, total,
                   held, pending, attached, used>>

TimeOut ==
    /\ AttachTimeouts
    /\ waiting # None
    /\ waiting' = None
    /\ UNCHANGED <<link, core, window, pipe, control, present, bytes, closed,
                   total, held, pending, attached, issued, used>>

Install ==
    /\ attached # None
    /\ attached \in present
    /\ link = Up
    /\ ~closed[attached]
    /\ held' = held \cup {attached}
    /\ attached' = None
    /\ UNCHANGED <<link, core, window, pipe, control, present, bytes, closed,
                   total, pending, waiting, issued, used>>

Replace(old) ==
    /\ attached # None
    /\ attached \in present
    /\ link = Up
    /\ ~closed[attached]
    /\ old \in held
    /\ old # attached
    /\ Enqueue([kind |-> "close", ch |-> old, n |-> 0])
    /\ present' = present \ {old}
    /\ total' = total - bytes[old]
    /\ bytes' = [bytes EXCEPT ![old] = 0]
    /\ held' = (held \ {old}) \cup {attached}
    /\ attached' = None
    /\ UNCHANGED <<link, core, window, pipe, closed, pending, waiting, issued, used>>

InstallFails ==
    /\ attached # None
    /\ \/ attached \notin present
       \/ link # Up
       \/ closed[attached]
       \/ \E old \in held : old # attached /\ Len(control) >= ControlCapacity
    /\ attached' = None
    /\ UNCHANGED <<link, core, window, pipe, control, present, bytes, closed,
                   total, held, pending, waiting, issued, used>>

Take(c) ==
    /\ c \in held
    /\ c \in present
    /\ \E n \in 1..bytes[c] :
        /\ bytes' = [bytes EXCEPT ![c] = @ - n]
        /\ total' = total - n
        /\ pending' = [pending EXCEPT ![c] = @ + n]
    /\ UNCHANGED <<link, core, window, pipe, control, present, closed, held,
                   waiting, attached, issued, used>>

GiveCredit(c) ==
    /\ c \in held
    /\ pending[c] > 0
    /\ Enqueue([kind |-> "credit", ch |-> c, n |-> pending[c]])
    /\ pending' = [pending EXCEPT ![c] = 0]
    /\ UNCHANGED <<link, core, window, pipe, present, bytes, closed, total,
                   held, waiting, attached, issued, used>>

CoreReceive ==
    /\ Len(control) > 0
    /\ LET frame == Head(control) IN
       /\ control' = Tail(control)
       /\ CASE frame.kind = "attach" ->
                 \E c \in Channels \ used :
                   /\ used' = used \cup {c}
                   /\ core' = [core EXCEPT ![c] = "open"]
                   /\ window' = [window EXCEPT ![c] = Credit]
                   /\ pipe' = Append(pipe, [kind |-> "reply", ch |-> c, n |-> frame.ch])
            [] frame.kind = "credit" ->
                 /\ window' = IF core[frame.ch] = "open"
                              THEN [window EXCEPT ![frame.ch] = @ + frame.n]
                              ELSE window
                 /\ UNCHANGED <<core, pipe, used>>
            [] frame.kind = "close" ->
                 /\ core' = IF core[frame.ch] = "open"
                            THEN [core EXCEPT ![frame.ch] = "closed"]
                            ELSE core
                 /\ UNCHANGED <<window, pipe, used>>
    /\ UNCHANGED <<link, present, bytes, closed, total, held, pending, waiting,
                   attached, issued>>

CoreOutput(c) ==
    /\ core[c] = "open"
    /\ \E n \in 1..window[c] :
        /\ window' = [window EXCEPT ![c] = @ - n]
        /\ pipe' = Append(pipe, [kind |-> "data", ch |-> c, n |-> n])
    /\ UNCHANGED <<link, core, control, present, bytes, closed, total, held,
                   pending, waiting, attached, issued, used>>

TerminalEnds(c) ==
    /\ core[c] = "open"
    /\ core' = [core EXCEPT ![c] = "ended"]
    /\ pipe' = Append(pipe, [kind |-> "end", ch |-> c, n |-> 0])
    /\ UNCHANGED <<link, window, control, present, bytes, closed, total, held,
                   pending, waiting, attached, issued, used>>

ReadReply(frame) ==
    IF frame.n # waiting
    THEN UNCHANGED <<link, present, bytes, closed, total, waiting, attached>>
    ELSE IF frame.ch \in present
    THEN /\ link' = "Core attached an invalid channel"
         /\ UNCHANGED <<present, bytes, closed, total, waiting, attached>>
    ELSE /\ present' = present \cup {frame.ch}
         /\ bytes' = [bytes EXCEPT ![frame.ch] = 0]
         /\ closed' = [closed EXCEPT ![frame.ch] = FALSE]
         /\ waiting' = None
         /\ attached' = frame.ch
         /\ UNCHANGED <<link, total>>

ReadData(frame) ==
    /\ UNCHANGED <<present, closed, waiting, attached>>
    /\ IF total + frame.n > TotalLimit
       THEN /\ link' = "buffered output exceeded 16 MiB"
            /\ UNCHANGED <<bytes, total>>
       ELSE IF frame.ch \notin present
       THEN UNCHANGED <<link, bytes, total>>
       ELSE IF closed[frame.ch]
       THEN /\ link' = "Core sent output after close"
            /\ UNCHANGED <<bytes, total>>
       ELSE IF bytes[frame.ch] + frame.n > ViewLimit
       THEN /\ link' = "viewer output exceeded 1 MiB"
            /\ UNCHANGED <<bytes, total>>
       ELSE /\ bytes' = [bytes EXCEPT ![frame.ch] = @ + frame.n]
            /\ total' = total + frame.n
            /\ UNCHANGED link

ReadEnd(frame) ==
    /\ closed' = IF frame.ch \in present
                 THEN [closed EXCEPT ![frame.ch] = TRUE]
                 ELSE closed
    /\ UNCHANGED <<link, present, bytes, total, waiting, attached>>

Read ==
    /\ link = Up
    /\ Len(pipe) > 0
    /\ LET frame == Head(pipe) IN
       /\ pipe' = Tail(pipe)
       /\ CASE frame.kind = "reply" -> ReadReply(frame)
            [] frame.kind = "data" -> ReadData(frame)
            [] frame.kind = "end" -> ReadEnd(frame)
    /\ UNCHANGED <<core, window, control, held, pending, issued, used>>

Next ==
    \/ Attach
    \/ TimeOut
    \/ Install
    \/ \E old \in held : Replace(old)
    \/ InstallFails
    \/ \E c \in Channels : Take(c) \/ GiveCredit(c) \/ CoreOutput(c) \/ TerminalEnds(c)
    \/ CoreReceive
    \/ Read

Spec == Init /\ [][Next]_vars

TypeOK ==
    /\ present \subseteq Channels
    /\ held \subseteq Channels
    /\ total \in 0..TotalLimit
    /\ \A c \in Channels : bytes[c] \in 0..ViewLimit

BridgeStaysUp == link = Up

BufferAccounting == total = SumBytes(present)

SlotsWithinLimit == OccupiedCount <= ViewerLimit

EveryOccupiedSlotHasAViewer ==
    \A c \in present : Occupied(c) => c \in held \/ c = attached
=============================================================================
