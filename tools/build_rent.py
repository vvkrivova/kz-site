"""
Tian Way — цены и занятые даты аренды из data/rent.json. Запускается из tools/build.py, руками не нужно.

data/rent.json правят в панели (Pages CMS) или руками. Сборка:
  • на страницах rent.html и rent-extras.html у карточек с тем же data-car / data-item ставит
    data-price (и data-label / data-note / data-free-from у услуг) и текст цены на карточке;
  • собирает data/rent-availability.js (вместимость и занятые даты автодомов — его читает js/rent.js).
Остальная разметка карточек (названия, описания, фото, места на странице) не меняется.

Текст цены: price > 0 — «N $ / сутки» (у автодомов — «от N $ / сутки»); price = 0 — price_text
(«Бесплатно», «от 50 $»), а если его нет — «Цена уточняется». Неразрывные пробелы ставятся сами
(после коротких слов и между числом и словом) — так тексты совпадают с переводами в data/i18n/en.json.
"""
import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGES = ('rent.html', 'rent-extras.html')
ARTICLE = re.compile(r'(<article class="(car|gear|kit|svc)\b[^"]*"[^>]*>)(.*?)(</article>)', re.S)
SHORT = r'(?:в|с|к|у|о|и|а|на|по|от|до|за|из|при|без|для)'


def typo(text: str) -> str:
    """обычный текст → HTML карточки: «от 50 $» → «<small>от</small> 50&nbsp;$», неразрывные пробелы"""
    s = html.escape(text.strip(), quote=False)
    m = re.fullmatch(r'от (\d[\d ]*) \$', s)
    if m:
        return f'<small>от</small> {m.group(1)}&nbsp;$'
    s = re.sub(r' \$', '&nbsp;$', s)
    s = re.sub(rf'(?<![\wА-Яа-яЁё])({SHORT}) (?=\S)', r'\1&nbsp;', s, flags=re.I)
    s = re.sub(r'(\d) (?=[А-Яа-яЁёA-Za-z])', r'\1&nbsp;', s)
    return s


def set_attr(tag: str, name: str, value, after: str = 'data-price') -> str:
    """поставить/заменить/убрать атрибут в открывающем теге"""
    pat = re.compile(rf'\s{name}="[^"]*"')
    if value is None or value == '':
        return pat.sub('', tag)
    new = f' {name}="{html.escape(str(value))}"'
    if pat.search(tag):
        return pat.sub(lambda m: new, tag, count=1)
    return re.sub(rf'(\s{after}="[^"]*")', lambda m: m.group(1) + new, tag, count=1)


def car_price(price: int) -> str:
    if price > 0:
        return (f'<p class="car__price"><span class="car__price-sum"><small>от</small> {price}&nbsp;$</span>'
                f'<span class="car__price-per">/ сутки</span></p>')
    return '<p class="car__price car__price--ask"><span class="car__price-sum">Цена уточняется</span></p>'


def item_price(cls: str, it: dict) -> str:
    """cls — класс абзаца цены на этой карточке: gear__price, gear__price kit__price или svc__price"""
    if it['price'] > 0:
        return f'<p class="{cls}">{it["price"]}&nbsp;$<span class="price-per">/ сутки</span></p>'
    text = (it.get('price_text') or '').strip()
    base = cls.split()[0]
    if not text:
        return f'<p class="{cls} {base}--ask">Цена уточняется</p>'
    # «от 50 $» — обычная цена, «Бесплатно…» — серой надписью, как в макете
    ask = '' if re.match(r'от \d', text) else f' {base}--ask'
    return f'<p class="{cls}{ask}">{typo(text)}</p>'


def check_dates(car: dict) -> list:
    out = []
    for b in car.get('busy') or []:
        a, z = str(b.get('from', ''))[:10], str(b.get('to', ''))[:10]
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', a) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', z):
            print(f'build_rent: у «{car.get("name")}» неверные даты брони {b} — пропущены')
            continue
        if z <= a:
            print(f'build_rent: у «{car.get("name")}» дата выезда {z} не позже заезда {a} — бронь пропущена')
            continue
        out.append([a, z])
    return sorted(out)


