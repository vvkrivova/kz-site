"""
Tian Way — уменьшение фото, загруженных через панель Pages CMS.

Фото с телефона весят 3–10 МБ. Скрипт переводит загруженные JPG/PNG из img/tours в WebP
шириной не больше 930 px (фото дня на сайте — 372 px, ×2,5 для четких экранов),
удаляет исходник и заменяет путь к фото в data/tours.json. Фото, уже сохраненные в WebP, не трогает.

Запускается на GitHub после каждого сохранения в панели (.github/workflows/build.yml), до tools/build.py.
Нужна библиотека Pillow (pip install pillow); без нее скрипт ничего не делает.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FOLDER = ROOT / 'img' / 'tours'
DATA = ROOT / 'data' / 'tours.json'
MAX_WIDTH = 930
QUALITY = 82


def main():
    try:
        from PIL import Image, ImageOps
    except ImportError:
        print('optimize_images: нет библиотеки Pillow — фото не уменьшены')
        return
    files = [p for p in FOLDER.iterdir() if p.suffix.lower() in ('.jpg', '.jpeg', '.png')]
    if not files:
        print('optimize_images: новых фото нет')
        return
    data = DATA.read_text(encoding='utf-8')
    for src in files:
        dst = src.with_suffix('.webp')
        if dst.exists():  # такое имя уже занято — добавляем номер
            n = 2
            while src.with_name(f'{src.stem}-{n}.webp').exists():
                n += 1
            dst = src.with_name(f'{src.stem}-{n}.webp')
        with Image.open(src) as im:
            im = ImageOps.exif_transpose(im)  # фото с телефона — с учетом поворота
            im = im.convert('RGB')
            if im.width > MAX_WIDTH:
                im = im.resize((MAX_WIDTH, round(im.height * MAX_WIDTH / im.width)), Image.LANCZOS)
            im.save(dst, 'WEBP', quality=QUALITY, method=6)
        old = f'img/tours/{src.name}'
        new = f'img/tours/{dst.name}'
        data = data.replace(old, new)
        size = src.stat().st_size // 1024
        src.unlink()
        print(f'optimize_images: {old} ({size} КБ) → {new} ({dst.stat().st_size // 1024} КБ)')
    DATA.write_text(data, encoding='utf-8')


if __name__ == '__main__':
    main()
