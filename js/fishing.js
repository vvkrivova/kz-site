/* =========================================================
   Tian Way — скрипты страницы «Рыбалка и охота» (fishing.html)
   Общее (масштаб, появление при прокрутке, плавная прокрутка к #request,
   выпадающие списки, календарь rangeCalendar) — в js/main.js.
   ========================================================= */

/* ---------- 1. Карточки «Рыбалка» / «Охота» ----------
   Клик: страница плавно едет к форме (это делает main.js — ссылка ведет на #request),
   а в «Что вас интересует?» сразу выбирается тема карточки и поле коротко подсвечивается. */
(function pickFromCards() {
  const dd = document.querySelector('.fish-form [data-dd]');
  if (!dd) return;
  document.querySelectorAll('[data-pick]').forEach((card) => card.addEventListener('click', () => {
    const opt = [...dd.querySelectorAll('[role="option"]')].find((o) => o.textContent.trim() === card.dataset.pick);
    if (opt) opt.click();
    dd.classList.remove('is-flash');
    void dd.offsetWidth; // перезапуск подсветки, если кликнули второй раз
    dd.classList.add('is-flash');
  }));
})();

/* ---------- 2. Форма заявки ----------
   Пока без реальной отправки: проверяем имя, контакты и согласие, показываем благодарность. */
(function fishForm() {
  const form = document.querySelector('[data-fish-form]');
  if (!form) return;
  const errorEl = form.querySelector('[data-fish-error]');
  const done = document.querySelector('[data-fish-done]');
  const fields = { name: form.elements.name, contact: form.elements.contact };

  // --- даты: общий календарь
  const datesBtn = form.querySelector('[data-fish-dates]');
  const datesValue = form.querySelector('[data-fish-dates-value]');
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
      const days = Math.round((to - from) / 86400000) + 1;
      const text = `${fmt(from)} – ${fmt(to)}`;
      datesValue.textContent = `${text} · ${days} ${daysWord(days)}`;
      datesBtn.classList.add('is-filled');
      form.elements.dates.value = text;
    },
  });
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
    console.info('Заявка «Рыбалка и охота» (отправка еще не подключена):', {
      what: form.elements.what.value,
      people: form.elements.people.value,
      dates: form.elements.dates.value || 'не выбраны',
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
  document.querySelector('[data-fish-again]').addEventListener('click', () => {
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
