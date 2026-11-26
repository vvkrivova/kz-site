"""
Tian Way — английская версия сайта (папка en/). Запускается из tools/build.py, руками не нужно.

Как устроено: русские страницы — главные. Из каждой (index.html, rent.html …) собирается en/<та же>.html:
  • тексты заменяются по словарю data/i18n/en.json — пары «русский текст → английский»;
    кусок текста — это абзац/заголовок/надпись целиком, вместе с <b>, <br>, <small> и т. п. внутри
    (в переводе эти теги нужно сохранить); пробелы и переносы строк в ключе не важны;
  • переводятся и подписи в атрибутах: alt, title, aria-label, placeholder, content (описание страницы),
    data-title / data-tip / data-label / data-note / data-pick;
  • пути к картинкам, стилям и скриптам получают «../» (страницы лежат на уровень глубже),
    ссылки на другие страницы остаются как есть — ведут на английские страницы;
  • надписи, которые пишут скрипты (календарь, формы, корзина), — словарь data/i18n/en-scripts.json,
    из него собирается data/i18n/en-scripts.js и подключается на английских страницах перед js/main.js;
  • тексты из панели (главная, автодома) — переводы из data/i18n/cms-en.json (собирает tools/build_content.py),
    они важнее словаря en.json;
  • данные главной (отзывы, маршруты) — английские копии data/reviews.en.js, data/routes.en.js.

Если для текста нет перевода — страница собирается с русским текстом, а сборка пишет, чего не хватает
(полный список — в data/i18n/missing.txt; файла нет, если все переведено).
"""
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = 'https://tianway.kg/'
CYR = re.compile('[А-Яа-яЁё]')
INLINE = {'b', 'i', 'em', 'strong', 'br', 'small', 'sup', 'sub', 'nobr', 'wbr'}
TEXT_ATTRS = ('alt', 'title', 'aria-label', 'placeholder', 'content', 'data-title', 'data-tip',
              'data-label', 'data-note', 'data-pick')
PATH_ATTRS = ('src', 'href', 'srcset', 'data-full', 'poster')
TOKEN = re.compile(r'<!--.*?-->|<script\b[^>]*>.*?</script>|<style\b[^>]*>.*?</style>|<[^>]+>|[^<]+', re.S)
TAG = re.compile(r'^<(/?)([a-zA-Z][\w-]*)')


def tag(rel: str) -> str:
    """метка версии файла — как в tools/build.py (по содержимому)"""
    return hashlib.md5((ROOT / rel).read_bytes()).hexdigest()[:8]


def norm(s: str) -> str:
    return re.sub(r'\s+', ' ', s).strip()


class Translator:
    def __init__(self, words: dict):
        self.words = {norm(k): v for k, v in words.items() if not k.startswith('_')}
        self.missing = {}   # текст → страницы
        self.page = ''

    def get(self, text: str) -> str:
        key = norm(text)
        if key in self.words:
            return self.words[key]
        price = self.price(key)
        if price:
            return price
        self.missing.setdefault(key, set()).add(self.page)
        return text

    @staticmethod
    def price(key: str):
        """цены переводятся сами, без словаря (их меняют в панели): «от 1 150 $» → «from $1,150»,
        «<small>от</small> 50&nbsp;$» → «<small>from</small> $50», «Цена уточняется» → «Price to be confirmed»"""
        if key == 'Цена уточняется':
            return 'Price to be confirmed'
        m = re.fullmatch(r'(<small>)?от(</small>)?\s+(\d{1,3}(?:(?:\s|&nbsp;)\d{3})*)(?:\s|&nbsp;)\$', key)
        if not m:
            return None
        num = re.sub(r'\s|&nbsp;', '', m.group(3))
        money = '$' + (f'{int(num):,}' if num.strip('0') else ','.join([num[:-3], num[-3:]]) if len(num) > 3 else num)
        return f'{m.group(1) or ""}from{m.group(2) or ""} {money}'

    # --- текст между тегами: собираем куски вместе со «строчными» тегами (<b>, <br> …) ---
    def units(self, tokens):
        out, buf = [], []

        def flush():
            if not buf:
                return
            raw = ''.join(buf)
            buf.clear()
            plain = re.sub(r'<[^>]+>', '', raw)
            if not CYR.search(plain):
                out.append(raw)
                return
            lead = raw[:len(raw) - len(raw.lstrip())]
            trail = raw[len(raw.rstrip()):]
            out.append(lead + self.get(raw.strip()) + trail)

        for t in tokens:
            if t.startswith('<!--') or t.startswith('<script') or t.startswith('<style') or t.startswith('<!'):
                flush(); out.append(t); continue
            m = TAG.match(t)
            if m:
                if m.group(2).lower() in INLINE:
                    buf.append(t)
                else:
                    flush(); out.append(self.attrs(t))
                continue
            buf.append(t)
        flush()
        return out

    def attrs(self, tag: str) -> str:
        def repl(m):
            name, val = m.group(1), m.group(2)
            if CYR.search(val):
                val = self.get(val)
            return f' {name}="{val}"'
        return re.sub(r'\s(' + '|'.join(TEXT_ATTRS) + r')="([^"]*)"', repl, tag)


