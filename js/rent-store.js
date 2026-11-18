/* =========================================================
   Tian Way — «корзина» аренды: общая для страниц аренды
   (каталог rent.html → «Соберите автодом под себя» → итоговая страница).
   Хранится в браузере посетителя (localStorage), на сервер пока ничего не уходит.
   Состав: { from, to, guests, promo, car: { id, name, price }, items: { id: { title, price, qty } } }
   ========================================================= */
window.RentStore = (function () {
  const KEY = 'tw-rent-usd'; // новый ключ: прежние корзины хранили цены в рублях
  const read = () => {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  };
  const write = (s) => {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* приватный режим — просто не запоминаем */ }
  };
  const pad = (n) => String(n).padStart(2, '0');
  // даты храним строкой «2026-11-12» — без часовых поясов
  const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromKey = (k) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(k || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  };

  return {
    get: read,
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
    setQty(id, qty, info) {
      return this.update((s) => {
        s.items = s.items || {};
        if (qty > 0) s.items[id] = { ...(s.items[id] || {}), ...(info || {}), qty };
        else delete s.items[id];
      });
    },
    // 1 250 $ — цены аренды в долларах; пробел между тысячами неразрывный
    money: (n) => `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} $`,

    plural(n, one, few, many) {
      const m10 = n % 10; const m100 = n % 100;
      if (m10 === 1 && m100 !== 11) return one;
      if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
      return many;
    },

    /* Сводка бронирования — одна на все страницы, чтобы итог везде совпадал.
       Все посуточно: автодом — цена за сутки × ночи; снаряжение и услуги — цена за сутки × количество × ночи
       (без дат — за одни сутки). Вещи без цены (price 0, «Цена уточняется») в сумму не входят. */
    summary() {
      const s = read();
      const dates = this.dates();
      const nights = dates ? Math.round((dates.to - dates.from) / 86400000) : 0;
      const g = /^(\d+)\s*(.*)$/.exec(s.guests || '');
      const car = s.car ? { ...s.car, sum: s.car.price * (nights || 1) } : null;
      const items = Object.entries(s.items || {}).map(([id, it]) => ({ id, ...it, sum: it.price * it.qty * (nights || 1) }));
      const total = (car ? car.sum : 0) + items.reduce((a, it) => a + it.sum, 0);
      return {
        dates, nights, car, items, total, promo: s.promo || '',
        guests: { n: g ? g[1] : '—', word: g ? g[2] : 'гостей', text: s.guests || '' },
        missing: !s.car ? 'автодом' : !dates ? 'даты поездки' : !g ? 'количество гостей' : '',
      };
    },

    /* «21» и «Декабря, пн» — как в макете */
    dayParts(d) {
      const M = ['Января', 'Февраля', 'Марта', 'Апреля', 'Мая', 'Июня', 'Июля', 'Августа', 'Сентября', 'Октября', 'Ноября', 'Декабря'];
      const W = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
      return { day: d.getDate(), rest: `${M[d.getMonth()]}, ${W[d.getDay()]}` };
    },

    /* подсказка к сумме строки: «2 $ × 2 шт. × 5 суток» */
    sumHint(it, nights) {
      if (!it.price) return 'цену уточнит менеджер';
      return `${this.money(it.price)} × ${it.qty} шт. × ${nights ? `${nights} ${this.plural(nights, 'сутки', 'суток', 'суток')}` : '1 сутки (даты не выбраны)'}`;
    },

    esc: (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),

    /* Кнопки «В корзину» → счетчик «− 1 +» внутри root.
       Разметка: карточка с data-item, data-title, data-price и пустой <div class="cart-ctl" data-cart>.
       onChange(id, qty) — вызывается после каждого изменения (например, чтобы пересчитать итог). */
    cartControls(root, onChange) {
      const store = this;
      const MAX = 10;
      const minus = '<svg viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M0 5h10" stroke="currentColor" stroke-width="2"/></svg>';
      const plus = '<svg viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M0 5h10M5 0v10" stroke="currentColor" stroke-width="2"/></svg>';

      root.querySelectorAll('[data-cart]').forEach((ctl) => {
        const card = ctl.closest('[data-item]');
        const id = card.dataset.item;
        const info = { title: card.dataset.title, price: Number(card.dataset.price) };
        ctl.innerHTML = `<button class="cart-add" type="button">В корзину</button>
          <div class="cart-qty" role="group" aria-label="${info.title}: количество">
            <button class="cart-qty__btn" type="button" data-dec aria-label="Убрать одну">${minus}</button>
            <span class="cart-qty__val" aria-live="polite"></span>
            <button class="cart-qty__btn" type="button" data-inc aria-label="Добавить еще">${plus}</button>
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

        render(store.qty(id), false);
      });
    },
  };
}());
