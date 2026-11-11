"""Tiny standard-library WebSocket client (text frames only), enough to talk to the local /v1/realtime endpoint."""
import base64, json, os, socket, struct


class WS:
    def __init__(self, host, port, path, timeout=30):
        self.s = socket.create_connection((host, port), timeout=timeout)
        key = base64.b64encode(os.urandom(16)).decode()
        self.s.sendall((f"GET {path} HTTP/1.1\r\nHost: {host}:{port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                        f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            chunk = self.s.recv(4096)
            if not chunk:
                break
            buf += chunk
        head, _, self.buf = buf.partition(b"\r\n\r\n")
        self.handshake = head.decode(errors="replace")
        self.ok = " 101 " in self.handshake.split("\r\n")[0]

    def _frame(self, opcode, data):
        mask = os.urandom(4)
        n = len(data)
        hdr = bytes([0x80 | opcode])
        if n < 126: hdr += bytes([0x80 | n])
        elif n < 65536: hdr += bytes([0x80 | 126]) + struct.pack(">H", n)
        else: hdr += bytes([0x80 | 127]) + struct.pack(">Q", n)
        key = (mask * (n // 4 + 1))[:n]
        masked = (int.from_bytes(data, "big") ^ int.from_bytes(key, "big")).to_bytes(n, "big") if n else b""
        self.s.sendall(hdr + mask + masked)

    def send(self, obj):
        self._frame(1, json.dumps(obj).encode())

    def _read(self, n):
        while len(self.buf) < n:
            chunk = self.s.recv(65536)
            if not chunk:
                raise ConnectionError("closed")
            self.buf += chunk
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def recv(self):
        """-> parsed JSON event, or None when the server closes."""
        message = b""
        while True:
            b0, b1 = self._read(2)
            opcode, fin, n = b0 & 0x0F, b0 & 0x80, b1 & 0x7F
            if n == 126: n = struct.unpack(">H", self._read(2))[0]
            elif n == 127: n = struct.unpack(">Q", self._read(8))[0]
            mask = self._read(4) if b1 & 0x80 else None
            data = self._read(n)
            if mask:
                data = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
            if opcode == 8:
                return None
            if opcode == 9:
                self._frame(10, data); continue
            if opcode == 10:
                continue
            message += data
            if fin:
                try:
                    return json.loads(message)
                except Exception:
                    return {"type": "<non-json>", "raw": message[:200].decode(errors="replace")}

    def close(self):
        try:
            self._frame(8, b"")
            self.s.close()
        except Exception:
            pass
