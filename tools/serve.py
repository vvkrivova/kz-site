"""
Tian Way — локальный сервер для проверки сайта на компьютере: python3 tools/serve.py [порт, по умолчанию 8090]
Как обычный python -m http.server, но понимает короткие адреса страниц, как хостинг (.htaccess) и GitHub Pages:
/trips → trips.html, /en/trips → en/trips.html. Старые адреса с .html тоже открываются.
"""
import http.server
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def translate_path(self, path):
        real = super().translate_path(path)
        if not os.path.exists(real) and os.path.exists(real + '.html'):
            return real + '.html'
        return real


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8090
    http.server.ThreadingHTTPServer(('', port), Handler).serve_forever()
