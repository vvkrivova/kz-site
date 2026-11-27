"""
Tian Way — цены и занятые даты аренды из data/rent.json. Запускается из tools/build.py, руками не нужно.

data/rent.json правят в панели (Pages CMS) или руками. Все цены — в сомах (KGS, ТЗ № 1 «валютная система»). Сборка:
  • на страницах rent.html и rent-extras.html у карточек с тем же data-car / data-item ставит текст цены
    (и data-label / data-note у бесплатных услуг — подписи в итоге);
  • собирает data/rent-prices.js — цены для расчета итога в браузере (js/rent-store.js; сервер, lead.php,
    считает по тому же data/rent.json) и data/rent-availability.js (вместимость и занятые даты — js/rent.js).
Остальная разметка карточек (названия, описания, фото, места на странице) не меняется.

Сумма на странице — <span class="money" data-kgs="N">N сом</span>: js/main.js (Money) показывает ее в выбранной
валюте (доллары и рубли — справочно, по курсу Нацбанка), английская сборка переводит «N сом» → «N KGS» сама.
Текст цены: автодом — «от N сом / сутки» (N — самая низкая ставка, от 21 суток); снаряжение и услуги
«за сутки» — «N сом / сутки»; разовая «от N сом»; бесплатное — price_text; без цены — «Цена уточняется».
Неразрывные пробелы ставятся сами (после коротких слов и между числом и словом) — так тексты совпадают
с переводами в data/i18n/en.json.
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


TIERS = ('d1', 'd4', 'd7', 'd14', 'd21')   # ставки автодома: 1–3, 4–6, 7–13, 14–20, 21+ суток
TIER_FROM = (1, 4, 7, 14, 21)


def num(v) -> int:
    try:
        return max(0, int(round(float(v or 0))))
    except (TypeError, ValueError):
        return 0


def money(kgs: int, frm: bool = False) -> str:
    """сумма в сомах для страницы: js/main.js (Money) покажет ее в выбранной валюте"""
    n = f'{kgs:,}'.replace(',', '&nbsp;')
    return f'<span class="money" data-kgs="{kgs}"{" data-from" if frm else ""}>{"от " if frm else ""}{n} сом</span>'


def car_rates(car: dict) -> list:
    pr = car.get('prices') or {}
    rates = [num(pr.get(k)) for k in TIERS]
    # пустая ступень берет ставку предыдущей (иначе 0 сделал бы аренду «бесплатной»)
    for i in range(1, len(rates)):
        if not rates[i]:
            rates[i] = rates[i - 1]
    return rates if rates[0] else [0] * len(TIERS)


def car_price(rates: list) -> str:
    low = min(r for r in rates if r) if any(rates) else 0
    if low:
        return (f'<p class="car__price"><span class="car__price-sum">{money(low, True)}</span>'
                f'<span class="car__price-per">/ сутки</span></p>')
    return '<p class="car__price car__price--ask"><span class="car__price-sum">Цена уточняется</span></p>'


def item_type(it: dict) -> str:
    """тип цены: day — за сутки, from — разовая «от», free — бесплатно, quote — по запросу, delivery — доставка"""
    t = (it.get('type') or '').strip()
    if t not in ('day', 'from', 'free', 'quote', 'delivery'):
        t = 'day'
    if t in ('day', 'from', 'delivery') and not num(it.get('price')):
        t = 'free' if t == 'delivery' else 'quote'
    return t


def item_price(cls: str, it: dict) -> str:
    """cls — класс абзаца цены на этой карточке: gear__price, gear__price kit__price или svc__price"""
    base = cls.split()[0]
    t, price = item_type(it), num(it.get('price'))
    if t == 'day':
        return f'<p class="{cls}">{money(price)}<span class="price-per">/ сутки</span></p>'
    if t == 'from':
        return f'<p class="{cls}">{money(price, True)}</p>'
    text = (it.get('price_text') or '').strip() if t in ('free', 'delivery') else ''
    # «Бесплатно…» и «Цена уточняется» — серой надписью, как в макете
    return f'<p class="{cls} {base}--ask">{typo(text) if text else "Цена уточняется"}</p>'


def prices_js(data: dict, cars: list, items: list) -> str:
    """цены для расчета в браузере — одна структура на все страницы аренды (js/rent-store.js)"""
    out = {'deposit': num(data.get('deposit')), 'prepay': num(data.get('prepay_percent')) or 30,
           'minNights': num(data.get('min_nights')) or 1,
           'tiers': list(TIER_FROM), 'cars': {}, 'items': {}}
    for c in cars:
        out['cars'][c['id']] = car_rates(c)
    for it in items:
        t = item_type(it)
        row = {'type': t, 'price': num(it.get('price'))}
        if t == 'delivery':
            row['free'] = {'city': num(it.get('free_from')) or 3, 'airport': num(it.get('free_from_airport')) or 5}
        out['items'][it['id']] = row
    body = json.dumps(out, ensure_ascii=False, indent=2)
    return ('/* =========================================================\n'
            '   Tian Way — цены аренды в сомах (KGS) для расчета итога: js/rent-store.js\n'
            '   ФАЙЛ СОБИРАЕТСЯ САМ из data/rent.json (tools/build_rent.py) — руками не править.\n\n'
            '   cars  — сом за сутки по сроку: ставки от 1, 4, 7, 14, 21 суток (tiers); ставка срока — на все сутки.\n'
            '   items — снаряжение и услуги: day — сом за сутки × количество × сутки; from — разовая «от» (в сумму не входит);\n'
            '           free — бесплатно; quote — цена по запросу; delivery — сом за направление, бесплатно\n'
            '           по Бишкеку (city) и в аэропорт (airport) от N суток.\n'
            '   deposit — возвратный залог (отдельно от аренды), prepay — предоплата аренды, %, minNights — минимальный срок, суток.\n'
            '   ========================================================= */\n'
            f'window.RENT_PRICES = {body};\n')


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
                tag = set_attr(tag, 'data-price', None)
                rates = car_rates(cars[cid])
                body = re.sub(r'<p class="car__price[^"]*">.*?</p>', lambda _: car_price(rates), body, count=1, flags=re.S)
                return tag + body + end
            iid = re.search(r'\bdata-item="([^"]+)"', tag).group(1)
            if iid not in items:
                print(f'build_rent: {name}: «{iid}» нет в data/rent.json — карточка без изменений')
                return m.group(0)
            used.add(iid)
            it = items[iid]
            t = item_type(it)
            tag = set_attr(tag, 'data-price', None)
            tag = set_attr(tag, 'data-free-from', None)
            # подписи в итоге: бесплатное — label («бесплатно»), подсказка к строке — note
            tag = set_attr(tag, 'data-label', (it.get('label') or 'бесплатно') if t == 'free' else None, after='data-title')
            tag = set_attr(tag, 'data-note', it.get('note'), after='data-label' if t == 'free' else 'data-title')

            def price_p(pm):
                cls = re.sub(r'\s+(?:gear|svc)__price--ask', '', pm.group(1))
                return item_price(cls, it)
            body = re.sub(r'<p class="((?:gear|svc)__price[^"]*)">.*?</p>', price_p, body, count=1, flags=re.S)
            # сумма в тексте карточки (доставка: «на меньший срок — 2 200 сом в одну сторону») — из той же цены
            body = re.sub(r'<span class="money" data-kgs="\d+">[^<]*</span>', lambda _: money(num(it.get('price'))), body)
            return tag + body + end

        new = ARTICLE.sub(card, s)
        if new != s:
            page.write_text(new, encoding='utf-8')
            print('цены аренды обновлены:', name)

    # залог в текстах страниц (вопросы и ответы): <span class="money" data-kgs="N" data-deposit> — из data/rent.json
    dep = num(data.get('deposit'))
    for name in ('faq.html',):
        page = ROOT / name
        s = page.read_text(encoding='utf-8')
        new = re.sub(r'<span class="money" data-kgs="\d+" data-deposit>[^<]*</span>',
                     lambda _: money(dep).replace('class="money"', 'class="money"', 1).replace('">', '" data-deposit>', 1), s)
        if new != s:
            page.write_text(new, encoding='utf-8')
            print('залог обновлен:', name)

    unused = [k for k in [*cars, *items] if k not in used]
    if unused:
        print('build_rent: в data/rent.json есть то, чего нет на страницах:', ', '.join(unused))

    pj = prices_js(data, [c for c in data.get('cars') or [] if c.get('id')],
                   [it for it in [*(data.get('gear') or []), *(data.get('services') or [])] if it.get('id')])
    out = ROOT / 'data' / 'rent-prices.js'
    if not out.exists() or out.read_text(encoding='utf-8') != pj:
        out.write_text(pj, encoding='utf-8')
        print('цены аренды для расчета обновлены: data/rent-prices.js')

    js = availability_js(data['cars'])
    out = ROOT / 'data' / 'rent-availability.js'
    if out.read_text(encoding='utf-8') != js:
        out.write_text(js, encoding='utf-8')
        print('занятость автодомов обновлена: data/rent-availability.js')


if __name__ == '__main__':
    main()
