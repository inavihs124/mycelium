"""
main.py - Entry point for Mycelium Quantum Puzzle Game.

Runs the local development server and provides CLI tools to verify quantum simulations.
"""
import sys
import os
import argparse
import http.server
import socketserver

if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

def build_shell(fragment_html: str) -> str:
    """Wraps body-only index.html with the full HTML shell for browser preview."""
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🍄 Mycelium — Quantum Puzzle Game</title>
  <meta name="description" content="Mycelium: Design Trotterized spin evolution schedules as an Opus Magnum–style puzzle game. Built for the Qollab Quantum Hackathon.">
  <link rel="stylesheet" href="/main.css">
  <script>
    // Stub out Qollab-specific globals for local preview
    window.backend = null;
    window.callPromising = (fn, arg) => {{
      console.warn('[Preview] callPromising called for:', fn, '— Python backend not available locally.');
      return Promise.reject('No Python backend in local preview. Connect a Qollab backend to use Quantum Check.');
    }};
  </script>
</head>
<body>
{fragment_html}
<script type="module" src="/main.js"></script>
</body>
</html>"""

class MyceliumHTTPHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path in ('/', '/index.html', '/preview.html'):
            try:
                root_dir = os.path.dirname(os.path.abspath(__file__))
                index_path = os.path.join(root_dir, 'index.html')
                with open(index_path, 'r', encoding='utf-8') as f:
                    fragment = f.read()
                html = build_shell(fragment)
                encoded = html.encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Content-Length', str(len(encoded)))
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(encoded)
                return
            except Exception as e:
                self.send_error(500, f"Error rendering page: {e}")
                return
        return super().do_GET()

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

def run_tests():
    print("🔬 Running Mycelium Quantum Self-Test...")
    try:
        from quantum.selftest import run_selftest
        res = run_selftest()
        print("Self-test result:", res)
        return True
    except Exception as e:
        print(f"Error during self-test: {e}")
        return False

def serve(port=3000):
    root_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(root_dir)
    with socketserver.TCPServer(("", port), MyceliumHTTPHandler) as httpd:
        print(f"\n🍄 Mycelium preview server running at http://localhost:{port}")
        print("   Press Ctrl+C to stop.\n")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")

def main():
    parser = argparse.ArgumentParser(description="Mycelium Trotterized Spin Simulation Puzzle Game")
    parser.add_argument("--test", action="store_true", help="Run quantum self-tests and exit")
    parser.add_argument("--port", type=int, default=3000, help="Port to run local server on (default: 3000)")
    parser.add_argument("--no-serve", action="store_true", help="Do not start HTTP server, just verify and exit")
    args = parser.parse_args()

    if args.test:
        success = run_tests()
        sys.exit(0 if success else 1)

    if sys.stdout.encoding and sys.stdout.encoding.lower().startswith('cp'):
        try:
            sys.stdout.reconfigure(encoding='utf-8')
        except Exception:
            pass
    print("[Mycelium] Welcome to Mycelium -- Trotterized Spin Simulation Puzzle Game")
    if args.no_serve:
        sys.exit(0)

    serve(args.port)

if __name__ == "__main__":
    main()
