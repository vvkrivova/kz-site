"""
Tian Way — тексты из панели (Pages CMS) на страницы. Запускается из tools/build.py, руками не нужно.

1. Помеченные места страниц. В разметке у элемента стоит data-cms="файл:путь" — например
   data-cms="home:hero.title" (data/home.json → hero → title) или data-cms="rent:cars.forland-s1.about"
   (data/rent.json → cars → автодом с id forland-s1 → about). Сборка ставит туда текст из файла.
   Список: data-cms-list="rent:cars.forland-s1.sections.0.items" — пункты <li> из списка {text, text_en}.
   В файле текст хранится обычным текстом: перенос строки — новая строка (на странице <br>),
   неразрывный пробел — символ U+00A0 (на странице &nbsp;). Других тегов в этих местах нет.
2. Английский текст лежит рядом с русским (поле с окончанием _en). Сборка собирает пары
   «русский → английский» в data/i18n/cms-en.json — английская сборка (build_en.py) берет их раньше словаря en.json.
   Пустое английское поле — на английской странице будет русский текст (и строка в data/i18n/missing.txt).
3. Отзывы и маршруты главной: data/reviews.json и data/routes.json → data/reviews.js, data/reviews.en.js,
   data/routes.js, data/routes.en.js (их читает js/home.js; руками не править).
"""
import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCES = {'home': 'data/home.json', 'rent': 'data/rent.json'}
PAGES = ('index.html', 'rent.html')
SLOT = re.compile(r'<(h1|h2|h3|p|span)\b([^>]*?\sdata-cms="([^"]+)"[^>]*)>(.*?)</\1>', re.S)
LIST = re.compile(r'(<ul\b[^>]*?\sdata-cms-list="([^"]+)"[^>]*>)(\s*)(.*?)(\s*)</ul>', re.S)
NBSP = '\u00a0'


def to_text(s: str) -> str:
    """HTML места на странице → текст для панели (только <br> и &nbsp;)"""
    s = re.sub(r'[ \t\r\n]*<br\s*/?>[ \t\r\n]*', '\x00', s)
    if re.search(r'<[a-zA-Z/]', s):
        raise ValueError(f'в тексте есть теги: {s[:80]}')
    s = html.unescape(s.replace('&nbsp;', NBSP))
    s = re.sub(r'[ \t\r\n]+', ' ', s).strip(' ')
    return s.replace('\x00', '\n')


def to_html(s: str) -> str:
    """текст из панели → HTML: переносы строк → « <br>», неразрывные пробелы → &nbsp;"""
    s = (s or '').replace('\r\n', '\n').strip()
    s = html.escape(s, quote=False).replace(NBSP, '&nbsp;')
    s = re.sub(r'[ \t]*\n[ \t]*', '\n', s)
    # пробел перед <br> нужен: на телефоне часть переносов скрыта (br { display: none }), и без него слова слипнутся
    return re.sub(r'\n+', lambda m: ' ' + '<br>' * len(m.group(0)), s)


def norm(s: str) -> str:
    return re.sub(r'\s+', ' ', s).strip()


def resolve(data, path: str):
    """путь «cars.forland-s1.sections.0.title»: в списках ищем элемент по id или по номеру"""
    *where, field = path.split('.')
    node = data
    for seg in where:
        if isinstance(node, list):
            found = next((x for x in node if isinstance(x, dict) and x.get('id') == seg), None)
            if found is None and seg.isdigit() and int(seg) < len(node):
                found = node[int(seg)]
            node = found
        else:
            node = node.get(seg) if isinstance(node, dict) else None
        if node is None:
            raise KeyError(path)
    return node, field


class Pairs:
    def __init__(self):
        self.map = {}

    def add(self, ru_html: str, en_text):
        if en_text and en_text.strip():
            self.map.setdefault(norm(ru_html), to_html(en_text))