def is_local_file(v: str) -> bool:
    """путь к файлу (картинка, стиль, скрипт), а не ссылка на страницу сайта: ссылки на страницы
    (trips.html, trips, trips?trip=ring#custom, ./ — главная) на английской странице остаются как есть —
    они ведут на английские страницы"""
    if not v or re.match(r'^(#|/|[a-z]+:|\.\./)', v) or v in ('./', '.'):
        return False
    base = re.split(r'[?#]', v, maxsplit=1)[0]
    if base.endswith('.html') or (ROOT / f'{base}.html').exists():
        return False
    return True


def rewrite_paths(tag: str) -> str:
    def repl(m):
        name, val = m.group(1), m.group(2)
        if name == 'srcset':
            val = ', '.join(('../' + p.strip()) if is_local_file(p.strip().split(' ')[0]) else p.strip() for p in val.split(','))
        elif is_local_file(val):
            val = '../' + val
        return f' {name}="{val}"'
    tag = re.sub(r'\s(' + '|'.join(PATH_ATTRS) + r')="([^"]*)"', repl, tag)
    tag = re.sub(r'url\((["\']?)(?!data:|https?:|/|\.\./)([^)"\']+)\1\)', r'url(\1../\2\1)', tag)
    # og:image и т. п. — путь в content у <meta property="og:image">
    if tag.startswith('<meta') and 'og:image' in tag:
        tag = re.sub(r'content="(?!https?:)([^"]+)"', lambda m: f'content="{SITE}{m.group(1)}"', tag)
    return tag


def page_url(name: str, lang: str) -> str:
    base = SITE + ('en/' if lang == 'en' else '')
    return base if name == 'index.html' else base + name


def lang_head(name: str) -> str:
    """ссылки на версии страницы (для поисковиков) и автовыбор языка по устройству"""
    return (f'  <!-- языки: альтернативные версии и автовыбор (собирает tools/build.py) -->\n'
            f'  <link rel="alternate" hreflang="ru" href="{page_url(name, "ru")}">\n'
            f'  <link rel="alternate" hreflang="en" href="{page_url(name, "en")}">\n'
            f'  <link rel="alternate" hreflang="x-default" href="{page_url(name, "ru")}">\n'
            f'  <script src="{{root}}js/lang-detect.js?v={tag("js/lang-detect.js")}"></script>\n'
            '  <!-- /языки -->\n')


LANG_BLOCK = re.compile(r'  <!-- языки: .*?<!-- /языки -->\n', re.S)


def add_lang_head(s: str, name: str, root: str) -> str:
    """вставляет блок языков перед </head> (повторно — заменяет)"""
    block = lang_head(name).replace('{root}', root)
    s = LANG_BLOCK.sub('', s)
    return s.replace('</head>', block + '</head>', 1)


