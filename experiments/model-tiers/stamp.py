import json, sys, time

t0 = float(sys.argv[1])
stream, result = open(sys.argv[2], "w"), sys.argv[3]
final = None
for line in sys.stdin:
    now = time.time()
    stream.write(json.dumps({"t": round(now - t0, 3), "line": line.rstrip("\n")}) + "\n")
    try:
        message = json.loads(line)
    except ValueError:
        continue
    if message.get("type") == "result":
        final = message
stream.close()
if final is not None:
    json.dump(final, open(result, "w"))
