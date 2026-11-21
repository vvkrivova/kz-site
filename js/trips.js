/* =========================================================
   Tian Way — скрипты страницы «Готовые путешествия» (trips.html)
   Общее (масштаб, появление при прокрутке, плавная прокрутка к блокам,
   выпадающие списки, календарь rangeCalendar) — в js/main.js.
   ========================================================= */

/* ---------- 1. Лента путешествий: стрелки и вкладки сезонов ----------
   На компьютере видно три карточки целиком, четвертая выглядывает справа; на телефоне — одна (как в макетах).
   Шаг ленты и число видимых карточек — из CSS (--cards-step, --cards-visible у .tp-cards).
   Стрелки сдвигают ленту на одну карточку. Вкладка сезона оставляет только
   подходящие карточки: старые плавно уходят, новые по очереди выплывают. */
(function tripsCards() {
  const track = document.querySelector('[data-cards-track]');
  if (!track) return;
  const box = track.closest('.tp-cards');
  const cssNum = (name, fallback) => parseFloat(getComputedStyle(box).getPropertyValue(name)) || fallback;
  const FADE_MS = 350; // = transition opacity у .tcard
  const cards = [...track.querySelectorAll('.tcard')];
  const prev = document.querySelector('[data-cards-prev]');
  const next = document.querySelector('[data-cards-next]');
  const tabs = [...document.querySelectorAll('[data-season-tab]')];
  let shown = cards.slice();
  let index = 0;
  let busy = null;
  let showTimers = []; // таймеры «по очереди выплывают» — отменяем при быстром переключении вкладок

  // раскладываем видимые карточки слева направо; instant — без анимации сдвига
  function layout(instant) {
    const STEP = cssNum('--cards-step', 404);     // ширина карточки + промежуток
    const VISIBLE = cssNum('--cards-visible', 3); // столько карточек помещается целиком
    shown.forEach((c, i) => {
      if (instant) c.style.transition = 'none';
      c.style.left = `${i * STEP}px`;
      if (instant) { void c.offsetWidth; c.style.transition = ''; }
    });
    const max = Math.max(0, shown.length - VISIBLE);
    index = Math.min(index, max);
    track.style.translate = `${-index * STEP}px 0`;
    prev.hidden = index === 0;
    next.hidden = index >= max;
  }

  prev.addEventListener('click', () => { index -= 1; layout(); });
  next.addEventListener('click', () => { index += 1; layout(); });

  tabs.forEach((tab) => tab.addEventListener('click', () => {
    if (tab.classList.contains('is-active')) return;
    tabs.forEach((t) => {
      const on = t === tab;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', String(on));
    });
    const season = tab.dataset.seasonTab;
    const nextShown = cards.filter((c) => c.dataset.seasons.split(' ').includes(season));

    clearTimeout(busy);
    showTimers.forEach(clearTimeout);
    showTimers = [];
    cards.forEach((c) => c.classList.add('is-out'));            // все плавно уходят
    busy = setTimeout(() => {
      cards.forEach((c) => { c.hidden = !nextShown.includes(c); });
      shown = nextShown;
      index = 0;
      layout(true);                                              // новые места — без «езды»
      showTimers = shown.map((c, i) => setTimeout(() => c.classList.remove('is-out'), 60 + i * 90)); // по очереди выплывают
    }, FADE_MS);
  }));

  layout(true);
  // телефон ↔ компьютер (поворот экрана, изменение окна): другой шаг ленты — переставляем без анимации
  window.matchMedia('(max-width: 767px)').addEventListener('change', () => layout(true));
})();

/* ---------- 2. Форма «Соберем путешествие под вас» — общая логика leadForm (js/main.js) ---------- */
(function customTripForm() {
  const form = document.querySelector('[data-tp-form]');
  if (!form) return;
  leadForm({
    form,
    error: form.querySelector('[data-tp-error]'),
    done: document.querySelector('[data-tp-done]'),
    again: document.querySelector('[data-tp-again]'),
    fields: { name: form.elements.name, contact: form.elements.contact },
    dates: { btn: form.querySelector('[data-tp-dates]'), value: form.querySelector('[data-tp-dates-value]'), cal: form.querySelector('[data-calendar]') },
    title: 'Заявка «Собрать путешествие»',
    data: () => ({
      where: form.elements.where.value,
      people: form.elements.people.value,
      dates: form.elements.dates.value || 'не выбраны',
      wishes: form.elements.wishes.value.trim(),
      name: form.elements.name.value.trim(),
      contact: form.elements.contact.value.trim(),
    }),
  });
})();

/* ---------- 3. Переход со страницы тура: trips.html?trip=ring#custom ----------
   В форме сразу выбрано нужное путешествие в «Куда хочется?». */
(function preselectTrip() {
  const TRIPS = { north: 'Северный берег', karakol: 'Зимний Каракол', ring: 'Большое кольцо', newyear: 'Новый год' };
  const name = TRIPS[new URLSearchParams(location.search).get('trip')];
  if (!name) return;
  const opt = [...document.querySelectorAll('.tp-form [data-dd] [role="option"]')]
    .find((o) => o.textContent.trim() === name);
  if (!opt) return;
  opt.click(); // выпадающий список сам запишет значение в форму
  opt.closest('[data-dd]').querySelector('button').blur(); // без рамки фокуса при открытии страницы
})();
