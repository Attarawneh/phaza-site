#!/usr/bin/env python3
"""Threaded static server for local preview.

php -S and the stock http.server are single-threaded, so concurrent ES-module
fetches can 404 mid-load. This also serves index.html for unknown paths so
client-side routes work.
"""
import os, sys
from http.server import SimpleHTTPRequestHandler
from socketserver import ThreadingTCPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8791

class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def do_POST(self):
        if self.path.startswith('/__mock-contact'):
            n = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(n)
            print('MOCK CONTACT RECEIVED:', body.decode()[:400], flush=True)
            self.send_response(200); self.send_header('Content-Type', 'application/json')
            self.end_headers(); self.wfile.write(b'{"ok":true}')
            return
        self.send_response(404); self.end_headers()

    def send_head(self):
        path = self.translate_path(self.path)
        if not os.path.exists(path) and '.' not in os.path.basename(path):
            self.path = '/index.html'          # SPA fallback
        return super().send_head()
    def log_message(self, *a):
        pass

ThreadingTCPServer.allow_reuse_address = True
with ThreadingTCPServer(('127.0.0.1', PORT), H) as s:
    print(f'serving {ROOT} on http://127.0.0.1:{PORT}')
    s.serve_forever()