def availability_js(cars: list) -> str:
    rows = []
    for c in cars:
        busy = ', '.join(f"['{a}', '{z}']" for a, z in check_dates(c))
        rows.append(f"  {json.dumps(c['id'])}: {{ seats: {int(c.get('seats') or 0)}, busy: [{busy}] }}, // {c.get('name', '')}")
    return ('/* =========================================================\n'
            '   Tian Way — вместимость и занятость автодомов (страница аренды rent.html)\n'
            '   ФАЙЛ СОБИРАЕТСЯ САМ из data/rent.json (tools/build_rent.py) — руками не править.\n\n'
            '   seats — сколько человек вмещает автодом.\n'
            "   busy  — занятые периоды: ['день заезда', 'день выезда'] в виде 'ГГГГ-ММ-ДД'.\n"
            '           Автодом занят с дня заезда до дня выезда; в день выезда его уже можно\n'
            '           отдать следующим гостям (выезд утром, заезд днем).\n'
            '   ========================================================= */\n'
            'window.RENT_CARS = {\n' + '\n'.join(rows) + '\n};\n')


def main() -> None:
    data = json.loads((ROOT / 'data' / 'rent.json').read_text(encoding='utf-8'))
    # строка без id (добавлена в панели) не относится ни к одной карточке — пропускаем
    cars = {c['id']: c for c in data.get('cars') or [] if c.get('id')}
    items = {it['id']: it for it in [*(data.get('gear') or []), *(data.get('services') or [])] if it.get('id')}
    used = set()

    for name in PAGES:
        page = ROOT / name
        s = page.read_text(encoding='utf-8')

        def card(m):
            tag, kind, body, end = m.groups()
            if kind == 'car':
                cid = re.search(r'\bdata-car="([^"]+)"', tag).group(1)
                if cid not in cars:
                    print(f'build_rent: {name}: автодома «{cid}» нет в data/rent.json — карточка без изменений')
                    return m.group(0)
                used.add(cid)
                price = int(cars[cid]['price'] or 0)
                tag = set_attr(tag, 'data-price', price)
                body = re.sub(r'<p class="car__price[^"]*">.*?</p>', lambda _: car_price(price), body, count=1, flags=re.S)
                return tag + body + end
            iid = re.search(r'\bdata-item="([^"]+)"', tag).group(1)
            if iid not in items:
                print(f'build_rent: {name}: «{iid}» нет в data/rent.json — карточка без изменений')
                return m.group(0)
            used.add(iid)
            it = items[iid]
            it['price'] = int(it.get('price') or 0)
            tag = set_attr(tag, 'data-price', it['price'])
            tag = set_attr(tag, 'data-label', it.get('label') if it['price'] == 0 else None)
            tag = set_attr(tag, 'data-note', it.get('note'), after='data-label' if it['price'] == 0 and it.get('label') else 'data-price')
            tag = set_attr(tag, 'data-free-from', it.get('free_from') if it['price'] == 0 else None, after='data-label')

            def price_p(pm):
                cls = re.sub(r'\s+(?:gear|svc)__price--ask', '', pm.group(1))
                return item_price(cls, it)
            body = re.sub(r'<p class="((?:gear|svc)__price[^"]*)">.*?</p>', price_p, body, count=1, flags=re.S)
            return tag + body + end

        new = ARTICLE.sub(card, s)
        if new != s:
            page.write_text(new, encoding='utf-8')
            print('цены аренды обновлены:', name)

    unused = [k for k in [*cars, *items] if k not in used]
    if unused:
        print('build_rent: в data/rent.json есть то, чего нет на страницах:', ', '.join(unused))

    js = availability_js(data['cars'])
    out = ROOT / 'data' / 'rent-availability.js'
    if out.read_text(encoding='utf-8') != js:
        out.write_text(js, encoding='utf-8')
        print('занятость автодомов обновлена: data/rent-availability.js')


if __name__ == '__main__':
    main()
