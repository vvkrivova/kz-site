/* =========================================================
   Tian Way — скрипты страницы «Готовые путешествия» (trips.html)
   Общее (масштаб, появление при прокрутке, плавная прокрутка к блокам,
   выпадающие списки, календарь rangeCalendar) — в js/main.js.
   ========================================================= */

/* ---------- 1. Лента путешествий: стрелки и вкладки сезонов ----------
   Видно три карточки целиком, четвертая выглядывает справа (как в макете).
   Стрелки сдвигают ленту на одну карточку. Вкладка сезона оставляет только
   подходящие карточки: старые плавно уходят, новые по очереди выплывают. */
(function tripsCards() {
  const track = document.querySelector('[data-cards-track]');
  if (!track) return;
  const STEP = 404;    // ширина карточки 372 + промежуток 32 (из макета)
  const VISIBLE = 3;   // столько карточек помещается целиком
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
})();

/* ---------- 2. Форма «Соберем путешествие под вас» ----------
   Пока без реальной отправки: проверяем имя, контакты и согласие, показываем благодарность. */
(function customTripForm() {
  const form = document.querySelector('[data-tp-form]');
  if (!form) return;
  const errorEl = form.querySelector('[data-tp-error]');
  const done = document.querySelector('[data-tp-done]');
  const fields = { name: form.elements.name, contact: form.elements.contact };

  // --- даты: общий календарь с главной страницы
  const datesBtn = form.querySelector('[data-tp-dates]');
  const datesValue = form.querySelector('[data-tp-dates-value]');
  const DATES_PLACEHOLDER = datesValue.textContent;
  const cal = form.querySelector('[data-calendar]');
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (d) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
  const daysWord = (n) => {
    const m10 = n % 10; const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'день';
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'дня';
    return 'дней';
  };
  const calendar = rangeCalendar(cal, {
    toggle: datesBtn,
    onApply(from, to) {
      const days = Math.round((to - from) / 86400000) + 1; // включая день выезда
      const text = `${fmt(from)} – ${fmt(to)}`;
      datesValue.textContent = `${text} · ${days} ${daysWord(days)}`;
      datesBtn.classList.add('is-filled');
      form.elements.dates.value = text;
    },
  });
  // стрелка у поля дат переворачивается, пока календарь открыт
  new MutationObserver(() => {
    datesBtn.setAttribute('aria-expanded', String(!cal.hidden && cal.classList.contains('is-open')));
  }).observe(cal, { attributes: true, attributeFilter: ['class', 'hidden'] });

  // --- проверка
  const clearErrors = () => {
    errorEl.hidden = true;
    Object.values(fields).forEach((f) => f.classList.remove('is-invalid'));
  };
  Object.values(fields).forEach((f) => f.addEventListener('input', clearErrors));
  form.elements.consent.addEventListener('change', () => { errorEl.hidden = true; });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearErrors();
    const noName = !fields.name.value.trim();
    const noContact = !fields.contact.value.trim();
    if (noName || noContact) {
      errorEl.textContent = noName && noContact ? 'Укажите имя и контакты, чтобы мы могли связаться с вами.'
        : noName ? 'Укажите имя, чтобы мы знали, как к вам обращаться.'
          : 'Укажите телефон или Telegram, чтобы мы могли связаться с вами.';
      errorEl.hidden = false;
      if (noName) fields.name.classList.add('is-invalid');
      if (noContact) fields.contact.classList.add('is-invalid');
      (noName ? fields.name : fields.contact).focus({ preventScroll: true });
      return;
    }
    if (!form.elements.consent.checked) {
      errorEl.textContent = 'Нужно согласие на обработку персональных данных.';
      errorEl.hidden = false;
      return;
    }

    // данные заявки — пригодятся, когда подключим отправку на почту / в Telegram
    console.info('Заявка «Собрать путешествие» (отправка еще не подключена):', {
      where: form.elements.where.value,
      people: form.elements.people.value,
      dates: form.elements.dates.value || 'не выбраны',
      wishes: form.elements.wishes.value.trim(),
      name: fields.name.value.trim(),
      contact: fields.contact.value.trim(),
    });

    calendar.close();
    form.classList.add('is-hiding');
    setTimeout(() => {
      form.hidden = true;
      form.classList.remove('is-hiding');
      done.hidden = false;
      done.classList.add('is-showing');
    }, 300);
  });

  // --- «Отправить еще одну»: благодарность уходит вверх, поля формы по очереди выплывают
  [...form.children].forEach((el, i) => el.style.setProperty('--si', i));
  let againTimer;
  document.querySelector('[data-tp-again]').addEventListener('click', () => {
    clearTimeout(againTimer);
    done.classList.remove('is-showing');
    done.classList.add('is-hiding');
    againTimer = setTimeout(() => {
      done.hidden = true;
      done.classList.remove('is-hiding');
      form.reset();
      clearErrors();
      calendar.reset();
      form.elements.dates.value = ''; // скрытое поле reset() не очищает
      datesValue.textContent = DATES_PLACEHOLDER;
      datesBtn.classList.remove('is-filled');
      form.hidden = false;
      form.classList.add('is-showing');
      againTimer = setTimeout(() => form.classList.remove('is-showing'), 1300);
    }, 300);
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
