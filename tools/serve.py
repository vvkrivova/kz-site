"""
Tian Way — локальный сервер для проверки сайта на компьютере: python3 tools/serve.py [порт, по умолчанию 8090]
Как обычный python -m http.server, но понимает короткие адреса страниц, как хостинг (.htaccess) и GitHub Pages:
/trips → trips.html, /en/trips → en/trips.html. Старые адреса с .html тоже открываются.
/api/rates — курс Нацбанка для проверки цен в долларах и рублях (на хостинге его отдает api/rates.php; здесь —
упрощенная копия: daily.xml НБКР берется напрямую и держится в памяти час). TW_RATES=off — как будто курса нет.
"""
import http.server
import json
import os
import re
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


_RATES = {'at': 0, 'data': None}


def nbkr_rates():
    if os.environ.get('TW_RATES') == 'off':
        return {'ok': False, 'reason': 'none'}
    if time.time() - _RATES['at'] > 3600:
        try:
            raw = urllib.request.urlopen('https://www.nbkr.kg/XML/daily.xml', timeout=10).read()
            root = ET.fromstring(raw)
            d, m, y = root.get('Date').split('.')
            out = {'ok': True, 'date': f'{y}-{m}-{d}', 'source': 'НБКР'}
            for c in root.findall('Currency'):
                code = c.get('ISOCode')
                if code in ('USD', 'RUB'):
                    out[code] = round(float(c.find('Value').text.replace(',', '.')) / float(c.find('Nominal').text.replace(',', '.')), 6)
            _RATES.update(at=time.time(), data=out)
        except Exception as e:  # noqa: BLE001 — только для проверки на компьютере
            print('курс НБКР не получен:', e)
    return _RATES['data'] or {'ok': False, 'reason': 'none'}


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        if re.match(r'^/api/rates(\?|$)', self.path):
            body = json.dumps(nbkr_rates()).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def translate_path(self, path):
        real = super().translate_path(path)
        if not os.path.exists(real) and os.path.exists(real + '.html'):
            return real + '.html'
        return real


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8090
    http.server.ThreadingHTTPServer(('', port), Handler).serve_forever()
