"""
Tian Way — сборка сайта. Запускать после любых правок:  python3 tools/build.py

1. Страницы программ туров (tour-issyk-ring / -north / -winter): данные — data/tours.json,
   оформление — templates/tour.html (tools/build_tours.py); там же длительность и цена на карточках trips.html.
   Цены и занятые даты аренды (rent.html, rent-extras.html, data/rent-availability.js) — data/rent.json
   (tools/build_rent.py).
2. Шапка и подвал на всех страницах — из templates/header-contacts.html и templates/footer.html,
   контакты и подписи — data/site.json. У страницы остаются свои: логотип в шапке и цвет подвала
   (footer--light / footer--dark).
3. Метки версии ?v=… у файлов стилей и скриптов во всех страницах — по содержимому файла:
   метка меняется только у того файла, который изменился, и браузер заказчика сразу берет
   свежую версию (раньше метки меняли вручную).
4. Английская версия — папка en/ (tools/build_en.py): тексты — data/i18n/en.json,
   надписи скриптов — data/i18n/en-scripts.json.
"""
import hashlib
import html
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def fill(tpl: str, values: dict) -> str:
    def repl(m):
        if m.group(1) not in values:
            sys.exit(f'в шаблоне неизвестное поле {{{{{m.group(1)}}}}}')
        return values[m.group(1)]
    return re.sub(r'\{\{(\w+)\}\}', repl, tpl)


def apply_layout() -> None:
    sys.path.insert(0, str(ROOT / 'tools'))
    site = json.loads((ROOT / 'data' / 'site.json').read_text(encoding='utf-8'))
    values = {k: html.escape(v) for k, v in site.items() if not k.startswith('_')}
    contacts = fill((ROOT / 'templates' / 'header-contacts.html').read_text(encoding='utf-8'), values)
    footer_tpl = (ROOT / 'templates' / 'footer.html').read_text(encoding='utf-8').rstrip('\n')
    # шапка: строка с логотипом остается своя у каждой страницы, телефон и соцсети — из шаблона
    # (только там, где они есть: на trips.html в шапке по макету один логотип)
    header_re = re.compile(r'(<header class="header[^"]*">\n[ ]*<a class="header__logo"[^\n]*\n)([ ]*<a class="header__phone".*?\n)([ ]*</header>)', re.S)
    footer_re = re.compile(r'[ ]*<footer class="footer footer--(light|dark)">.*?</footer>', re.S)
    lang_tpl = (ROOT / 'templates' / 'lang-switch.html').read_text(encoding='utf-8').rstrip('\n')
    # переключатель языка: между пометками <!-- язык [классы] --> … <!-- /язык --> (в шапке и на компьютерной обложке тура)
    lang_re = re.compile(r'([ ]*)<!-- язык( [\w -]+?)? -->.*?<!-- /язык -->', re.S)

    def lang_switch(m, page):
        ind, mod = m.group(1), (m.group(2) or '').strip()
        body = fill(lang_tpl, {'page': page, 'mod': f' {mod}' if mod else ''})
        body = '\n'.join(ind + line for line in body.split('\n'))
        return f'{ind}<!-- язык{" " + mod if mod else ""} -->\n{body}\n{ind}<!-- /язык -->'

    for page in sorted(ROOT.glob('*.html')):
        s = page.read_text(encoding='utf-8')
        new = header_re.sub(lambda m: m.group(1) + contacts + m.group(3), s)
        new = lang_re.sub(lambda m: lang_switch(m, page.name), new)
        new, n = footer_re.subn(lambda m: fill(footer_tpl, {**values, 'theme': m.group(1)}), new)
        if n != 1:
            sys.exit(f'{page.name}: подвал не найден')
        if new != s:
            page.write_text(new, encoding='utf-8')
            print('шапка/подвал обновлены:', page.name)


def file_tag(path: Path) -> str:
    return hashlib.md5(path.read_bytes()).hexdigest()[:8]


def stamp_versions() -> None:
    tags = {}
    ref = re.compile(r'((?:css|js|data)/[\w./-]+\.(?:css|js))\?v=[\w-]+')
    for page in sorted([*ROOT.glob('*.html'), *ROOT.glob('templates/*.html'), *ROOT.glob('en/*.html')]):  # и шаблоны — чтобы туры не перештамповывались каждый раз
        s = page.read_text(encoding='utf-8')

        def repl(m):
            rel = m.group(1)
            if rel not in tags:
                f = ROOT / rel
                if not f.exists():
                    sys.exit(f'нет файла {rel} (ссылка в {page.name})')
                tags[rel] = file_tag(f)
            return f'{rel}?v={tags[rel]}'

        new = ref.sub(repl, s)
        if new != s:
            page.write_text(new, encoding='utf-8')
            print('метки обновлены:', page.relative_to(ROOT))


if __name__ == '__main__':
    subprocess.run([sys.executable, str(ROOT / 'tools' / 'build_tours.py')], check=True)
    subprocess.run([sys.executable, str(ROOT / 'tools' / 'build_rent.py')], check=True)
    apply_layout()
    stamp_versions()
    subprocess.run([sys.executable, str(ROOT / 'tools' / 'build_en.py')], check=True)
    stamp_versions()
    print('готово')
