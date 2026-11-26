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

/* ---------- 2. Форма заявки — общая логика leadForm (js/main.js) ---------- */
(function fishForm() {
  const form = document.querySelector('[data-fish-form]');
  if (!form) return;
  leadForm({
    form,
    error: form.querySelector('[data-fish-error]'),
    done: document.querySelector('[data-fish-done]'),
    again: document.querySelector('[data-fish-again]'),
    fields: { name: form.elements.name, contact: form.elements.contact },
    dates: { btn: form.querySelector('[data-fish-dates]'), value: form.querySelector('[data-fish-dates-value]'), cal: form.querySelector('[data-calendar]') },
    kind: 'fishing',
    title: 'Рыбалка и охота',
    lead: () => ({
      name: form.elements.name.value.trim(),
      contact: form.elements.contact.value.trim(),
      info: {
        'Что интересует': form.elements.what.value,
        'Сколько человек': form.elements.people.value,
        'Даты': form.elements.dates.value || 'не выбраны',
      },
    }),
  });
})();
