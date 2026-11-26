/* =========================================================
   Tian Way — скрипты страницы «Соберите автодом под себя» (rent-extras.html)
   Общее (масштаб, появление) — js/main.js; «корзина» аренды и кнопки «В корзину» — js/rent-store.js.
   ========================================================= */

/* ---------- 1. «Ваше бронирование»: даты, гости, автодом, услуги, итог ----------
   Все берется из «корзины» и пересчитывается при каждом изменении. */
const rentBooking = (function () {
  const box = document.querySelector('[data-booking]');
  if (!box) return null;
  const $ = (q) => box.querySelector(q);
  const showDate = (el, d) => {
    el.classList.toggle('is-empty', !d);
    if (!d) { el.innerHTML = t('<b>—</b>дата не выбрана'); return; }
    const p = RentStore.dayParts(d);
    el.innerHTML = `<b>${p.day}</b>${p.rest}`;
  };
  let lastTotal = null;

  /* прокрутка списка услуг: оранжевая полоса справа и «растворение» низа, пока ниже есть еще строки */
  const rowsScroll = (function () {
    const list = $('[data-b-rows]');
    const bar = $('[data-b-bar]');
    const thumb = $('[data-b-thumb]');
    const range = () => Math.max(0, list.scrollHeight - list.clientHeight);
    const sync = () => {
      const r = range();
      bar.classList.toggle('is-hidden', r < 2);
      list.classList.toggle('has-more', r >= 2 && list.scrollTop < r - 2);
      if (r < 2) return;
      const h = Math.max(30, bar.clientHeight * (list.clientHeight / list.scrollHeight));
      thumb.style.height = `${h}px`;
      thumb.style.transform = `translateY(${(list.scrollTop / r) * (bar.clientHeight - h)}px)`;
    };
    list.addEventListener('scroll', sync, { passive: true });
    bar.addEventListener('wheel', (e) => { e.preventDefault(); list.scrollTop += e.deltaY; }, { passive: false });
    // во сколько раз полоса на экране меньше, чем в разметке (масштаб страницы и блока)
    const scale = () => (bar.offsetHeight ? bar.getBoundingClientRect().height / bar.offsetHeight : 0) || 1;
    // клик по дорожке — прыжок туда; ползунок можно тянуть
    bar.addEventListener('click', (e) => {
      if (e.target === thumb) return;
      const y = (e.clientY - bar.getBoundingClientRect().top) / scale();
      list.scrollTo({ top: (y / bar.clientHeight) * range(), behavior: 'smooth' });
    });
    let startY = 0; let startTop = 0;
    thumb.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      thumb.setPointerCapture(e.pointerId);
      startY = e.clientY; startTop = list.scrollTop;
      bar.classList.add('is-dragging');
    });
    thumb.addEventListener('pointermove', (e) => {
      if (!bar.classList.contains('is-dragging')) return;
      const free = bar.clientHeight - thumb.offsetHeight;
      list.scrollTop = startTop + (((e.clientY - startY) / scale()) / (free || 1)) * range();
    });
    const end = () => bar.classList.remove('is-dragging');
    thumb.addEventListener('pointerup', end);
    thumb.addEventListener('pointercancel', end);
    return { sync };
  }());

  function render() {
    const sm = RentStore.summary();
    const { esc, money, plural } = RentStore;

    showDate($('[data-b-from]'), sm.dates && sm.dates.from);
    showDate($('[data-b-to]'), sm.dates && sm.dates.to);
    $('[data-b-guests]').textContent = sm.guests.n;
    $('[data-b-guests-word]').textContent = sm.guests.word;
    $('[data-b-nights]').textContent = sm.nights || '—';
    $('[data-b-nights-word]').textContent = sm.nights ? plural(sm.nights, 'ночь', 'ночи', 'ночей') : t('ночей');

    // автодом: цена за сутки × количество ночей (без дат — за одни сутки)
    const carRow = $('.rx-book__car');
    const sum = $('[data-b-car-sum]');
    carRow.classList.toggle('is-empty', !sm.car);
    if (sm.car) {
      $('[data-b-car]').innerHTML = t('Автодом <b>{name}</b>', { name: esc(sm.car.name) });
      // у автодома без цены (data-price="0") — «уточняется», как у снаряжения без цены
      sum.textContent = sm.car.price ? money(sm.car.sum) : t('уточняется');
      sum.title = !sm.car.price ? t('цену уточнит менеджер')
        : sm.nights ? `${money(sm.car.price)} × ${sm.nights} ${plural(sm.nights, 'сутки', 'суток', 'суток')}` : t('цена за сутки');
    } else {
      $('[data-b-car]').innerHTML = t('Автодом не&nbsp;выбран');
      sum.innerHTML = t('<a href="rent#cars">Выбрать</a>');
      sum.removeAttribute('title');
    }

    // услуги и снаряжение: цена за сутки × количество × ночи
    $('[data-b-rows]').innerHTML = sm.items.map((it) => `<li><span>${esc(t(it.title))}</span><span>${it.qty}x</span><b${it.price ? '' : ' class="is-ask"'} title="${esc(RentStore.sumHint(it, sm.nights))}">${RentStore.rowSum(it, sm.nights)}</b></li>`).join('')
      || t('<li class="is-empty">Пока ничего не добавлено</li>');
    rowsScroll.sync();

    const totalEl = $('[data-b-total]');
    totalEl.textContent = RentStore.totalText(sm);
    if (lastTotal !== null && lastTotal !== sm.total) {
      totalEl.classList.remove('is-bump'); void totalEl.offsetWidth; totalEl.classList.add('is-bump');
    }
    lastTotal = sm.total;

    // подсказка, если чего-то не хватает для бронирования
    const hint = $('[data-b-hint]');
    hint.hidden = !sm.missing;
    if (sm.missing) hint.innerHTML = t('Чтобы забронировать, выберите {what} — <a href="rent">к выбору автодома</a>', { what: t(sm.missing) });
    return { ok: !sm.missing };
  }

  // «Забронировать»: без автодома или дат — не уходим, а подсвечиваем подсказку
  $('[data-b-go]').addEventListener('click', (e) => {
    if (render().ok) return;
    e.preventDefault();
    const hint = $('[data-b-hint]');
    hint.classList.remove('is-flash'); void hint.offsetWidth; hint.classList.add('is-flash');
  });

  render();
  // изменения из другой вкладки (например, в каталоге добавили снаряжение)
  window.addEventListener('storage', (e) => { if (e.key === 'tw-rent-usd') render(); });
  return { render };
}());

