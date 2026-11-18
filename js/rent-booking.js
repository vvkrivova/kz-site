/* =========================================================
   Tian Way — скрипты итоговой страницы бронирования (rent-booking.html)
   Общее (масштаб, появление) — js/main.js; «корзина» аренды и расчет итога — js/rent-store.js.
   ========================================================= */

/* ---------- 1. Сводка «Ваше бронирование» ---------- */
const rbSummary = (function () {
  const box = document.querySelector('[data-summary]');
  if (!box) return null;
  const $ = (q) => box.querySelector(q);
  const showDate = (el, d) => {
    el.classList.toggle('is-empty', !d);
    if (!d) { el.innerHTML = '<b>—</b>дата не выбрана'; return; }
    const p = RentStore.dayParts(d);
    el.innerHTML = `<b>${p.day}</b>${p.rest}`;
  };

  function render() {
    const sm = RentStore.summary();
    const { esc, money, plural } = RentStore;
    showDate($('[data-s-from]'), sm.dates && sm.dates.from);
    showDate($('[data-s-to]'), sm.dates && sm.dates.to);
    $('[data-s-guests]').textContent = sm.guests.n;
    $('[data-s-guests-word]').textContent = sm.guests.word;
    $('[data-s-nights]').textContent = sm.nights || '—';
    $('[data-s-nights-word]').textContent = sm.nights ? plural(sm.nights, 'ночь', 'ночи', 'ночей') : 'ночей';

    const sum = $('[data-s-car-sum]');
    $('[data-s-car-row]').classList.toggle('is-empty', !sm.car);
    if (sm.car) {
      $('[data-s-car]').innerHTML = `Автодом <b>${esc(sm.car.name)}</b>`;
      sum.textContent = money(sm.car.sum);
      sum.title = sm.nights ? `${money(sm.car.price)} × ${sm.nights} ${plural(sm.nights, 'сутки', 'суток', 'суток')}` : 'цена за сутки';
    } else {
      $('[data-s-car]').innerHTML = 'Автодом не&nbsp;выбран';
      sum.innerHTML = '<a href="rent.html#cars">Выбрать</a>';
    }

    $('[data-s-rows]').innerHTML = sm.items.map((it) => `<li><span>${esc(it.title)}</span><span>${it.qty}x</span><b${it.price ? '' : ' class="is-ask"'} title="${RentStore.sumHint(it, sm.nights)}">${it.price ? money(it.sum) : '<span>уточняется</span>'}</b></li>`).join('')
      || '<li class="is-empty">Дополнительные услуги не выбраны — <a href="rent-extras.html">добавить</a></li>';
    $('[data-s-total]').textContent = money(sm.total);
    return sm;
  }

  render();
  window.addEventListener('storage', (e) => { if (e.key === 'tw-rent-usd') render(); });
  return { render };
}());

/* ---------- 2. Форма «Заказчик» ----------
   Пока без реальной отправки: проверяем поля и согласие, показываем благодарность. */
(function clientForm() {
  const form = document.querySelector('[data-rb-form]');
  if (!form) return;
  const errorEl = form.querySelector('[data-rb-error]');
  const done = document.querySelector('[data-rb-done]');
  const f = form.elements;

  // подсказка «что не так» — прямо под полем (у согласия — под его текстом)
  const hints = new Map();
  const hintFor = (el) => {
    if (!hints.has(el)) {
      const h = document.createElement('p');
      h.className = 'rb-hint';
      h.id = `rb-hint-${el.name}`;
      h.setAttribute('role', 'alert');
      const anchor = el === f.consent ? el.closest('label') : el;
      h.style.left = `${anchor.offsetLeft + (el === f.consent ? 45 : 0)}px`;
      h.style.top = `${anchor.offsetTop + anchor.offsetHeight + 4}px`;
      form.append(h);
      hints.set(el, h);
    }
    return hints.get(el);
  };
  const setError = (el, msg) => {
    const h = hintFor(el);
    h.textContent = msg;
    h.hidden = false;
    el.classList.add('is-invalid');
    el.setAttribute('aria-invalid', 'true');
    el.setAttribute('aria-describedby', h.id);
  };
  const clearError = (el) => {
    if (hints.has(el)) hints.get(el).hidden = true;
    el.classList.remove('is-invalid');
    el.removeAttribute('aria-invalid');
  };
  [f.name, f.surname, f.phone, f.email].forEach((el) => el.addEventListener('input', () => clearError(el)));
  f.consent.addEventListener('change', () => clearError(f.consent));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    // не выбран автодом или даты — это не поле формы, поэтому сообщение рядом с кнопкой
    const sm = RentStore.summary();
    if (sm.missing) {
      errorEl.innerHTML = `${{ 'автодом': 'Не выбран автодом', 'даты поездки': 'Не выбраны даты поездки', 'количество гостей': 'Не выбрано количество гостей' }[sm.missing]} — <a href="rent.html">вернуться к выбору</a>`;
      errorEl.hidden = false;
      return;
    }

    // проверяем все поля сразу и подписываем каждое, что не так
    const bad = [];
    const check = (el, msg) => { if (msg) { setError(el, msg); bad.push(el); } else clearError(el); };
    const phoneDigits = f.phone.value.replace(/\D/g, '').length;
    const isTelegram = /\p{L}/u.test(f.phone.value);   // есть буквы — это ник или ссылка Telegram, цифры не считаем
    const email = f.email.value.trim();
    // обязательны все поля, кроме «Примечаний»
    check(f.name, f.name.value.trim() ? '' : 'Укажите имя');
    check(f.surname, f.surname.value.trim() ? '' : 'Укажите фамилию');
    check(f.phone, !f.phone.value.trim() ? 'Укажите телефон или Telegram' : !isTelegram && phoneDigits < 10 ? 'В номере не хватает цифр' : '');
    check(f.email, !email ? 'Укажите e-mail' : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? 'Проверьте e-mail — в адресе ошибка' : '');
    check(f.consent, f.consent.checked ? '' : 'Нужно согласие на обработку персональных данных');
    if (bad.length) { bad[0].focus({ preventScroll: true }); return; }

    // данные заявки — пригодятся, когда подключим отправку на почту / в Telegram
    console.info('Бронирование автодома (отправка еще не подключена):', {
      car: sm.car && sm.car.name,
      from: sm.dates && RentStore.toKey(sm.dates.from),
      to: sm.dates && RentStore.toKey(sm.dates.to),
      nights: sm.nights,
      guests: sm.guests.text,
      promo: sm.promo,
      items: sm.items.map((it) => `${it.title} × ${it.qty}`),
      total: sm.total,
      name: f.name.value.trim(),
      surname: f.surname.value.trim(),
      phone: f.phone.value.trim(),
      email: f.email.value.trim(),
      notes: f.notes.value.trim(),
    });

    form.classList.add('is-hiding');
    setTimeout(() => {
      form.hidden = true;
      form.classList.remove('is-hiding');
      done.hidden = false;
      done.classList.add('is-showing');
    }, 300);
  });
})();
