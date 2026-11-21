"""Pembantu pengujian (hanya untuk tes, tidak dipakai aplikasi): enkode & dekode QR memakai OpenCV."""
import json, sys, cv2, numpy as np
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

ENC = cv2.QRCodeEncoder.create()
DET = cv2.QRCodeDetector()

def matrix(text):
    img = ENC.encode(text)
    return (img < 128).astype(int).tolist()

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _send(self, body, ctype='application/json'):
        b = body if isinstance(body, bytes) else body.encode()
        self.send_response(200); self.send_header('content-type', ctype); self.send_header('content-length', str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        u = urlparse(self.path); q = parse_qs(u.query)
        if u.path == '/qr': return self._send(json.dumps(matrix(q['text'][0])))
        self._send('{}')
    def do_POST(self):
        u = urlparse(self.path); q = parse_qs(u.query)
        n = int(self.headers.get('content-length', 0)); raw = self.rfile.read(n)
        if u.path == '/decode':
            w, h = int(q['w'][0]), int(q['h'][0])
            rgba = np.frombuffer(raw, dtype=np.uint8).reshape(h, w, 4)
            gray = cv2.cvtColor(rgba, cv2.COLOR_RGBA2GRAY)
            txt, _, _ = DET.detectAndDecode(gray)
            return self._send(json.dumps({'data': txt or None}))
        self._send('{}')

if __name__ == '__main__':
    if sys.argv[1] == 'serve':
        HTTPServer(('127.0.0.1', int(sys.argv[2])), H).serve_forever()
    elif sys.argv[1] == 'video':
        # video <teks> <keluaran.mjpeg>: bingkai 640x480 berisi QR, dikonkatenasi sebagai MJPEG (dibaca kamera palsu Chromium)
        text, out = sys.argv[2], sys.argv[3]
        img = ENC.encode(text)
        big = cv2.resize(img, None, fx=9, fy=9, interpolation=cv2.INTER_NEAREST)
        canvas = np.full((480, 640), 235, dtype=np.uint8)
        h, w = big.shape
        y, x = (480 - h) // 2, (640 - w) // 2
        canvas[max(y,0):max(y,0)+h, max(x,0):max(x,0)+w] = big[:480, :640]
        frame = cv2.cvtColor(canvas, cv2.COLOR_GRAY2BGR)
        ok, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 92])
        open(out, 'wb').write(buf.tobytes() * 60)
