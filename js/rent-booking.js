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
    if (!d) { el.innerHTML = t('<b>—</b>дата не выбрана'); return; }
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
    $('[data-s-nights-word]').textContent = sm.nights ? plural(sm.nights, 'ночь', 'ночи', 'ночей') : t('ночей');

    const sum = $('[data-s-car-sum]');
    $('[data-s-car-row]').classList.toggle('is-empty', !sm.car);
    if (sm.car) {
      $('[data-s-car]').innerHTML = t('Автодом <b>{name}</b>', { name: esc(sm.car.name) });
      // у автодома без цены (data-price="0") — «уточняется», как у снаряжения без цены
      sum.textContent = sm.car.price ? money(sm.car.sum) : t('уточняется');
      sum.title = !sm.car.price ? t('цену уточнит менеджер')
        : sm.nights ? `${money(sm.car.price)} × ${sm.nights} ${plural(sm.nights, 'сутки', 'суток', 'суток')}` : t('цена за сутки');
    } else {
      $('[data-s-car]').innerHTML = t('Автодом не&nbsp;выбран');
      sum.innerHTML = t('<a href="rent#cars">Выбрать</a>');
    }

    $('[data-s-rows]').innerHTML = sm.items.map((it) => `<li><span>${esc(t(it.title))}</span><span>${it.qty}x</span><b${it.price ? '' : ' class="is-ask"'} title="${esc(RentStore.sumHint(it, sm.nights))}">${RentStore.rowSum(it, sm.nights)}</b></li>`).join('')
      || t('<li class="is-empty">Дополнительные услуги не выбраны — <a href="rent-extras">добавить</a></li>');
    $('[data-s-total]').textContent = RentStore.totalText(sm);
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

  const submitBtn = form.querySelector('[type="submit"]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitBtn.disabled) return; // заявка уже отправляется
    errorEl.hidden = true;
    // не выбран автодом или даты — это не поле формы, поэтому сообщение рядом с кнопкой
    const sm = RentStore.summary();
    if (sm.missing) {
      errorEl.innerHTML = `${t({ 'автодом': 'Не выбран автодом', 'даты поездки': 'Не выбраны даты поездки', 'количество гостей': 'Не выбрано количество гостей' }[sm.missing])} — <a href="rent">${t('вернуться к выбору')}</a>`;
      errorEl.hidden = false;
      return;
    }

    // проверяем все поля сразу и подписываем каждое, что не так
    const bad = [];
    const check = (el, msg) => { if (msg) { setError(el, t(msg)); bad.push(el); } else clearError(el); };
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

    // заявка — в Битрикс24 (sendLead в js/main.js); не ушла — ошибка с телефоном у кнопки
    const day = (d) => d && d.toLocaleDateString('ru-RU');
    leadBusy(submitBtn, true);
    const sent = await sendLead({
      form: 'rent',
      title: `Бронирование: ${sm.car ? sm.car.name : 'автодом'}`,
      name: f.name.value.trim(),
      surname: f.surname.value.trim(),
      contact: f.phone.value.trim(),
      email: f.email.value.trim(),
      sum: sm.total,
      info: {
        'Автодом': sm.car && sm.car.name,
        'Даты': sm.dates ? `${day(sm.dates.from)} — ${day(sm.dates.to)}` : '',
        'Ночей': sm.nights,
        'Гости': sm.guests.text,
        'Снаряжение и услуги': sm.items.map((it) => `${it.title} × ${it.qty}`).join('; ') || 'нет',
        'Итого': RentStore.totalText(sm),
        'Промокод': sm.promo,
        'Примечания': f.notes.value.trim(),
      },
    });
    leadBusy(submitBtn, false);
    if (!sent) { errorEl.textContent = leadFailText(); errorEl.hidden = false; return; }

    showThanks();
  });

  /* ---------- переход к «Спасибо» ----------
     Вся страница превращается в экран «Спасибо» (как в макете): заголовок и обе карточки плавно растворяются
     (чуть вверх, с легким размытием — css/rent-booking.css), страница плавно уезжает наверх, затем появляется плашка.
     При «уменьшить движение» — сразу экран «Спасибо». */
  const section = document.querySelector('.rb');
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finish = () => {
    form.hidden = true;
    done.hidden = false;
    section.classList.remove('is-leaving');
    section.classList.add('is-done');
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const showThanks = () => {
    if (reduce) { finish(); return; }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    section.classList.add('is-leaving');
    setTimeout(finish, 600);
  };
})();
