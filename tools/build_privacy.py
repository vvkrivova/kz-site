"""
Tian Way — страница «Политика конфиденциальности» (privacy.html и en/privacy.html). Запускается из tools/build.py.

Текст — data/privacy.json (правится в панели Pages CMS): заголовок, редакция, дата вступления в силу, вступление
и 12 разделов с абзацами, у каждого текста рядом английский (*_en). Сборка ставит русский текст в privacy.html
между пометками <!-- политика --> … <!-- /политика -->, а пары «русский → английский» пишет
в data/i18n/privacy-en.json — по ним build_en.py собирает en/privacy.html.

Оформление текста: «Подпись: текст» — подпись жирным; 【…】 — место, которое нужно заполнить (подсвечено на сайте).
Абзацы — без ссылок: английская сборка переводит абзац целиком, а ссылка разбила бы его на куски.
"""
import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGE = ROOT / 'privacy.html'
BLOCK = re.compile(r'([ ]*)<!-- политика -->.*?<!-- /политика -->', re.S)


def text_html(t: str) -> str:
    """абзац: экранирование, «Подпись:» жирным, 【…】 — подсвеченное место для заполнения"""
    t = (t or '').strip()
    label = ''
    m = re.match(r'^([A-ZА-ЯЁ][^:.【]{2,60}):\s+', t)
    if m:
        label, t = m.group(1), t[m.end():]
    s = html.escape(t, quote=False)
    s = re.sub(r'【([^】]*)】', lambda x: f'<i class="pp__fill">{x.group(1)}</i>', s)
    if label:
        s = f'<b>{html.escape(label, quote=False)}:</b> {s}'
    return s


def render(d: dict, en: bool, ind: str) -> str:
    g = lambda obj, k: ((obj.get(k + '_en') or obj.get(k)) if en else obj.get(k)) or ''
    out = [f'<h1 class="pp__title">{html.escape(g(d, "title"), quote=False)}</h1>',
           f'<p class="pp__edition">{text_html(g(d, "edition"))}</p>',
           f'<p class="pp__effective">{text_html(g(d, "effective"))}</p>',
           f'<p class="pp__lead">{text_html(g(d, "intro"))}</p>',
           '<div class="pp__list">']
    for n, s in enumerate(d.get('sections') or [], 1):
        paras = ''.join(f'\n{ind}      <p>{text_html(g(p, "text"))}</p>' for p in s.get('paragraphs') or [] if g(p, 'text').strip())
        out.append(f'  <section class="pp__item" id="p{n}">\n{ind}    <div class="pp__num">{n:02d}</div>\n'
                   f'{ind}    <div class="pp__body">\n{ind}      <h2 class="pp__h">{html.escape(g(s, "title"), quote=False)}</h2>{paras}\n'
                   f'{ind}    </div>\n{ind}  </section>')
    out.append('</div>')
    return '\n'.join(ind + line for line in out)


def units(fragment: str) -> list:
    """куски текста так, как их переводит build_en.py: блочные теги разделяют, строчные (<b>, <i>, <br>) — нет"""
    out, buf = [], []
    for tok in re.findall(r'<[^>]+>|[^<]+', fragment):
        m = re.match(r'^</?([a-zA-Z][\w-]*)', tok)
        if m and m.group(1).lower() not in ('b', 'i', 'br', 'small', 'em', 'strong'):
            if ''.join(buf).strip():
                out.append(''.join(buf).strip())
            buf = []
        else:
            buf.append(tok)
    if ''.join(buf).strip():
        out.append(''.join(buf).strip())
    return out


def main() -> None:
    if not PAGE.exists():
        return
    d = json.loads((ROOT / 'data' / 'privacy.json').read_text(encoding='utf-8'))
    s = PAGE.read_text(encoding='utf-8')
    m = BLOCK.search(s)
    if not m:
        sys.exit('privacy.html: нет пометок <!-- политика --> … <!-- /политика -->')
    ind = m.group(1)
    ru = render(d, False, ind)
    new = s[:m.start()] + f'{ind}<!-- политика -->\n{ru}\n{ind}<!-- /политика -->' + s[m.end():]
    if new != s:
        PAGE.write_text(new, encoding='utf-8')
        print('политика обновлена: privacy.html')
    # пары для английской страницы: те же куски по порядку
    ru_u, en_u = units(ru), units(render(d, True, ind))
    norm = lambda x: re.sub(r'\s+', ' ', x).strip()
    pairs = {}
    if len(ru_u) == len(en_u):
        for a, b in zip(ru_u, en_u):
            if re.search('[А-Яа-яЁё]', a) and norm(a) != norm(b):
                pairs.setdefault(norm(a), b)
    else:
        print('build_privacy: русский и английский тексты устроены по-разному — английская страница возьмет перевод из словаря')
    out = ROOT / 'data' / 'i18n' / 'privacy-en.json'
    text = json.dumps({'_readme': 'Собирается сам (tools/build_privacy.py) из data/privacy.json. Руками не править.', **pairs},
                      ensure_ascii=False, indent=2) + '\n'
    if not out.exists() or out.read_text(encoding='utf-8') != text:
        out.write_text(text, encoding='utf-8')


if __name__ == '__main__':
    main()
