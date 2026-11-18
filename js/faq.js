/* =========================================================
   Tian Way — скрипты страницы «Вопросы и ответы» (faq.html)
   Общее (масштаб страницы, переход в начало при обновлении) — в js/main.js.
   ========================================================= */

/* появление при прокрутке [data-reveal] и выпадающие списки [data-dd] — общие, в js/main.js */

/* ---------- 1.1. Переход по ссылке …#ask — плашка с формой ровно по центру экрана ----------
   Браузер сам прокручивает к якорю так, что плашка упирается в верх окна.
   Поэтому после загрузки докручиваем сами: середина плашки = середина окна.
   Если окно ниже плашки — просто ставим ее верх с небольшим отступом. */
(function centerAskOnHash() {
  const panel = document.getElementById('ask');
  // при возврате «Назад» страница встает туда, где была (js/main.js) — центрировать не нужно
  if (!panel || document.documentElement.classList.contains('nav-back')) return;
  // положение берем из разметки, а не из getBoundingClientRect: в момент перехода
  // плашка как раз «выплывает» (анимация сдвигает ее), и замер был бы неточным
  const page = document.querySelector('.page');
  const panelBox = () => {
    let y = 0;
    for (let el = panel; el && el !== page; el = el.offsetParent) y += el.offsetTop;
    const scale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--page-scale')) || 1;
    // плашка уменьшена свойством scale (css/faq.css, «больше воздуха») — берем ее видимый размер
    const cs = getComputedStyle(panel);
    const own = parseFloat(cs.scale) || 1;
    const oy = parseFloat(cs.transformOrigin.split(' ')[1]) || 0;
    const h = panel.offsetHeight;
    return { top: (y + oy * (1 - own)) * scale, height: h * own * scale };
  };
  const center = () => {
    if (location.hash !== '#ask') return;
    const r = panelBox();
    const gap = Math.max((window.innerHeight - r.height) / 2, 16);
    const target = Math.max(0, r.top - gap);
    // плашка стоит у самого низа страницы (подвала пока нет) — без запаса снизу
    // браузер упрется в конец страницы и не сможет поставить ее по центру
    const need = Math.ceil(target + window.innerHeight);
    if (document.body.offsetHeight < need) document.body.style.height = `${need}px`;
    window.scrollTo({ top: target, behavior: 'instant' });
  };
  // после load: к этому моменту main.js уже выставил масштаб и высоту страницы
  // браузер после загрузки еще раз «доводит» страницу до якоря — поэтому центрируем
  // сразу и повторяем чуть позже, чтобы последнее слово было за нами
  window.addEventListener('load', () => {
    requestAnimationFrame(center);
    setTimeout(center, 150);
  });
  window.addEventListener('hashchange', center);
})();

/* ---------- 2. Форма «Не нашли ответ?» ----------
   Пока без реальной отправки: проверяем поля и показываем благодарность. */
(function askForm() {
  const form = document.querySelector('[data-ask-form]');
  if (!form) return;
  const errorEl = form.querySelector('[data-ask-error]');
  const done = document.querySelector('[data-ask-done]');
  const fields = { question: form.elements.question, name: form.elements.name, contact: form.elements.contact };
  const LABELS = { question: 'вопрос', name: 'имя', contact: 'контакты' };

  const clearErrors = () => {
    errorEl.hidden = true;
    Object.values(fields).forEach((f) => f.classList.remove('is-invalid'));
  };
  Object.values(fields).forEach((f) => f.addEventListener('input', clearErrors));
  form.elements.consent.addEventListener('change', () => { errorEl.hidden = true; });

  // «вопрос, имя и контакты»
  const humanJoin = (list) => (list.length > 1 ? `${list.slice(0, -1).join(', ')} и ${list[list.length - 1]}` : list[0]);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearErrors();
    const missing = Object.keys(fields).filter((k) => !fields[k].value.trim());
    if (missing.length) {
      errorEl.textContent = `Укажите ${humanJoin(missing.map((k) => LABELS[k]))}, чтобы мы могли ответить.`;
      errorEl.hidden = false;
      missing.forEach((k) => fields[k].classList.add('is-invalid'));
      fields[missing[0]].focus({ preventScroll: true });
      return;
    }
    if (!form.elements.consent.checked) {
      errorEl.textContent = 'Нужно согласие на обработку персональных данных.';
      errorEl.hidden = false;
      return;
    }

    // данные вопроса — пригодятся, когда подключим отправку на почту / в Telegram
    console.info('Вопрос с сайта (отправка еще не подключена):', {
      topic: form.elements.topic.value,
      question: fields.question.value.trim(),
      name: fields.name.value.trim(),
      contact: fields.contact.value.trim(),
    });

    // форма плавно уходит, на ее месте появляется благодарность
    form.classList.add('is-hiding');
    setTimeout(() => {
      form.hidden = true;
      form.classList.remove('is-hiding');
      done.hidden = false;
      done.classList.add('is-showing');
    }, 300);
  });

  // порядок, в котором поля формы выплывают при возвращении (сверху вниз)
  [...form.children].forEach((el, i) => el.style.setProperty('--si', i));

  // «Задать еще вопрос»: благодарность плавно уходит вверх,
  // поля формы по очереди выплывают снизу — зеркально отправке
  let againTimer;
  document.querySelector('[data-ask-again]').addEventListener('click', () => {
    clearTimeout(againTimer);
    done.classList.remove('is-showing');
    done.classList.add('is-hiding');
    againTimer = setTimeout(() => {
      done.hidden = true;
      done.classList.remove('is-hiding');
      form.reset();
      clearErrors();
      form.hidden = false;
      form.classList.add('is-showing');
      fields.question.focus({ preventScroll: true });
      // снимаем класс после анимации, чтобы ее можно было повторить в следующий раз
      againTimer = setTimeout(() => form.classList.remove('is-showing'), 1200);
    }, 300);
  });
})();