def fill_pages(data: dict, pairs: Pairs) -> None:
    for name in PAGES:
        page = ROOT / name
        s = page.read_text(encoding='utf-8')

        def slot(m):
            tag, attrs, ref, _ = m.groups()
            src, path = ref.split(':', 1)
            node, field = resolve(data[src], path)
            ru = to_html(node.get(field, ''))
            if not ru:
                sys.exit(f'{name}: пустой текст {ref} — заполните его в панели')
            pairs.add(ru, node.get(field + '_en'))
            return f'<{tag}{attrs}>{ru}</{tag}>'

        def lst(m):
            head, ref, lead, _, tail = m.groups()
            src, path = ref.split(':', 1)
            node, field = resolve(data[src], path)
            items = [it for it in node.get(field) or [] if (it.get('text') or '').strip()]
            lis = []
            for it in items:
                ru = to_html(it['text'])
                pairs.add(ru, it.get('text_en'))
                lis.append(f'<li>{ru}</li>')
            return f'{head}{lead}{"".join(lis)}{tail}</ul>'

        new = LIST.sub(lst, SLOT.sub(slot, s))
        if new != s:
            page.write_text(new, encoding='utf-8')
            print('тексты из панели обновлены:', name)


def js_string(s: str) -> str:
    return "'" + (s or '').replace('\\', '\\\\').replace("'", "\\'").replace('\n', '\\n').replace(NBSP, '\\u00a0') + "'"


def write_js(rel: str, header: str, var: str, items: list, keys: list, lang: str) -> None:
    rows = []
    for it in items:
        lines = []
        for k in keys:
            # английская версия: поле _en, а если оно пустое — русский текст; pics / page / path — служебные, общие
            v = (it.get(f'{k}_en') or it.get(k)) if lang == 'en' and k not in ('pics', 'page', 'path') else it.get(k)
            lines.append(f'    {k}: {js_string(str(v if v is not None else ""))},')
        rows.append('  {\n' + '\n'.join(lines) + '\n  },')
    out = ROOT / rel
    text = header + f'window.{var} = [\n' + '\n'.join(rows) + '\n];\n'
    if not out.exists() or out.read_text(encoding='utf-8') != text:
        out.write_text(text, encoding='utf-8')
        print('собран', rel)


def header(title: str, src: str) -> str:
    return ('/* =========================================================\n'
            f'   Tian Way — {title}\n'
            f'   ФАЙЛ СОБИРАЕТСЯ САМ из {src} (tools/build_content.py) — руками не править,\n'
            '   тексты меняют в панели (Pages CMS) или в этом JSON-файле.\n'
            '   ========================================================= */\n')


def build_lists() -> None:
    rv = json.loads((ROOT / 'data' / 'reviews.json').read_text(encoding='utf-8'))['reviews']
    keys = ['name', 'trip', 'days', 'text', 'pics']
    write_js('data/reviews.js', header('ОТЗЫВЫ на главной («Уже ездили с Tian Way»)', 'data/reviews.json'), 'TW_REVIEWS', rv, keys, 'ru')
    write_js('data/reviews.en.js', header('ОТЗЫВЫ на главной, английская версия', 'data/reviews.json'), 'TW_REVIEWS', rv, keys, 'en')
    ro = json.loads((ROOT / 'data' / 'routes.json').read_text(encoding='utf-8'))['routes']
    keys = ['title', 'desc', 'days', 'fun', 'food', 'season', 'who', 'page', 'path']
    write_js('data/routes.js', header('МАРШРУТЫ на главной («Куда на автодоме реально проехать»)', 'data/routes.json'), 'TW_ROUTES', ro, keys, 'ru')
    write_js('data/routes.en.js', header('МАРШРУТЫ на главной, английская версия', 'data/routes.json'), 'TW_ROUTES', ro, keys, 'en')


def main() -> None:
    data = {k: json.loads((ROOT / v).read_text(encoding='utf-8')) for k, v in SOURCES.items()}
    pairs = Pairs()
    fill_pages(data, pairs)
    out = ROOT / 'data' / 'i18n' / 'cms-en.json'
    text = json.dumps({'_readme': 'Собирается сам (tools/build_content.py): переводы текстов из панели. Руками не править.',
                       **pairs.map}, ensure_ascii=False, indent=2) + '\n'
    if not out.exists() or out.read_text(encoding='utf-8') != text:
        out.write_text(text, encoding='utf-8')
        print('переводы из панели: data/i18n/cms-en.json')
    build_lists()


if __name__ == '__main__':
    main()
