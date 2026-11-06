"""Start the local/offline game. No camera images leave the browser."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse
import json
import os
import socket
import subprocess
import urllib.request
import webbrowser

ROOT = Path(__file__).resolve().parent
IDENTITY = 'qingming-web-hand-v1'

class GameServer(ThreadingHTTPServer):
    # Windows permits duplicate listeners with SO_REUSEADDR; one game server
    # must own this port so repeated shortcut launches reuse the existing game.
    allow_reuse_address = False
    def server_bind(self):
        if os.name == 'nt':
            self.socket.setsockopt(socket.SOL_SOCKET,socket.SO_EXCLUSIVEADDRUSE,1)
        super().server_bind()

class GameHandler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.mjs':'text/javascript', '.wasm':'application/wasm', '.task':'application/octet-stream'}
    def do_GET(self):
        if self.path.split('?')[0] == '/game-health':
            body = json.dumps({'app':IDENTITY}).encode()
            self.send_response(200)
            self.send_header('Content-Type','application/json')
            self.send_header('Content-Length',str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        return super().do_GET()
    def end_headers(self):
        self.send_header('Cache-Control','no-cache')
        self.send_header('Permissions-Policy','camera=(self), microphone=()')
        super().end_headers()
    def log_message(self, *_):
        pass

def open_game(url):
    # Use Edge/Chrome when installed; otherwise defer to the normal browser.
    for base, suffix in [('PROGRAMFILES(X86)','Microsoft/Edge/Application/msedge.exe'),('PROGRAMFILES','Microsoft/Edge/Application/msedge.exe'),('PROGRAMFILES','Google/Chrome/Application/chrome.exe'),('LOCALAPPDATA','Google/Chrome/Application/chrome.exe')]:
        exe=Path(os.environ.get(base,''))/suffix
        if exe.is_file():
            subprocess.Popen([str(exe),'--new-window','--start-fullscreen',url])
            return
    webbrowser.open(url)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--no-browser',action='store_true')
    parser.add_argument('--port',type=int,default=58377)
    args=parser.parse_args()
    url=f'http://127.0.0.1:{args.port}/'
    try:
        server=GameServer(('127.0.0.1',args.port),partial(GameHandler,directory=str(ROOT)))
    except OSError:
        try:
            with urllib.request.urlopen(url+'game-health',timeout=2) as response:
                if json.load(response).get('app')!=IDENTITY:raise ValueError('Different server')
        except Exception:
            # Never terminate another process that owns the requested port.
            server=GameServer(('127.0.0.1',0),partial(GameHandler,directory=str(ROOT)))
            url=f'http://127.0.0.1:{server.server_port}/'
        else:
            if not args.no_browser:open_game(url)
            return
    url=f'http://127.0.0.1:{server.server_port}/'
    (ROOT/'logs').mkdir(exist_ok=True)
    (ROOT/'logs/preview_server.json').write_text(json.dumps({'url':url,'port':server.server_port,'app':IDENTITY,'pid':os.getpid()}),encoding='utf-8')
    if not args.no_browser:open_game(url)
    print('Game ready: '+url,flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()

if __name__=='__main__':main()