/* ---------- 2. Кнопки «В корзину» у услуг ---------- */
RentStore.cartControls(document, () => { if (rentBooking) rentBooking.render(); });

/* ---------- 3. Список услуг: своя прокрутка и оранжевый ползунок ----------
   Колесико и тачпад крутят сам список; ползунок можно тянуть мышью, клик по дорожке — прыжок туда.
   На компьютере список и ползунок вертикальные, на телефоне (css/m-rent-extras.css) — горизонтальные. */
(function listScroll() {
  const list = document.querySelector('[data-rx-list]');
  const bar = document.querySelector('[data-rx-bar]');
  if (!list || !bar) return;
  const thumb = bar.querySelector('[data-rx-thumb]');
  const phone = window.matchMedia('(max-width: 767px)');
  // по какой оси листаем: на телефоне — вбок
  const ax = () => (phone.matches
    ? { pos: 'scrollLeft', full: 'scrollWidth', view: 'clientWidth', size: 'offsetWidth', rect: 'width', start: 'left', client: 'clientX', tr: 'translateX', delta: (e) => e.deltaX || e.deltaY }
    : { pos: 'scrollTop', full: 'scrollHeight', view: 'clientHeight', size: 'offsetHeight', rect: 'height', start: 'top', client: 'clientY', tr: 'translateY', delta: (e) => e.deltaY });
  // во сколько раз дорожка ползунка на экране меньше/больше, чем в макете
  // (масштаб страницы × уменьшение блока из css/rent-extras.css)
  const scale = () => { const a = ax(); return (bar[a.size] ? bar.getBoundingClientRect()[a.rect] / bar[a.size] : 0) || 1; };
  const range = () => { const a = ax(); return Math.max(0, list[a.full] - list[a.view]); };
  const track = () => { const a = ax(); return bar[a.view] - thumb[a.size]; };

  const sync = () => {
    const a = ax(); const r = range();
    bar.classList.toggle('is-hidden', r < 2);
    thumb.style.transform = `${a.tr}(${r ? (list[a.pos] / r) * track() : 0}px)`;
  };
  list.addEventListener('scroll', sync, { passive: true });
  window.addEventListener('resize', sync);
  phone.addEventListener('change', sync);
  sync();

  // колесико над ползунком тоже крутит список
  bar.addEventListener('wheel', (e) => { e.preventDefault(); const a = ax(); list[a.pos] += a.delta(e); }, { passive: false });

  // перетаскивание ползунка (координаты мыши — в пикселях экрана, страница масштабирована)
  let start = 0; let startPos = 0;
  thumb.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    const a = ax();
    thumb.setPointerCapture(e.pointerId);
    start = e[a.client]; startPos = list[a.pos];
    bar.classList.add('is-dragging');
  });
  thumb.addEventListener('pointermove', (e) => {
    if (!bar.classList.contains('is-dragging')) return;
    const a = ax();
    const d = (e[a.client] - start) / scale();
    list[a.pos] = startPos + (d / track()) * range();
  });
  const end = () => bar.classList.remove('is-dragging');
  thumb.addEventListener('pointerup', end);
  thumb.addEventListener('pointercancel', end);

  // клик по дорожке — список плавно едет так, чтобы ползунок встал под курсор
  bar.addEventListener('pointerdown', (e) => {
    if (e.target === thumb) return;
    const a = ax();
    const p = (e[a.client] - bar.getBoundingClientRect()[a.start]) / scale() - thumb[a.size] / 2;
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    list.scrollTo({ [a.start]: Math.max(0, Math.min(1, p / track())) * range(), behavior: reduce ? 'auto' : 'smooth' });
  });
})();
