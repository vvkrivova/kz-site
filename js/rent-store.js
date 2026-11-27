/* =========================================================
   Tian Way — «корзина» аренды: общая для страниц аренды
   (каталог rent.html → «Соберите автодом под себя» → итоговая страница).
   Хранится в браузере посетителя (localStorage). Состав (без цен — только что выбрано):
   { from, to, guests, promo, car: { id, name }, items: { id: { title, qty, label, note, variant } } }
   Цены — в сомах из data/rent-prices.js (собирается из data/rent.json; по нему же считает сервер, lead.php),
   поэтому итог везде один и тот же. Показ в выбранной валюте — Money (js/main.js).
   ========================================================= */
window.RentStore = (function () {
  const KEY = 'tw-rent-kgs';      // 27.11.2026: цены в сомах и больше не хранятся в корзине
  const OLD_KEYS = ['tw-rent-usd']; // прежние корзины (цены в долларах) — переносим выбор без цен
  const P = window.RENT_PRICES || { cars: {}, items: {}, tiers: [1], deposit: 0, prepay: 30 };
  // браузер не дает хранить данные (запрет cookie, приватный режим) — держим выбор в памяти страницы,
  // чтобы поиск и итог хотя бы на этой странице работали
  let memory = null;
  const read = () => {
    if (memory) return JSON.parse(JSON.stringify(memory));
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { memory = {}; return {}; }
  };
  // перенос старой корзины: даты, гости, автодом и количество вещей остаются, старые цены — нет
  try {
    OLD_KEYS.forEach((k) => {
      const old = JSON.parse(localStorage.getItem(k) || 'null');
      if (old === null) return;
      localStorage.removeItem(k);
      if (localStorage.getItem(KEY)) return;
      const s = { from: old.from, to: old.to, guests: old.guests, promo: old.promo };
      if (old.car && old.car.id) s.car = { id: old.car.id, name: old.car.name };
      s.items = {};
      Object.entries(old.items || {}).forEach(([id, it]) => { if (it && it.qty > 0) s.items[id] = { title: it.title, qty: it.qty }; });
      localStorage.setItem(KEY, JSON.stringify(s));
    });
  } catch (e) { /* хранилище недоступно — переносить нечего */ }
  const write = (s) => {
    if (memory) { memory = s; return; }
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { memory = s; }
  };
  const pad = (n) => String(n).padStart(2, '0');
  // даты храним строкой «2026-11-12» — без часовых поясов
  const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromKey = (k) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(k || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  };

  // ставка автодома за сутки по сроку: ступени 1–3, 4–6, 7–13, 14–20, 21+ (P.tiers) — на все сутки аренды
  const carRate = (id, days) => {
    const rates = P.cars[id] || [];
    let rate = 0;
    (P.tiers || [1]).forEach((from, i) => { if (days >= from && rates[i]) rate = rates[i]; });
    return rate;
  };
  // сумма вещи в сомах и подпись вместо суммы (бесплатно / «от …» / уточняется)
  const itemCalc = (id, it, nights) => {
    const p = P.items[id] || { type: 'quote', price: 0 };
    const days = nights || 1;
    const qty = it.qty || 0;
    if (p.type === 'day') return { price: p.price, sum: p.price * qty * days, label: '' };
    if (p.type === 'delivery') {
      const where = it.variant === 'airport' ? 'airport' : 'city';
      const free = nights >= p.free[where];
      return { price: free ? 0 : p.price, sum: free ? 0 : p.price * qty, label: free ? 'бесплатно' : '', where, freeFrom: p.free[where] };
    }
    if (p.type === 'from') return { price: 0, sum: 0, label: '', from: p.price };
    if (p.type === 'free') return { price: 0, sum: 0, label: it.label || 'бесплатно' };
    return { price: 0, sum: 0, label: 'уточняется' };
  };

  return {
    get: read,
    prices: P,
    carRate,
    update(fn) { const s = read(); fn(s); write(s); return s; },
    toKey,
    fromKey,
    /* сохраненные даты, если они еще не в прошлом */
    dates() {
      const s = read();
      const from = fromKey(s.from); const to = fromKey(s.to);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      return from && to && from >= today && to > from ? { from, to } : null;
    },
    qty(id) { const it = (read().items || {})[id]; return it ? it.qty : 0; },
    variant(id) { const it = (read().items || {})[id]; return (it && it.variant) || ''; },
    setVariant(id, variant) { return this.update((s) => { if (s.items && s.items[id]) s.items[id].variant = variant; }); },
    setQty(id, qty, info) {
      return this.update((s) => {
        s.items = s.items || {};
        if (qty > 0) s.items[id] = { ...(s.items[id] || {}), ...(info || {}), qty };
        else delete s.items[id];
      });
    },
    // сумма в сомах → текст в выбранной валюте (js/main.js, Money); exact — всегда в сомах
    money: (n, exact) => Money.fmt(n, { exact }),
    // то же, но элементом с data-kgs — сам обновится при смене валюты или курса (Money.render)
    moneyHtml: (n, exact) => (exact ? Money.fmt(n, { exact: true }) : `<span class="money" data-kgs="${n}">${Money.fmt(n)}</span>`),

    // слово для числа — общее для сайта (js/main.js): по-русски три формы, по-английски одна/много
    plural: (n, one, few, many) => plural(n, one, few, many),

    /* Сводка бронирования — одна на все страницы, чтобы итог везде совпадал (сервер, lead.php, считает так же).
       Все в сомах. Сутки = ночи (день выдачи считается, день возврата — нет); без дат — за одни сутки.
       Автодом — ставка срока × сутки; снаряжение и услуги «за сутки» — цена × количество × сутки;
       доставка — цена за направление × направления, бесплатно от N суток (по Бишкеку и в аэропорт — разные N);
       «от …», бесплатное и «по запросу» в сумму не входят. Предоплата — prepay % аренды, залог — отдельно. */
    summary(opts = {}) {
      const s = read();
      if (opts.car) s.car = opts.car;   // итог «как если бы выбрали этот автодом» (окошко на rent.html)
      const dates = this.dates();
      const nights = dates ? Math.round((dates.to - dates.from) / 86400000) : 0;
      const days = nights || 1;
      const g = /^(\d+)\s*(.*)$/.exec(s.guests || '');
      const rate = s.car ? carRate(s.car.id, days) : 0;
      const car = s.car ? { ...s.car, price: rate, sum: rate * days } : null;
      const items = Object.entries(s.items || {}).map(([id, it]) => ({ id, ...it, ...itemCalc(id, it, nights) }));
      const total = (car ? car.sum : 0) + items.reduce((a, it) => a + it.sum, 0);
      // предоплата — до тыйына (сотые доли сома), остаток — разница, чтобы вместе ровно total
      const prepay = Math.round(total * P.prepay) / 100;
      return {
        dates, nights, car, items, total, promo: s.promo || '',
        prepay, rest: Math.round((total - prepay) * 100) / 100, deposit: P.deposit, prepayPercent: P.prepay,
        // слово — по числу и языку страницы (выбор мог быть сделан на другом языке)
        guests: { n: g ? g[1] : '—', word: g ? plural(+g[1], 'гость', 'гостя', 'гостей') : t('гостей'),
          text: g ? `${g[1]} ${plural(+g[1], 'гость', 'гостя', 'гостей')}` : '' },
        minNights: P.minNights || 1,
        // 'срок' — даты короче минимального срока аренды (выбраны до 27.11.2026 или в другой вкладке)
        missing: !s.car ? 'автодом' : !dates ? 'даты поездки' : nights < (P.minNights || 1) ? 'срок' : !g ? 'количество гостей' : '',
      };
    },

    /* итог для показа: если цена автодома еще не известна (price 0, «Цена уточняется»), к сумме дописываем «+ автодом»;
       если ничего с ценой не выбрано — «уточняется» */
    totalText(sm, asHtml) {
      const m = (n) => (asHtml ? this.moneyHtml(n) : this.money(n));
      const askCar = sm.car && !sm.car.price;
      if (!askCar) return m(sm.total);
      return sm.total ? t('{sum} + автодом', { sum: m(sm.total) }) : t('уточняется');
    },

    /* «21» и «Декабря, пн» — как в макете */
    dayParts(d) {
      const M = ['Января', 'Февраля', 'Марта', 'Апреля', 'Мая', 'Июня', 'Июля', 'Августа', 'Сентября', 'Октября', 'Ноября', 'Декабря'].map((w) => t(w));
      const W = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'].map((w) => t(w));
      return { day: d.getDate(), rest: `${M[d.getMonth()]}, ${W[d.getDay()]}` };
    },

    /* подпись вместо суммы у позиций без цены за сутки (data-price="0"):
       data-label — «бесплатно», «от 50 $»; data-free-from — бесплатно только от N суток (меньше — «уточняется») */
    rowLabel(it) {
      if (it.from) return Money.fmt(it.from, { from: true });
      return t(it.label || 'уточняется');
    },
    /* сумма строки для «Вашего бронирования»: число — или подпись (rowLabel) */
    rowSum(it) {
      return it.sum ? this.money(it.sum) : `<span>${this.esc(this.rowLabel(it))}</span>`;
    },

    /* подсказка к сумме строки: «200 сом × 2 шт. × 5 суток»; у доставки — «2 200 сом × 1 направление» */
    sumHint(it, nights) {
      if (it.where) {
        const rule = t(it.where === 'airport' ? 'в аэропорт — бесплатно от {n} суток' : 'по Бишкеку — бесплатно от {n} суток', { n: it.freeFrom });
        return it.sum ? `${this.money(it.price)} × ${it.qty} ${plural(it.qty, 'направление', 'направления', 'направлений')}; ${rule}` : rule;
      }
      if (!it.sum) return t(it.note || 'цену уточнит менеджер');
      return `${this.money(it.price)} × ${it.qty} ${t('шт.')} × ${nights ? `${nights} ${this.plural(nights, 'сутки', 'суток', 'суток')}` : t('1 сутки (даты не выбраны)')}`;
    },

    esc: (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),

    /* Кнопки «В корзину» → счетчик «− 1 +» внутри root.
       Разметка: карточка с data-item, data-title, data-price и пустой <div class="cart-ctl" data-cart>.
       onChange(id, qty) — вызывается после каждого изменения (например, чтобы пересчитать итог). */
    cartControls(root, onChange) {
      const store = this;
      const MAX_ALL = 10;
      const minus = '<svg viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M0 5h10" stroke="currentColor" stroke-width="2"/></svg>';
      const plus = '<svg viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M0 5h10M5 0v10" stroke="currentColor" stroke-width="2"/></svg>';

      root.querySelectorAll('[data-cart]').forEach((ctl) => {
        const card = ctl.closest('[data-item]');
        const id = card.dataset.item;
        const MAX = Number(card.dataset.max) || MAX_ALL;   // у доставки — 2 (туда и обратно)
        const info = { title: card.dataset.title, label: card.dataset.label || '', note: card.dataset.note || '' };
        ctl.innerHTML = `<button class="cart-add" type="button">${t('В корзину')}</button>
          <div class="cart-qty" role="group" aria-label="${t(info.title)}: ${t('количество')}">
            <button class="cart-qty__btn" type="button" data-dec aria-label="${t('Убрать одну')}">${minus}</button>
            <span class="cart-qty__val" aria-live="polite"></span>
            <button class="cart-qty__btn" type="button" data-inc aria-label="${t('Добавить еще')}">${plus}</button>
          </div>`;
        const add = ctl.querySelector('.cart-add');
        const val = ctl.querySelector('.cart-qty__val');
        const inc = ctl.querySelector('[data-inc]');

        const render = (qty, bump) => {
          ctl.classList.toggle('has-qty', qty > 0);
          card.classList.toggle('is-in-cart', qty > 0);
          val.textContent = qty;
          inc.disabled = qty >= MAX;
          if (bump) { val.classList.remove('is-bump'); void val.offsetWidth; val.classList.add('is-bump'); }
        };
        const set = (qty) => {
          store.setQty(id, qty, info);
          render(qty, qty > 0);
          if (onChange) onChange(id, qty);
          return qty;
        };

        add.addEventListener('click', () => { set(1); inc.focus({ preventScroll: true }); });
        inc.addEventListener('click', () => set(Math.min(MAX, store.qty(id) + 1)));
        ctl.querySelector('[data-dec]').addEventListener('click', () => {
          if (set(store.qty(id) - 1) === 0) add.focus({ preventScroll: true });
        });

        if (store.qty(id)) store.setQty(id, store.qty(id), info); // цена и подписи — как на странице сейчас
        render(store.qty(id), false);
      });
    },
  };
}());
