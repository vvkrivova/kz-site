"""
Tian Way — сборка страниц программ туров (tour-issyk-ring / -north / -winter).

Данные (название, описание, дни, фото) — data/tours.json: правьте их там.
Оформление общее для всех программ — templates/tour.html (лента дней, «Что входит в стоимость»,
рисующиеся линии). Страницы tour-*.html перезаписываются целиком: в них руками не правят.

Запуск из папки проекта:  python3 tools/build.py  (он запускает и этот скрипт)
"""
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE = ROOT / 'templates' / 'tour.html'
DATA = ROOT / 'data' / 'tours.json'

ARROW = ('<svg class="tday__arrow" width="34" height="10" viewBox="0 0 34 10" fill="none" aria-hidden="true">'
         '<path d="M0 5h33M28.5 1 33 5l-4.5 4" stroke="currentColor" stroke-linejoin="round"/></svg>')


def nb(t):
    """Неразрывный пробел после коротких предлогов и союзов (чтобы «в», «с», «и» не висели в конце строки)."""
    return re.sub(r'(?<![\w-])(в|с|и|к|у|о|на|по|за|из|от|до|для|при)\s', r'\1&nbsp;', t)


def title_html(t):
    """Название дня: «→» рисуется тонкой стрелкой, как в макете."""
    return html.escape(t, quote=False).replace(' → ', f' {ARROW} ')


def day_card(n, d):
    title = title_html(d['title'])
    if d.get('photo'):
        pos = f" tday__photo--{d['photo_pos']}" if d.get('photo_pos') else ''
        text = f"\n            <p class=\"tday__text\">{nb(html.escape(d['text'], quote=False))}</p>" if d.get('text') else ''
        return (f'          <article class="tday">\n'
                f'            <img class="tday__photo{pos}" src="{d["photo"]}" alt="{html.escape(d.get("alt", ""))}">\n'
                f'            <span class="tday__num">День {n}</span>\n'
                f'            <h3 class="tday__title">{title}</h3>{text}\n'
                f'          </article>')
    return (f'          <article class="tday tday--short" data-day="{n:02d}">\n'
            f'            <span class="tday__num">День {n}</span>\n'
            f'            <h3 class="tday__title">{title}</h3>\n'
            f'          </article>')


def sub(pattern, repl, s):
    new, count = re.subn(pattern, lambda m: repl(m) if callable(repl) else repl, s, count=1, flags=re.S)
    assert count == 1, f'не найдено в шаблоне: {pattern}'
    return new


def build(p, tpl):
    esc = lambda t: html.escape(t, quote=False)
    s = tpl
    s = sub(r'<title>.*?</title>', f"<title>{esc(p['name'])} — Tian Way</title>", s)
    s = sub(r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{html.escape(p["description"])}">', s)
    s = sub(r'<h1 class="tour__title" data-reveal>.*?</h1>',
            f'<h1 class="tour__title" data-reveal>{esc(p["title"]).replace(chr(10), "<br>")}</h1>', s)
    s = sub(r'(<p class="tour__lead"[^>]*>).*?(</p>)', lambda m: m.group(1) + esc(p['lead']) + m.group(2), s)
    s = sub(r'(<span class="tour-chip__ico tour-chip__ico--days">.*?</span>\s*)8 дней',
            lambda m: m.group(1) + esc(p['days_label']), s)
    s = s.replace('trips.html?trip=ring#custom', f"trips.html?trip={p['trip']}#custom")
    days = '\n'.join(day_card(i + 1, d) for i, d in enumerate(p['days']))
    s = sub(r'(<div class="tour-days__track" data-days-track>\n).*?(\n        </div>\n      </div>)',
            lambda m: m.group(1) + days + m.group(2), s)
    s = s.replace('<!-- вся страница — один «холст»',
                  '<!-- страница собрана скриптом tools/build_tours.py: данные — data/tours.json, оформление — templates/tour.html -->\n'
                  '  <!-- вся страница — один «холст»', 1)
    return s


if __name__ == '__main__':
    tpl = TEMPLATE.read_text(encoding='utf-8')
    for p in json.loads(DATA.read_text(encoding='utf-8'))['tours']:
        out = ROOT / p['page']
        out.write_text(build(p, tpl), encoding='utf-8')
        print('готово:', out.name, f"({len(p['days'])} дн.)")
