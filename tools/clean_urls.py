"""
Tian Way — короткие адреса страниц: tianway.kg/trips вместо tianway.kg/trips.html. Запускается из tools/build.py
последним шагом (после английской версии), руками не нужно.

Во всех страницах (корень и en/) ссылки на страницы сайта переписываются без «.html»:
  trips.html → trips, trips.html?trip=ring#custom → trips?trip=ring#custom, ../trips.html → ../trips,
  index.html → ./ (главная), ../index.html → ../, en/index.html → en/, en/trips.html → en/trips, https://tianway.kg/en/trips.html → https://tianway.kg/en/trips.
Файлы остаются с «.html»: короткий адрес превращает в файл сервер — на хостинге правило в .htaccess,
GitHub Pages умеет сам, на компьютере — tools/serve.py.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGES = {p.stem for p in ROOT.glob('*.html')}


def clean(s: str) -> str:
    def rel(m):
        attr, up, name, tail = m.group(1), m.group(2) or '', m.group(3), m.group(4) or ''
        if name == 'index':
            return f'{attr}="{up or "./"}{tail}"'
        if name not in PAGES:
            return m.group(0)
        return f'{attr}="{up}{name}{tail}"'

    s = re.sub(r'\b(href|action)="((?:\.\./|en/)?)([\w-]+)\.html([?#][^"]*)?"', rel, s)

    def absolute(m):
        base, name = m.group(1), m.group(2)
        if name == 'index':
            return base
        return base + name if name in PAGES else m.group(0)

    return re.sub(r'(https://tianway\.kg/(?:en/)?)([\w-]+)\.html(?=["?#])', absolute, s)


def main() -> None:
    for page in sorted([*ROOT.glob('*.html'), *ROOT.glob('en/*.html')]):
        s = page.read_text(encoding='utf-8')
        new = clean(s)
        if new != s:
            page.write_text(new, encoding='utf-8')
            print('короткие адреса:', page.relative_to(ROOT))


if __name__ == '__main__':
    main()
