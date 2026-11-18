"""
Tian Way — сборка страниц программ из шаблона.

Шаблон — страница tour-issyk-ring.html («Большое кольцо Иссык-Куля»): у всех программ
одинаковые оформление, лента дней, блок «Что входит в стоимость» и рисующиеся линии.
Здесь для каждой программы задаются только: название, описание, число дней, параметр
для формы на trips.html и список дней.

День — словарь:
  {'title': 'Чолпон-Ата'}                                    — только название (карточка с крупным номером)
  {'title': 'Бишкек → Иссык-Куль', 'photo': ..., 'text': ...} — с фото и описанием
  Стрелка «→» в названии рисуется как в макете (тонкая линия со стрелкой).

Запуск из папки проекта:  python3 tools/build_tours.py
Страницы tour-<slug>.html перезаписываются целиком — правьте данные здесь, а не в HTML.
"""
import re
from pathlib import Path


def nb(t):
    """Неразрывный пробел после коротких предлогов и союзов (чтобы «в», «с», «и» не висели в конце строки)."""
    return re.sub(r'(?<![\w-])(в|с|и|к|у|о|на|по|за|из|от|до|для|при)\s', r'\1&nbsp;', t)


ROOT = Path(__file__).resolve().parent.parent
TEMPLATE = ROOT / 'tour-issyk-ring.html'

ARROW = ('<svg class="tday__arrow" width="34" height="10" viewBox="0 0 34 10" fill="none" aria-hidden="true">'
         '<path d="M0 5h33M28.5 1 33 5l-4.5 4" stroke="currentColor" stroke-linejoin="round"/></svg>')

# фото и описания готовых дней «Большого кольца» (макет, ноябрь 2026) — для дней других программ с тем же названием
BISHKEK = dict(photo='img/tours/day-1-bishkek.webp', alt='Бишкек: мечеть на фоне гор',
               text=nb('Знакомство с кыргызской кухней в Supara, живописная дорога к Иссык-Кулю и первый вечер на берегу озера'))
KARAKOL = dict(photo='img/tours/day-4-karakol.webp', alt='Деревянный собор в Караколе',
               text=nb('Знакомство с городом, подъем в горы на канатной дороге и ужин в дунганской семье с приготовлением ашлянфу'))
JETI_OGUZ = dict(photo='img/tours/day-5-jeti-oguz.webp', pos='tday__photo--top', alt='Красные скалы Джети-Огуза',
                 text=nb('Красные скалы Джети-Огуза, причудливые пейзажи каньона Сказка и путешествие вдоль южного берега Иссык-Куля'))
TOP = 'tday__photo--top'
# Правило: фото и описание берем из готового дня, только если день совпадает полностью
# (то же название). Частичное совпадение (например, «Кырчын» и «Кырчын → Каракол») — оставляем одно название.

