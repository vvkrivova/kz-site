/* =========================================================
   Tian Way — скрипты итоговой страницы бронирования (rent-booking.html)
   Общее (масштаб, появление) — js/main.js; «корзина» аренды и расчет итога — js/rent-store.js.
   ========================================================= */

/* ---------- 1. Сводка «Ваше бронирование» ---------- */
Money.approxSign = true;   // на последнем шаге доллары и рубли — со знаком «≈»: точная сумма — в сомах
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
      // у автодома без цены — «уточняется», как у снаряжения без цены; ставка за сутки — по сроку аренды
      sum.textContent = sm.car.price ? money(sm.car.sum) : t('уточняется');
      sum.title = !sm.car.price ? t('цену уточнит менеджер')
        : sm.nights ? `${money(sm.car.price)} × ${sm.nights} ${plural(sm.nights, 'сутки', 'суток', 'суток')}` : t('цена за сутки');
    } else {
      $('[data-s-car]').innerHTML = t('Автодом не&nbsp;выбран');
      sum.innerHTML = t('<a href="rent#cars">Выбрать</a>');
    }

    $('[data-s-rows]').innerHTML = sm.items.map((it) => `<li><span>${esc(t(it.title))}${it.where ? ` · ${esc(t(it.where === 'airport' ? 'аэропорт' : 'по Бишкеку'))}` : ''}</span><span>${it.qty}x</span><b${it.sum ? '' : ' class="is-ask"'} title="${esc(RentStore.sumHint(it, sm.nights))}">${RentStore.rowSum(it)}</b></li>`).join('')
      || t('<li class="is-empty">Дополнительные услуги не выбраны — <a href="rent-extras">добавить</a></li>');
    $('[data-s-total]').textContent = RentStore.totalText(sm);
    renderMoney(sm);
    return sm;
  }

  /* деньги (ТЗ № 1): главная сумма — в выбранной валюте, рядом точная сумма в сомах (ее и нужно будет оплатить);
     предоплата, остаток и залог — в сомах, справочно в выбранной валюте; курс и его дата — НБКР */
  function renderMoney(sm) {
    const approx = (n) => (Money.approx(n) ? ` <small>(${Money.approx(n)})</small>` : '');
    const known = !(sm.car && !sm.car.price) && sm.total > 0;   // сумма известна (у автодома есть цена)
    const exact = $('[data-s-exact]');
    exact.hidden = !(known && Money.shown() !== 'KGS');
    if (!exact.hidden) exact.innerHTML = t('Сумма к расчету в сомах: {sum}', { sum: `<b>${Money.kgs(sm.total)}</b>` });
    $('[data-s-prepay-label]').textContent = t('Предоплата {p}% — после подтверждения', { p: sm.prepayPercent });
    $('[data-s-rest-label]').textContent = t('Остаток {p}%', { p: 100 - sm.prepayPercent });
    $('[data-s-prepay]').innerHTML = known ? `<b>${Money.kgs(sm.prepay)}</b>${approx(sm.prepay)}` : t('уточняется');
    $('[data-s-rest]').innerHTML = known ? `<b>${Money.kgs(sm.rest)}</b>${approx(sm.rest)}` : t('уточняется');
    $('[data-s-deposit]').innerHTML = sm.deposit ? `<b>${Money.kgs(sm.deposit)}</b>${approx(sm.deposit)}` : t('уточняется');

    // курс, по которому показаны доллары или рубли, и его дата
    const rate = $('[data-s-rate]');
    const cur = Money.shown();
    rate.hidden = cur === 'KGS';
    if (!rate.hidden) {
      const r = Money.rates;
      const [y, m, d] = r.date.split('-');
      const one = LANG === 'en' ? `${cur === 'USD' ? '$' : '₽'}1` : `1\u00a0${cur === 'USD' ? '$' : '₽'}`;
      const val = r[cur].toLocaleString(LANG === 'en' ? 'en-US' : 'ru-RU', { maximumFractionDigits: 4 });
      rate.textContent = t('Справочный курс НБКР на {date}: {rate}', {
        date: `${d}.${m}.${y}`, rate: `${one} = ${val}\u00a0${LANG === 'en' ? 'KGS' : 'сом'}`,
      });
    }

    // «Тариф»: ставка автодома по сроку (чем дольше аренда, тем дешевле сутки — ставка на все сутки)
    const tariff = document.querySelector('.rb-term .rb-term__text');
    const rates = sm.car && RentStore.prices.cars[sm.car.id];
    if (tariff) {
      if (!rates || !sm.car.price) { tariff.textContent = ''; return; }
      const tiers = RentStore.prices.tiers;
      const label = (i) => {
        if (i === tiers.length - 1) return t('от {n}', { n: tiers[i] });
        const lo = Math.max(tiers[i], sm.minNights); const hi = tiers[i + 1] - 1;
        return lo >= hi ? String(hi) : `${lo}\u2060–\u2060${hi}`;   // «7–13» не разрывается переносом
      };
      const days = sm.nights || 1;
      let cur2 = 0;
      tiers.forEach((from, i) => { if (days >= from) cur2 = i; });
      tariff.textContent = t('Ставка {name}: {rate} в сутки за срок {range} суток. Чем дольше аренда, тем ниже ставка — она действует на все сутки: {all}.', {
        name: sm.car.name, rate: `${Money.kgs(rates[cur2])}${Money.approx(rates[cur2]) ? ` (${Money.approx(rates[cur2])})` : ''}`, range: label(cur2),
        all: `${rates.map((v, i) => `${label(i)} — ${Money.kgs(v).replace(/\u00a0(сом|KGS)$/, '')}`).join('; ')} ${LANG === 'en' ? 'KGS' : 'сом'}`,
      });
    }
  }

  render();
  window.addEventListener('storage', (e) => { if (e.key === 'tw-rent-kgs') render(); });
  window.addEventListener('tw:money', render);   // смена валюты или курса
  return { render };
}());