def build_page(src: Path, tr: Translator) -> str:
    tr.page = src.name
    s = src.read_text(encoding='utf-8')
    tokens = TOKEN.findall(s)
    assert ''.join(tokens) == s, f'{src.name}: разбор страницы не сошелся'
    tokens = tr.units(tokens)
    out = []
    for t in tokens:
        if t.startswith('<') and not t.startswith('<!--') and not t.startswith('<style'):
            if t.startswith('<script'):
                head, _, rest = t.partition('>')
                t = rewrite_paths(head + '>') + rest
            else:
                t = rewrite_paths(t)
        out.append(t)
    s = ''.join(out)
    # цены в английском формате: «2&nbsp;$» → «$2» (в тексте страниц; переводы с «$» уже в нужном виде)
    s = re.sub(r'(?<![\w$.,])(\d+)&nbsp;\$', r'$\1', s)
    s = s.replace('<html lang="ru">', '<html lang="en">', 1)
    s = s.replace('content="ru_RU"', 'content="en_US"')
    # переключатель языка: на английской странице русская версия — уровнем выше
    s = re.sub(r'href="[^"]*"(\s+hreflang="ru"\s+data-lang-link)', f'href="../{src.name}"\\1', s)
    s = re.sub(r'href="[^"]*"(\s+hreflang="en"\s+data-lang-link)', f'href="{src.name}"\\1', s)
    # данные главной — английские копии, если есть
    def data_en(m):
        rel = m.group(1)
        en = rel[:-3] + '.en.js'
        return f'src="../{en}' if (ROOT / en).exists() else m.group(0)
    s = re.sub(r'src="\.\./(data/[\w-]+\.js)', data_en, s)
    # картинки с русским текстом: если рядом лежит английская копия img/<имя>.en.<расширение> — берем ее
    def img_en(m):
        path, ext = m.group(1), m.group(2)
        return f'src="../{path}.en.{ext}"' if (ROOT / f'{path}.en.{ext}').exists() else m.group(0)
    s = re.sub(r'src="\.\./(img/[\w/.-]+?)\.(webp|png|jpg|svg)"', img_en, s)
    # надписи скриптов — перед js/main.js
    s = s.replace('<script src="../js/main.js', f'<script src="../data/i18n/en-scripts.js?v={tag("data/i18n/en-scripts.js")}"></script>\n  <script src="../js/main.js', 1)
    return s


def build_scripts_dict() -> None:
    words = json.loads((ROOT / 'data' / 'i18n' / 'en-scripts.json').read_text(encoding='utf-8'))
    words = {k: v for k, v in words.items() if not k.startswith('_')}
    js = ('/* Собирается из data/i18n/en-scripts.json (tools/build.py) — руками не править */\n'
          'window.TW_I18N = ' + json.dumps(words, ensure_ascii=False, indent=1) + ';\n')
    out = ROOT / 'data' / 'i18n' / 'en-scripts.js'
    if not out.exists() or out.read_text(encoding='utf-8') != js:
        out.write_text(js, encoding='utf-8')


def main() -> None:
    words = json.loads((ROOT / 'data' / 'i18n' / 'en.json').read_text(encoding='utf-8'))
    # переводы текстов из панели (tools/build_content.py) — важнее словаря: их правят вместе с русским текстом
    cms = ROOT / 'data' / 'i18n' / 'cms-en.json'
    if cms.exists():
        words.update(json.loads(cms.read_text(encoding='utf-8')))
    tr = Translator(words)
    (ROOT / 'en').mkdir(exist_ok=True)
    build_scripts_dict()
    pages = sorted(ROOT.glob('*.html'))
    for src in pages:
        ru = src.read_text(encoding='utf-8')
        ru_new = add_lang_head(ru, src.name, '')
        if ru_new != ru:
            src.write_text(ru_new, encoding='utf-8')
        en = build_page(src, tr)
        en = add_lang_head(LANG_BLOCK.sub('', en), src.name, '../')
        dst = ROOT / 'en' / src.name
        if not dst.exists() or dst.read_text(encoding='utf-8') != en:
            dst.write_text(en, encoding='utf-8')
            print('английская страница:', 'en/' + src.name)
    miss = ROOT / 'data' / 'i18n' / 'missing.txt'
    if tr.missing:
        lines = [f'{k}\n    — {", ".join(sorted(v))}' for k, v in sorted(tr.missing.items(), key=lambda kv: sorted(kv[1])[0])]
        miss.write_text('Нет перевода в data/i18n/en.json:\n\n' + '\n'.join(lines) + '\n', encoding='utf-8')
        print(f'нет перевода: {len(tr.missing)} текстов — список в data/i18n/missing.txt')
    elif miss.exists():
        miss.unlink()


if __name__ == '__main__':
    main()