PROGRAMS = [
    {
        'slug': 'issyk-north',
        'trip': 'north',  # выбирается в «Куда хочется?» на trips.html
        'title': 'Северный берег<br>Иссык-Куля',
        'name': 'Северный берег Иссык-Куля',
        'lead': 'Размеренное путешествие по северному побережью Иссык-Куля: отдых у озера, конные прогулки, '
                'горные ущелья, традиционная кухня и рыбалка. Путешествие начнется в Бишкеке и пройдет '
                'через Балыкчы, Чолпон-Ату, Кырчын и Григорьевское ущелье — основные остановки мы отметили на карте',
        'description': 'Путешествие на 6 дней по северному берегу Иссык-Куля: отдых у озера, конные прогулки, '
                       'горные ущелья, рыбалка. Старт в Бишкеке.',
        'days_label': '6 дней',
        # дни, фото и описания — из макета («на 5 дней», ноябрь 2026)
        'days': [
            dict(title='Бишкек', photo='img/tours/day-1-bishkek.webp', alt='Бишкек: мечеть на фоне гор',
                 text=nb('Традиционный обед в Supara, дорога к Иссык-Кулю и спокойный вечер у озера')),
            dict(title='Чолпон-Ата', photo='img/tours/day-2-cholpon-ata.webp', pos=TOP, alt='Петроглифы Чолпон-Аты',
                 text=nb('Древние петроглифы, прогулка или велопоездка вдоль берега и отдых в бане')),
            dict(title='Ущелье Кырчын', photo='img/tours/north-day-3-kyrchyn.webp', pos=TOP, alt='Лошади на горном пастбище в Кырчыне',
                 text=nb('Конная прогулка среди гор, знакомство с природой ущелья и совместное приготовление куурдака')),
            dict(title='Рыбалка на Иссык-Куле', photo='img/tours/north-day-4-fishing.webp', pos=TOP, alt='Рыбак на берегу Иссык-Куля на рассвете',
                 text=nb('Ранняя рыбалка на чебака, приготовление свежего улова и неспешный отдых у озера')),
            dict(title='Григорьевское ущелье', photo='img/tours/north-day-5-grigorievka.webp', pos=TOP, alt='Горная река среди елей в Григорьевском ущелье',
                 text=nb('Прогулка среди хвойных лесов и горных пейзажей, пикник на природе и заключительный вечер на Иссык-Куле')),
            dict(title='Возвращение в Бишкек', photo='img/tours/day-1-bishkek.webp', alt='Бишкек: мечеть на фоне гор',
                 text=nb('Завтрак у озера и обратная дорога в Бишкек с трансфером в аэропорт')),
        ],
    },
    {
        'slug': 'issyk-winter',
        'trip': 'karakol',
        'title': 'Зимний маршрут<br>Иссык-Куль',
        'name': 'Зимний маршрут: Иссык-Куль',
        'lead': 'Путешествие к заснеженным вершинам Тянь-Шаня: зимние пейзажи Иссык-Куля, горнолыжный отдых '
                'в Караколе, красные скалы и горячие источники. Путешествие начнется в Бишкеке и пройдет через '
                'Чолпон-Ату, Каракол, Ак-Суу, Джети-Огуз и Ала-Арчу — основные остановки мы отметили на карте',
        'description': 'Зимнее путешествие на 6 дней вокруг Иссык-Куля: горнолыжный Каракол, горячие источники '
                       'Ак-Суу, красные скалы Джети-Огуза. Старт в Бишкеке.',
        'days_label': '6 дней',
        'days': [
            dict(title=f'Бишкек {ARROW} Иссык-Куль', **BISHKEK),
            dict(title=f'Чолпон-Ата {ARROW} Каракол'),
            dict(title='Каракол', **KARAKOL),
            dict(title='Ак-Суу'),
            dict(title='Джети-Огуз', **JETI_OGUZ),
            dict(title=f'Ала-Арча {ARROW} Бишкек'),
        ],
    },
]


def day_card(n, d):
    if d.get('photo'):
        pos = f" {d['pos']}" if d.get('pos') else ''
        text = f"\n            <p class=\"tday__text\">{d['text']}</p>" if d.get('text') else ''
        return (f'          <article class="tday">\n'
                f'            <img class="tday__photo{pos}" src="{d["photo"]}" alt="{d["alt"]}">\n'
                f'            <span class="tday__num">День {n}</span>\n'
                f'            <h3 class="tday__title">{d["title"]}</h3>{text}\n'
                f'          </article>')
    return (f'          <article class="tday tday--short" data-day="{n:02d}">\n'
            f'            <span class="tday__num">День {n}</span>\n'
            f'            <h3 class="tday__title">{d["title"]}</h3>\n'
            f'          </article>')


def sub(pattern, repl, s):
    new, count = re.subn(pattern, lambda m: repl, s, count=1, flags=re.S)
    assert count == 1, f'не найдено в шаблоне: {pattern}'
    return new


def build(p, tpl):
    s = tpl
    s = sub(r'<title>.*?</title>', f"<title>{p['name']} — Tian Way</title>", s)
    s = sub(r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{p["description"]}">', s)
    s = sub(r'<h1 class="tour__title" data-reveal>.*?</h1>', f'<h1 class="tour__title" data-reveal>{p["title"]}</h1>', s)
    s = re.sub(r'(<p class="tour__lead"[^>]*>).*?(</p>)',
               lambda m: m.group(1) + p['lead'] + m.group(2), s, count=1, flags=re.S)
    s = re.sub(r'(<span class="tour-chip__ico tour-chip__ico--days">.*?</span>\s*)8 дней',
               lambda m: m.group(1) + p['days_label'], s, count=1, flags=re.S)
    s = s.replace('trips.html?trip=ring#custom', f"trips.html?trip={p['trip']}#custom")
    days = '\n'.join(day_card(i + 1, d) for i, d in enumerate(p['days']))
    s = re.sub(r'(<div class="tour-days__track" data-days-track>\n).*?(\n        </div>\n      </div>)',
               lambda m: m.group(1) + days + m.group(2), s, count=1, flags=re.S)
    s = s.replace('<!-- вся страница — один «холст»',
                  '<!-- страница собрана скриптом tools/build_tours.py из шаблона tour-issyk-ring.html — правьте данные там -->\n  <!-- вся страница — один «холст»', 1)
    return s


if __name__ == '__main__':
    tpl = TEMPLATE.read_text(encoding='utf-8')
    for p in PROGRAMS:
        out = ROOT / f"tour-{p['slug']}.html"
        out.write_text(build(p, tpl), encoding='utf-8')
        print('готово:', out.name, f"({len(p['days'])} дн.)")
