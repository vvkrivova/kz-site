"""
Tian Way — курс Нацбанка КР для копии сайта на GitHub Pages (vvkrivova.github.io/kz-site). Запускает автосборка
(.github/workflows/build.yml) перед tools/build.py; руками не нужно.

На хостинге tianway.kg курс отдает сервер (api/rates.php, обновляется сам). На GitHub Pages сервера нет, поэтому при
каждой сборке курс USD и RUB берется из https://www.nbkr.kg/XML/daily.xml и кладется в data/rates.json — его читает
js/main.js (Money) только на github.io. Курс старше 72 часов сайт не показывает (тогда только сомы), так что копия на
GitHub показывает доллары и рубли около трех суток после последней сборки.
Не получилось (НБКР не ответил, ответ странный) — файл не меняется, сборка не падает.
"""
import json
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'rates.json'
LIMITS = {'USD': (30, 300), 'RUB': (0.2, 5)}   # как в api/rates-lib.php


def main() -> None:
    try:
        raw = urllib.request.urlopen('https://www.nbkr.kg/XML/daily.xml', timeout=20).read()
        root = ET.fromstring(raw)
        day = datetime.strptime(root.get('Date', ''), '%d.%m.%Y').date()
        if abs((day - date.today()).days) > 7:
            raise ValueError(f'дата курса {day} не подходит')
        out = {'ok': True, 'date': day.isoformat(), 'source': 'НБКР'}
        for c in root.findall('Currency'):
            code = c.get('ISOCode')
            if code in LIMITS:
                rate = round(float(c.find('Value').text.replace(',', '.')) / float(c.find('Nominal').text.replace(',', '.')), 6)
                lo, hi = LIMITS[code]
                if not lo <= rate <= hi:
                    raise ValueError(f'курс {code} {rate} вне пределов')
                out[code] = rate
        if set(LIMITS) - set(out):
            raise ValueError('нет курса USD или RUB')
    except Exception as e:  # noqa: BLE001 — сборка не должна падать из-за курса
        print('fetch_rates: курс НБКР не получен —', e, file=sys.stderr)
        return
    text = json.dumps(out, ensure_ascii=False) + '\n'
    if not OUT.exists() or OUT.read_text(encoding='utf-8') != text:
        OUT.write_text(text, encoding='utf-8')
        print('курс НБКР для GitHub Pages:', out)


if __name__ == '__main__':
    main()
