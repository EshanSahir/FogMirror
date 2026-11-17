"""
FogMirror — Standalone Desktop Fog Screen App with Hand Gesture Control
Packaged via PyInstaller into FogMirror.exe
"""

import sys
import os
import ctypes
import socket
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import webview

# Configure WebView2 for hardware acceleration and auto-granted camera stream
os.environ['WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS'] = (
    '--use-fake-ui-for-media-stream '
    '--enable-gpu-rasterization '
    '--enable-zero-copy'
)

def get_resource_path(relative_path):
    """Get absolute path to resource, works for dev and for PyInstaller bundle."""
    if hasattr(sys, '_MEIPASS'):
        return os.path.join(sys._MEIPASS, relative_path)
    return os.path.join(os.path.abspath(os.path.dirname(__file__)), relative_path)

def find_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]

class StaticServer:
    def __init__(self, root_dir, port):
        self.root_dir = root_dir
        self.port = port
        self.httpd = None

    def start(self):
        root = self.root_dir
        class CustomHandler(SimpleHTTPRequestHandler):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, directory=root, **kwargs)

            def end_headers(self):
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
                super().end_headers()

            def guess_type(self, path):
                if path.endswith('.mjs') or path.endswith('.js'):
                    return 'application/javascript'
                if path.endswith('.wasm'):
                    return 'application/wasm'
                return super().guess_type(path)

            def log_message(self, format, *args):
                pass  # Suppress console logging

        self.httpd = ThreadingHTTPServer(('127.0.0.1', self.port), CustomHandler)
        thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        thread.start()

    def stop(self):
        if self.httpd:
            self.httpd.shutdown()

class WindowApi:
    def __init__(self, window_holder):
        self.window_holder = window_holder

    def get_screen_size(self):
        try:
            user32 = ctypes.windll.user32
            user32.SetProcessDPIAware()
            return {
                'width': user32.GetSystemMetrics(0),
                'height': user32.GetSystemMetrics(1)
            }
        except Exception:
            return {'width': 1920, 'height': 1080}

    def quit(self):
        try:
            win = self.window_holder[0]
            if win:
                win.destroy()
        except Exception:
            pass
        sys.exit(0)

def main():
    # Detect native display resolution
    try:
        user32 = ctypes.windll.user32
        user32.SetProcessDPIAware()
        screen_w = user32.GetSystemMetrics(0)
        screen_h = user32.GetSystemMetrics(1)
    except Exception:
        screen_w, screen_h = 1920, 1080

    # Locate the renderer directory
    renderer_dir = get_resource_path(os.path.join('src', 'renderer'))
    if not os.path.exists(renderer_dir):
        renderer_dir = get_resource_path('renderer')

    # Start local HTTP server
    port = find_free_port()
    server = StaticServer(renderer_dir, port)
    server.start()

    window_holder = [None]
    api = WindowApi(window_holder)

    url = f'http://127.0.0.1:{port}/index.html'

    # Create fullscreen borderless mirror window
    window = webview.create_window(
        'FogMirror',
        url=url,
        js_api=api,
        width=screen_w,
        height=screen_h,
        fullscreen=True,
        frameless=True,
        background_color='#0f172a'
    )
    window_holder[0] = window

    try:
        webview.start(private_mode=False, gui='edgechromium')
    finally:
        server.stop()

if __name__ == '__main__':
    main()