/* ---------- 1.1. Условия («Тариф», «Гарантия бронирования», «Отмена бронирования») ----------
   Свернуты; нажатие на заголовок со стрелкой открывает и закрывает текст — и на компьютере, и на телефоне.
   Без текста — без стрелки (тексты гарантии и отмены пока не прислали). */
(function terms() {
  document.querySelectorAll('.rb-term').forEach((term, i) => {
    const h = term.querySelector('.rb-term__h');
    const text = term.querySelector('.rb-term__text');
    if (!h || !text) return;
    text.id = text.id || `rb-term-${i}`;
    const sync = () => {
      const on = text.textContent.trim() !== '';
      if (on) {
        h.setAttribute('role', 'button');
        h.tabIndex = 0;
        h.setAttribute('aria-controls', text.id);
        h.setAttribute('aria-expanded', String(term.classList.contains('is-open')));
      } else {
        ['role', 'tabindex', 'aria-controls', 'aria-expanded'].forEach((a) => h.removeAttribute(a));
      }
    };
    const toggle = () => {
      if (!text.textContent.trim()) return;
      term.classList.toggle('is-open');
      sync();
    };
    h.addEventListener('click', toggle);
    h.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    new MutationObserver(sync).observe(text, { childList: true, characterData: true, subtree: true });
    sync();
  });
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
  // место подсказки — под полем (у согласия — под его текстом); считаем каждый раз заново: у компьютера и телефона
  // поля стоят по-разному, а окно могли сузить или повернуть телефон (раньше место запоминалось один раз — и съезжало)
  const place = (el, h) => {
    const anchor = el === f.consent ? el.closest('label') : el;
    const text = el === f.consent ? anchor.querySelector('.trip-consent__text') : null;
    h.style.left = `${anchor.offsetLeft + (text ? text.offsetLeft : 0)}px`;
    // посередине промежутка под полем: на телефоне ряды полей через 22px, подсказка 11px — сверху 5px
    h.style.top = `${anchor.offsetTop + anchor.offsetHeight + (window.matchMedia('(max-width: 767px)').matches ? 5 : 4)}px`;
  };
  const hintFor = (el) => {
    if (!hints.has(el)) {
      const h = document.createElement('p');
      h.className = 'rb-hint';
      h.id = `rb-hint-${el.name}`;
      h.setAttribute('role', 'alert');
      form.append(h);
      hints.set(el, h);
    }
    const h = hints.get(el);
    place(el, h);
    return h;
  };
  const replace = () => hints.forEach((h, el) => { if (!h.hidden) place(el, h); });
  window.addEventListener('resize', replace);
  window.matchMedia('(max-width: 767px)').addEventListener('change', replace);
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
      const why = sm.missing === 'срок' ? t('Аренда — от {n} суток', { n: sm.minNights })
        : t({ 'автодом': 'Не выбран автодом', 'даты поездки': 'Не выбраны даты поездки', 'количество гостей': 'Не выбрано количество гостей' }[sm.missing]);
      errorEl.innerHTML = `${why} — <a href="rent">${t('вернуться к выбору')}</a>`;
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
      // что выбрано (без цен: сервер считает сам по data/rent.json) и валюта, в которой человек смотрел цены
      items: sm.items.map((it) => ({ id: it.id, qty: it.qty, variant: it.where || '' })),
      currency: Money.shown(),
      car: sm.car && sm.car.id,
      from: sm.dates ? RentStore.toKey(sm.dates.from) : '',
      to: sm.dates ? RentStore.toKey(sm.dates.to) : '',
      guests: parseInt(sm.guests.n, 10) || 0,
      extras: sm.items.map((it) => `${it.title} × ${it.qty}`).join('; '),
      info: {
        'Автодом': sm.car && sm.car.name,
        'Даты': sm.dates ? `${day(sm.dates.from)} — ${day(sm.dates.to)}` : '',
        'Ночей': sm.nights,
        'Гости': sm.guests.text,
        'Снаряжение и услуги': sm.items.map((it) => `${it.title} × ${it.qty}`).join('; ') || 'нет',
        'Итого на сайте': `${RentStore.totalText(sm, false).replace(/^≈\s*/, '≈ ')}${Money.shown() !== 'KGS' ? ` (${Money.kgs(sm.total)})` : ''}`,
        'Промокод': sm.promo,
        'Примечания': f.notes.value.trim(),
      },
    }, form);
    if (!sent.ok) {
      // даты машины заняли, пока человек оформлял бронь — просим выбрать другие (по ТЗ: повторная проверка на сервере)
      if (sent.reason === 'busy') {
        errorEl.innerHTML = `${t('Эти даты уже заняты — выберите другие')} — <a href="rent#cars">${t('вернуться к выбору')}</a>`;
      } else if (sent.reason === 'check') {
        errorEl.textContent = t('Не удалось проверить доступность. Попробуйте еще раз.');
      } else if (sent.reason === 'short') {
        errorEl.innerHTML = `${t('Аренда — от {n} суток', { n: sm.minNights })} — <a href="rent#cars">${t('вернуться к выбору')}</a>`;
      } else if (sent.reason === 'past') {
        errorEl.innerHTML = `${t('Дата заезда уже прошла — выберите другие даты')} — <a href="rent#cars">${t('вернуться к выбору')}</a>`;
      } else {
        errorEl.textContent = leadFailText();
      }
      errorEl.hidden = false;
      leadBusy(submitBtn, false);
      return;
    }

    // бронь принята: корзину очищаем (иначе обновление страницы позволило бы отправить ее еще раз,
    // а старое снаряжение со старыми ценами попало бы в следующую бронь); кнопка остается неактивной
    RentStore.update((s) => { ['car', 'from', 'to', 'guests', 'items', 'promo'].forEach((k) => delete s[k]); });
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
