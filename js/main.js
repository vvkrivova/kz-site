/* =========================================================
   Tian Way — ОБЩИЕ скрипты всех страниц
   Прокрутка при открытии, масштаб под ширину экрана, календарь дат rangeCalendar,
   плавная прокрутка по ссылкам, появление при прокрутке [data-reveal], выпадающие списки [data-dd].
   Главная — js/home.js (подключается после этого файла), остальные страницы — js/<страница>.js.
   ========================================================= */

/* ---------- Язык страницы и перевод надписей скриптов ----------
   Русская версия — главная; на английских страницах (папка en/) перед этим файлом подключен
   data/i18n/en-scripts.js — словарь window.TW_I18N «русский → английский» (из data/i18n/en-scripts.json).
   t('текст') — перевод (или сам текст, если перевода нет); t('Занят {when}', { when }) — с подстановкой.
   plural(n, 'ночь', 'ночи', 'ночей') — слово для числа: по-русски три формы, по-английски одна/много. */
const LANG = document.documentElement.lang === 'en' ? 'en' : 'ru';
// английские страницы лежат в папке en/ — картинки, которые подставляют скрипты, ищем уровнем выше
const SITE_ROOT = LANG === 'en' ? '../' : '';
function t(text, vars) {
  let r = (window.TW_I18N && window.TW_I18N[text]) || text;
  if (vars) r = r.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  return r;
}
function plural(n, one, few, many) {
  if (LANG === 'en') return t(n === 1 ? one : many);
  const m10 = n % 10; const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/* ---------- Отправка заявок в Битрикс24 ----------
   Все формы сайта отправляют заявку одной функцией sendLead(lead, form) → lead.php на хостинге → сделка в Битрикс24
   (аренда — воронка «Аренда автодомов», остальное — «Туры Tian Way»; подробности — в начале lead.php).
   Ключ Битрикса лежит только на хостинге (lead-config.php, в код сайта и на GitHub не попадает).
   lead = { form: 'rent' | 'trip' | 'fishing' | 'ask' | 'home',   — какая форма
            title: 'Бронирование автодома',                       — подпись для консоли
            name, surname, contact (телефон или Telegram), email, sum (итог в $, необязательно),
            car, from, to, guests, extras — для аренды (id автодома, даты 'ГГГГ-ММ-ДД', число гостей, снаряжение),
            kind, tour — форма главной («Аренда автодома»…) и название тура,
            info: { 'Автодом': 'Forland S1', 'Даты': '…' } }       — остальное в комментарий сделки: подпись → значение
   form — элемент формы: у каждой отправки свой номер (key); повтор той же отправки (двойной клик, «еще раз»
   после обрыва связи) не создает вторую сделку. После успеха номер сбрасывается — следующая заявка будет новой.
   Ответ: { ok: true, id } — сделка создана; { ok: false, reason } — нет: 'busy' (даты машины заняли, пока человек
   оформлял бронь), 'check' (не удалось проверить доступность), иначе — не получилось отправить.
   Отправка идет только с tianway.kg: на копии сайта на GitHub и на компьютере PHP нет —
   там заявка пишется в консоль браузера, а форма, как раньше, сразу показывает «Спасибо». */
const LEAD_HOSTS = ['tianway.kg', 'www.tianway.kg'];
const newLeadKey = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID()
  : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);
async function sendLead(lead, form) {
  const key = form ? (form.dataset.leadKey || (form.dataset.leadKey = newLeadKey())) : newLeadKey();
  const payload = { ...lead, key, page: location.href, lang: LANG, ms: Math.round(performance.now()) };
  if (!LEAD_HOSTS.includes(location.hostname)) {
    console.info(`${lead.title} (отправка в Битрикс24 работает только на tianway.kg):`, payload);
    if (form) delete form.dataset.leadKey;
    return { ok: true };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 40000); // бронь — несколько запросов к Битриксу, хостинг медленный
  try {
    const res = await fetch(`${SITE_ROOT}lead.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    const answer = await res.json().catch(() => ({}));
    if (res.ok && answer.ok === true) {
      if (form) delete form.dataset.leadKey;
      return { ok: true, id: answer.id };
    }
    return { ok: false, reason: answer.reason || 'send', busy: answer.busy };
  } catch (e) {
    return { ok: false, reason: 'send' };
  } finally {
    clearTimeout(timer);
  }
}
// текст, если заявка не ушла: телефон берем со страницы (шапка или подвал)
function leadFailText() {
  const tel = document.querySelector('a[href^="tel:"]');
  const phone = (tel && tel.textContent.trim()) || '+996 500 192 445';
  return t('Не получилось отправить заявку. Позвоните нам: {phone}', { phone });
}
// кнопка «Отправить» на время отправки: полупрозрачная, второй раз не нажимается
function leadBusy(btn, on) {
  if (!btn) return;
  btn.disabled = on;
  btn.setAttribute('aria-busy', String(on));
}

/* ---------- 0. Прокрутка при открытии страницы ----------
   • Обновление страницы — всегда в самое начало (браузер иначе вернул бы туда, где человек был,
     а якорь в адресе, например #formats после «Выбрать формат», снова прокрутил бы к блоку).
   • Возврат кнопкой «Назад»/«Вперед» — ровно туда, где человек был, без прыжка к якорю.
     Место запоминаем сами (в памяти вкладки) перед уходом со страницы: восстановление браузера
     выключено (scrollRestoration = manual), иначе не получилось бы «в начало» при обновлении. */
(function scrollMemory() {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  const nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
  const KEY = `tw-scroll:${location.pathname}${location.search}`;
  window.addEventListener('pagehide', () => {
    try { sessionStorage.setItem(KEY, String(Math.round(window.scrollY))); } catch (e) { /* приватный режим */ }
  });

  if (nav && nav.type === 'back_forward') {
    let saved = null;
    try { saved = sessionStorage.getItem(KEY); } catch (e) { /* приватный режим */ }
    if (saved === null) return;
    // ставим сразу, как только страница собрана (высоту ей задает fitToScreen ниже), и еще раз после загрузки
    const go = () => window.scrollTo({ top: Number(saved), behavior: 'instant' });
    document.addEventListener('DOMContentLoaded', go);
    window.addEventListener('load', go);
    return;
  }

  if (!nav || nav.type !== 'reload') return;
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  const toTop = () => window.scrollTo(0, 0);
  toTop();
  window.addEventListener('load', toTop);
})();

/* ---------- 1. Масштаб: макет 1440px вписываем в ширину экрана ---------- */
// Используем transform: scale — он одинаково работает во всех браузерах
// (CSS-свойство zoom ведёт себя по-разному в Safari, Chrome и старом Firefox).
(function fitToScreen() {
  const page = document.querySelector('.page');
  if (!page) return;
  // телефоны (уже 768px) на страницах с мобильной версией (подключен css/m-common.css) — макет шириной 402px
  const hasMobile = !!document.querySelector('link[href*="css/m-common.css"]');
  const phone = window.matchMedia('(max-width: 767px)');
  const apply = () => {
    const DESIGN_WIDTH = hasMobile && phone.matches ? 402 : 1440;
    // поля слева и справа — из CSS-переменной --page-gutter (css/style.css)
    const gutter = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--page-gutter')) || 0;
    const scale = (document.documentElement.clientWidth - gutter * 2) / DESIGN_WIDTH;
    document.documentElement.style.setProperty('--page-scale', scale.toFixed(5));
    // высота документа = реальная высота страницы после масштабирования, с округлением вниз:
    // при округлении вверх под нижней картинкой оставалась доля пикселя фона — светлая полоска
    // на стыке с цветом поля при «оттягивании» страницы (edgeColors)
    // (высота — точная, из getBoundingClientRect уже с масштабом; offsetHeight округлен до целого и давал лишнюю долю пикселя)
    document.body.style.height = `${Math.floor(page.getBoundingClientRect().height)}px`;
  };
  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('load', apply);
  // высота страницы может меняться и без изменения окна (например, раскрылась карточка) — пересчитываем
  if ('ResizeObserver' in window) new ResizeObserver(apply).observe(page);
})();

/* ---------- Календарь «даты заезда и выезда» (общий для форм) ----------
   rangeCalendar(cal, { toggle, onApply, minNights }) — оживляет разметку .calendar[data-calendar]:
   два месяца, выбор диапазона, предпросмотр под курсором, «Применить».
   toggle — кнопка/поле, которое открывает календарь; onApply(from, to) — выбранные даты;
   minNights — минимальный срок (аренда — 3 суток): ближе выбранного заезда даты выезда недоступны. */
function rangeCalendar(cal, { toggle, onApply, minNights = 1 } = {}) {
  const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'].map((w) => t(w));
  const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'].map((w) => t(w));
  const WD = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map((w) => t(w));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let view = new Date(today.getFullYear(), today.getMonth(), 1);
  let from = null; let to = null;

  const nightsWord = (n) => plural(n, 'ночь', 'ночи', 'ночей');
  const fmtLong = (d) => `${d.getDate()} ${MONTHS_GEN[d.getMonth()]} ${d.getFullYear()}`;
  const fmtShort = (d) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;

  // ----- календарь: дни создаются один раз на месяц, выбор лишь меняет их состояние (для плавности)
  const colX = (i) => 29.3 + i * 49.4;
  const rowY = (r) => 131.56 + r * 41.18;
  const monthEls = [cal.querySelector('[data-cal-month="0"]'), cal.querySelector('[data-cal-month="1"]')];
  const summary = cal.querySelector('[data-cal-summary]');
  const applyBtn = cal.querySelector('[data-cal-apply]');
  let days = [];       // { btn, t, col }
  let hoverT = null;   // день под курсором — для предпросмотра диапазона

  function buildMonth(container, first) {
    container.textContent = '';
    const title = document.createElement('div');
    title.className = 'cal-title';
    title.textContent = MONTHS[first.getMonth()];
    container.append(title);
    WD.forEach((w, i) => {
      const el = document.createElement('span');
      el.className = 'cal-wd'; el.textContent = w;
      el.style.left = `${colX(i)}px`; el.style.top = '98px';
      container.append(el);
    });
    const offset = (first.getDay() + 6) % 7; // понедельник — первый день
    const daysIn = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    for (let d = 1; d <= daysIn; d++) {
      const idx = offset + d - 1;
      const col = idx % 7;
      const date = new Date(first.getFullYear(), first.getMonth(), d);
      const t = date.getTime();
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'cal-day';
      btn.innerHTML = `<span class="cal-day__num">${d}</span>`;
      btn.style.left = `${colX(col)}px`;
      btn.style.top = `${rowY(Math.floor(idx / 7))}px`;
      if (col === 0 || d === 1) btn.classList.add('edge-left');        // начало строки / месяца — скругляем полосу
      if (col === 6 || d === daysIn) btn.classList.add('edge-right');  // конец строки / месяца
      if (t === today.getTime()) btn.classList.add('is-today');
      if (date < today) btn.disabled = true;
      btn.addEventListener('click', () => pick(date));
      btn.addEventListener('mouseenter', () => { if (!btn.disabled) { hoverT = t; paint(); } });
      container.append(btn);
      days.push({ btn, t, past: date < today });
    }
  }

  function buildCalendar(dir = 0) {
    days = [];
    buildMonth(monthEls[0], view);
    buildMonth(monthEls[1], new Date(view.getFullYear(), view.getMonth() + 1, 1));
    if (dir) {
      monthEls.forEach((m) => {
        m.classList.remove('slide-next', 'slide-prev');
        void m.offsetWidth;
        m.classList.add(dir > 0 ? 'slide-next' : 'slide-prev');
      });
    }
    paint();
  }

  function paint() {
    const a = from ? from.getTime() : null;
    let b = to ? to.getTime() : null;
    const minT = a !== null ? a + minNights * 86400000 - 3600000 : null;   // запас на переход на летнее время
    const preview = a !== null && b === null && hoverT !== null && hoverT >= minT;
    if (preview) b = hoverT;
    let i = 0;
    days.forEach(({ btn, t, past }) => {
      // выбран заезд — даты выезда ближе минимального срока недоступны
      const short = a !== null && b === null && t > a && t < minT;
      btn.disabled = past || short;
      btn.classList.toggle('is-too-short', short);
      const isStart = a !== null && t === a;
      const isEnd = b !== null && t === b;
      const inside = a !== null && b !== null && t > a && t < b;
      btn.classList.toggle('is-edge', isStart || (isEnd && !preview));
      btn.classList.toggle('is-ghost-end', isEnd && preview);
      btn.classList.toggle('band-start', isStart && b !== null);
      btn.classList.toggle('band-end', isEnd);
      btn.classList.toggle('in-range', inside);
      btn.classList.toggle('is-preview', preview);
      // порядковый номер внутри диапазона — для «волны» при выборе
      btn.style.setProperty('--i', inside || isEnd ? String(++i) : '0');
    });

    let text = t('Выберите даты заезда и выезда');
    if (a !== null && b !== null) {
      const n = Math.round((b - a) / 86400000);
      text = `${fmtLong(new Date(a))} — ${fmtLong(new Date(b))}, ${n} ${nightsWord(n)}`;
    } else if (a !== null) {
      text = minNights > 1
        ? t('{date} — выберите дату выезда (аренда от {n} суток)', { date: fmtLong(new Date(a)), n: minNights })
        : t('{date} — выберите дату выезда', { date: fmtLong(new Date(a)) });
    }
    if (summary.textContent !== text) summary.textContent = text;
    applyBtn.disabled = !(from && to);
  }

  function pick(date) {
    const t = date.getTime();
    if (!from || to || t <= from.getTime()) { from = date; to = null; } else if (t >= from.getTime() + minNights * 86400000 - 3600000) { to = date; }
    paint();
  }

  monthEls.forEach((m) => m.addEventListener('mouseleave', () => { hoverT = null; paint(); }));

  // плавное открытие и закрытие
  let closeTimer = null;
  function openCal() {
    clearTimeout(closeTimer);
    if (from) view = new Date(from.getFullYear(), from.getMonth(), 1);
    cal.hidden = false;
    hoverT = null;
    buildCalendar();
    requestAnimationFrame(() => requestAnimationFrame(() => cal.classList.add('is-open')));
  }
  function closeCal() {
    if (cal.hidden) return;
    cal.classList.remove('is-open');
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => { if (!cal.classList.contains('is-open')) cal.hidden = true; }, 230);
  }

  cal.querySelector('[data-cal-prev]').addEventListener('click', () => {
    const prev = new Date(view.getFullYear(), view.getMonth() - 1, 1);
    if (prev >= new Date(today.getFullYear(), today.getMonth(), 1)) { view = prev; buildCalendar(-1); }
  });
  cal.querySelector('[data-cal-next]').addEventListener('click', () => {
    view = new Date(view.getFullYear(), view.getMonth() + 1, 1); buildCalendar(1);
  });
  cal.querySelector('[data-cal-apply]').addEventListener('click', () => {
    if (from && to && onApply) onApply(from, to);
    closeCal();
  });
  if (toggle) {
    toggle.addEventListener('click', () => {
      if (cal.hidden || !cal.classList.contains('is-open')) openCal(); else closeCal();
    });
  }
  // закрываем календарь по клику мимо него
  document.addEventListener('click', (e) => {
    const path = e.composedPath();
    if (!cal.hidden && !path.includes(cal) && !(toggle && path.includes(toggle))) closeCal();
  });

  return {
    open: openCal,
    close: closeCal,
    reset() { from = null; to = null; if (!cal.hidden) paint(); },
    // подставить уже выбранные даты (например, сохраненные с прошлого шага)
    set(a, b) {
      from = a; to = b;
      if (from) view = new Date(from.getFullYear(), from.getMonth(), 1);
      if (!cal.hidden) buildCalendar();
    },
    get range() { return from && to ? { from, to } : null; },
    fmtShort,
    fmtLong,
  };
}

/* ---------- 9. Плавная прокрутка к блокам по ссылкам вида #formats ----------
   Вместо мгновенного прыжка страница мягко разгоняется и тормозит у верха блока.
   Длительность зависит от расстояния (0,9–1,6 с). Если человек сам крутит колесико
   или касается экрана — прокрутка сразу уступает ему. При «уменьшить движение» — обычный прыжок. */
(function smoothAnchors() {
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // синусоида: мягкий разгон и торможение, а пиковая скорость вдвое ниже, чем у прежней кривой
  const ease = (t) => (1 - Math.cos(Math.PI * t)) / 2;
  let raf = 0;
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };
  ['wheel', 'touchstart', 'keydown'].forEach((ev) => window.addEventListener(ev, () => raf && stop(), { passive: true }));

  function scrollToY(to) {
    stop();
    const from = window.scrollY;
    const dist = to - from;
    if (Math.abs(dist) < 2) return;
    const dur = Math.min(1600, Math.max(900, Math.abs(dist) * 0.9));
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      window.scrollTo(0, from + dist * ease(t));
      raf = t < 1 ? requestAnimationFrame(step) : 0;
    };
    raf = requestAnimationFrame(step);
  }

  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const hash = link.getAttribute('href');
    // href="#" — заглушки (страниц еще нет): клик ничего не делает, страница не прыгает наверх
    if (hash.length < 2) { e.preventDefault(); return; }
    const target = document.getElementById(hash.slice(1));
    if (!target) return;
    e.preventDefault();
    let top = Math.round(target.getBoundingClientRect().top + window.scrollY);
    // data-center: блок встает ровно посередине экрана (например, форма заявки на «Рыбалке»);
    // data-center=".класс" — по центру встает не весь блок, а этот элемент внутри него (плашка «Выбери формат»)
    if (target.hasAttribute('data-center')) {
      const sel = target.getAttribute('data-center');
      const box = (sel && target.querySelector(sel)) || target;
      const r = box.getBoundingClientRect(); // видимый размер — уже с учетом масштаба и уменьшения блока
      const scale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--page-scale')) || 1;
      // пока блок «выплывает» (анимация появления), он сдвинут вниз — этот сдвиг не учитываем
      const ty = (parseFloat((getComputedStyle(box).translate || '').split(' ')[1]) || 0) * scale;
      const gap = Math.max((window.innerHeight - r.height) / 2, 16);
      top = Math.max(0, Math.round(r.top - ty + window.scrollY - gap));
      // блок у самого низа страницы — добавляем запас, иначе браузер не даст докрутить до центра
      // (min-height, а не height: высоту body пересчитывает подгонка масштаба — запас при этом не пропадет)
      const need = top + window.innerHeight;
      if (document.body.offsetHeight < need) document.body.style.minHeight = `${need}px`;
    }
    if (reduce) window.scrollTo(0, top); else scrollToY(top);
    history.pushState(null, '', hash); // адрес меняется как при обычном переходе по якорю
  });
})();

/* ---------- 10. Появление при прокрутке для внутренних страниц ----------
   Каждый элемент с data-reveal появляется, когда сам доходит до экрана (один раз). */
(function revealItems() {
  const els = [...document.querySelectorAll('[data-reveal]')];
  if (!document.documentElement.classList.contains('reveal-on')) return;
  const show = (el) => el.classList.add('is-in');
  if (!('IntersectionObserver' in window)) { els.forEach(show); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { show(e.target); io.unobserve(e.target); } });
  }, { threshold: 0.2 });
  els.forEach((el) => io.observe(el));
})();

/* ---------- 11. Свои выпадающие списки [data-dd] (формы внутренних страниц) ----------
   Обычный <select> в открытом виде браузер рисует сам, и оформить его нельзя.
   Поэтому список свой: кнопка + перечень пунктов; выбранное пишем в скрытое поле topic,
   чтобы форма получала значение как раньше. Работает мышью и с клавиатуры
   (стрелки — по пунктам, Enter/пробел — выбрать, Esc/Tab — закрыть). */
(function dropdowns() {
  document.querySelectorAll('[data-dd]').forEach((dd, ddIndex) => {
  const btn = dd.querySelector('button');
  const valueEl = dd.querySelector('[data-dd-value]');
  const input = dd.querySelector('input[type="hidden"]');
  const opts = [...dd.querySelectorAll('[role="option"]')];
  const isOpen = () => dd.classList.contains('is-open');
  let active = -1;

  opts.forEach((o, i) => { o.id = `dd${ddIndex}-opt-${i}`; });
  const initial = Math.max(0, opts.findIndex((o) => o.getAttribute('aria-selected') === 'true'));
  const setActive = (i) => {
    active = i;
    opts.forEach((o, k) => o.classList.toggle('is-active', k === i));
    if (i >= 0) btn.setAttribute('aria-activedescendant', opts[i].id); else btn.removeAttribute('aria-activedescendant');
  };
  const selectedIndex = () => opts.findIndex((o) => o.getAttribute('aria-selected') === 'true');
  const open = (v) => {
    dd.classList.toggle('is-open', v);
    btn.setAttribute('aria-expanded', String(v));
    setActive(v ? selectedIndex() : -1);
  };
  const choose = (i, { focus = true } = {}) => {
    opts.forEach((o, k) => o.setAttribute('aria-selected', String(k === i)));
    valueEl.textContent = opts[i].textContent.trim();
    input.value = valueEl.textContent;
    open(false);
    if (focus) btn.focus({ preventScroll: true });
  };

  btn.addEventListener('click', () => open(!isOpen()));
  opts.forEach((o, i) => {
    o.addEventListener('click', () => choose(i));
    o.addEventListener('mouseenter', () => setActive(i));
  });
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen()) { open(true); return; }
      setActive((active + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length);
    } else if ((e.key === 'Enter' || e.key === ' ') && isOpen()) {
      e.preventDefault();
      if (active >= 0) choose(active); else open(false);
    } else if (e.key === 'Escape' && isOpen()) {
      e.preventDefault(); open(false);
    } else if (e.key === 'Tab') {
      open(false);
    }
  });
  // клик мимо списка — закрыть
  document.addEventListener('click', (e) => { if (isOpen() && !e.composedPath().includes(dd)) open(false); });
  // сброс формы (например, «Задать еще вопрос») — возвращаем пункт, выбранный изначально
  dd.closest('form')?.addEventListener('reset', () => choose(initial, { focus: false }));
  });
})();

/* ---------- 12. Формы заявок внутренних страниц (вопросы, путешествия, рыбалка) ----------
   Одна логика для всех: проверка обязательных полей и согласия, «Спасибо» на месте формы,
   «Отправить еще одну» — благодарность уходит, поля по очереди выплывают.
   Заявка уходит в Битрикс24 (sendLead); не ушла — ошибка с телефоном, форма остается заполненной.
   leadForm({
     form, error, done, again,            — элементы: форма, строка ошибки, «Спасибо», кнопка «еще раз»
     fields: { name: input, … },          — обязательные поля
     missingText(missing) → строка,       — текст, если чего-то не хватает (по умолчанию — про имя и контакты)
     dates: { btn, value, cal },          — поле дат с общим календарем (необязательно)
     kind, title, lead() → объект,        — какая форма, название лида и данные заявки (см. sendLead)
     againMs, focusAfterAgain,            — длительность «выплывания» и поле, куда поставить курсор
   }) */
function leadForm(o) {
  const { form, error: errorEl, done, fields } = o;
  const defaultMissing = (missing) => t(missing.length > 1 ? 'Укажите имя и контакты, чтобы мы могли связаться с вами.'
    : missing[0] === 'name' ? 'Укажите имя, чтобы мы знали, как к вам обращаться.'
      : 'Укажите телефон или Telegram, чтобы мы могли связаться с вами.');
  const missingText = o.missingText || defaultMissing;

  // --- даты: общий календарь rangeCalendar
  let calendar = null; let datesPlaceholder = '';
  if (o.dates) {
    const { btn, value, cal } = o.dates;
    datesPlaceholder = value.textContent;
    const pad = (n) => String(n).padStart(2, '0');
    const fmt = (d) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
    const daysWord = (n) => plural(n, 'день', 'дня', 'дней');
    calendar = rangeCalendar(cal, {
      toggle: btn,
      onApply(from, to) {
        const days = Math.round((to - from) / 86400000) + 1; // включая день выезда
        const text = `${fmt(from)} – ${fmt(to)}`;
        // «· 7 дней» — отдельным кусочком: на узком поле телефона его можно скрыть (.lead-days)
        value.textContent = text;
        const extra = document.createElement('span');
        extra.className = 'lead-days';
        extra.textContent = ` · ${days} ${daysWord(days)}`;
        value.append(extra);
        btn.classList.add('is-filled');
        form.elements.dates.value = text;
      },
    });
    // стрелка у поля дат переворачивается, пока календарь открыт
    new MutationObserver(() => {
      btn.setAttribute('aria-expanded', String(!cal.hidden && cal.classList.contains('is-open')));
    }).observe(cal, { attributes: true, attributeFilter: ['class', 'hidden'] });
  }

  // --- проверка
  const clearErrors = () => {
    errorEl.hidden = true;
    Object.values(fields).forEach((f) => f.classList.remove('is-invalid'));
  };
  Object.values(fields).forEach((f) => f.addEventListener('input', clearErrors));
  form.elements.consent.addEventListener('change', () => { errorEl.hidden = true; });

  const submitBtn = form.querySelector('[type="submit"]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitBtn && submitBtn.disabled) return; // заявка уже отправляется
    clearErrors();
    const missing = Object.keys(fields).filter((k) => !fields[k].value.trim());
    if (missing.length) {
      errorEl.textContent = missingText(missing);
      errorEl.hidden = false;
      missing.forEach((k) => fields[k].classList.add('is-invalid'));
      fields[missing[0]].focus({ preventScroll: true });
      return;
    }
    if (!form.elements.consent.checked) {
      errorEl.textContent = t('Нужно согласие на обработку персональных данных.');
      errorEl.hidden = false;
      return;
    }

    if (calendar) calendar.close();
    leadBusy(submitBtn, true);
    const sent = await sendLead({ form: o.kind, title: o.title, ...o.lead() }, form);
    if (!sent.ok) {
      leadBusy(submitBtn, false);
      errorEl.textContent = leadFailText();
      errorEl.hidden = false;
      return;
    }

    form.classList.add('is-hiding'); // форма плавно уходит, на ее месте появляется благодарность
    setTimeout(() => {
      form.hidden = true;
      form.classList.remove('is-hiding');
      done.hidden = false;
      done.classList.add('is-showing');
    }, 300);
  });

  // --- «Отправить еще одну»: благодарность уходит вверх, поля формы по очереди выплывают (сверху вниз)
  [...form.children].forEach((el, i) => el.style.setProperty('--si', i));
  let againTimer;
  o.again.addEventListener('click', () => {
    leadBusy(submitBtn, false); // новая заявка — кнопка снова работает
    clearTimeout(againTimer);
    done.classList.remove('is-showing');
    done.classList.add('is-hiding');
    againTimer = setTimeout(() => {
      done.hidden = true;
      done.classList.remove('is-hiding');
      form.reset();
      clearErrors();
      if (calendar) {
        calendar.reset();
        form.elements.dates.value = ''; // скрытое поле reset() не очищает
        o.dates.value.textContent = datesPlaceholder;
        o.dates.btn.classList.remove('is-filled');
      }
      form.hidden = false;
      form.classList.add('is-showing');
      if (o.focusAfterAgain) o.focusAfterAgain.focus({ preventScroll: true });
      // снимаем класс после анимации, чтобы ее можно было повторить в следующий раз
      againTimer = setTimeout(() => form.classList.remove('is-showing'), o.againMs || 1300);
    }, 300);
  });
}

/* ---------- Листание лент пальцем, мышью и тачпадом (swipeable) ----------
   Ленты со стрелками (путешествия, дни тура, фото автодомов, отзывы, маршруты) можно тянуть вбок.
   area — что тянем; move(dx) — во время движения (dx — сдвиг в единицах макета, с учетом масштаба страницы),
   end(dx) — при отпускании: решает, листать ли (обычно |dx| > 40). move можно не передавать — тогда лента
   не едет за пальцем, а просто листается при отпускании. Вертикальная прокрутка страницы пальцем не мешает:
   жест считается листанием, только если он заметно больше вбок, чем вверх-вниз. После перетаскивания
   клик (по фото, кнопке) не срабатывает — чтобы не открывать фото случайно. */
function swipeable(area, { move, end }) {
  if (!area) return;
  const scale = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--page-scale')) || 1;
  area.style.touchAction = 'pan-y';                                  // вертикальную прокрутку оставляем браузеру
  area.addEventListener('dragstart', (e) => e.preventDefault());     // картинки не «утаскиваются» мышью
  let x0 = null; let y0 = 0; let dx = 0; let id = null; let dragging = false;
  area.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    x0 = e.clientX; y0 = e.clientY; dx = 0; id = e.pointerId; dragging = false;
  });
  area.addEventListener('pointermove', (e) => {
    if (x0 === null || e.pointerId !== id) return;
    const mx = e.clientX - x0; const my = e.clientY - y0;
    if (!dragging) {
      if (Math.abs(mx) > 8 && Math.abs(mx) > Math.abs(my) * 1.2) {
        dragging = true;
        try { area.setPointerCapture(id); } catch (err) { /* уже отпустили */ }
        area.classList.add('is-dragging');
      } else if (Math.abs(my) > 10) { x0 = null; return; }           // это прокрутка страницы — не мешаем
      else return;
    }
    dx = mx / scale();
    if (move) move(dx);
  });
  const finish = (cancel) => {
    if (x0 === null) return;
    x0 = null;
    if (!dragging) return;
    dragging = false;
    area.classList.remove('is-dragging');
    end(cancel ? 0 : dx);
    // клик сразу после перетаскивания гасим (браузер присылает его вслед за отпусканием)
    const stop = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
    area.addEventListener('click', stop, true);
    setTimeout(() => area.removeEventListener('click', stop, true), 80);
  };
  area.addEventListener('pointerup', () => finish(false));
  area.addEventListener('pointercancel', () => finish(true));

  // тачпад (два пальца вбок) и горизонтальное колесико мыши: один жест — одна карточка.
  // Тачпад присылает события еще долго после жеста (инерция), поэтому следующий шаг — только после паузы.
  // Вертикальную прокрутку не трогаем; горизонтальную гасим, чтобы браузер не уходил «Назад» по жесту.
  let sum = 0; let locked = false; let quiet = null;
  area.addEventListener('wheel', (e) => {
    const k = e.deltaMode === 1 ? 16 : 1;                             // колесико в строках → в пиксели
    const wx = e.deltaX * k; const wy = e.deltaY * k;
    if (Math.abs(wx) <= Math.abs(wy)) return;
    e.preventDefault();
    clearTimeout(quiet);
    quiet = setTimeout(() => { locked = false; sum = 0; }, 200);
    if (locked) return;
    sum += wx;
    if (Math.abs(sum) < 30) return;
    locked = true;
    end(sum > 0 ? -41 : 41);                                         // как перетаскивание влево/вправо
    sum = 0;
  }, { passive: false });
}

/* ---------- Цвет полей при «оттягивании» страницы (edgeColors) ----------
   Когда страницу тянут дальше края (резиночка на Mac, iPhone), браузер показывает фон под страницей.
   Чтобы там не было белой полосы, красим фон html: в верхней половине страницы — цветом самого верха,
   в нижней — цветом самого низа. Цвета — переменные --edge-top / --edge-bottom в css страницы
   (на телефоне — в css/m-<страница>.css). */
(function edgeColors() {
  const root = document.documentElement;
  const css = getComputedStyle(root);
  let last = '';
  function paint() {
    const top = css.getPropertyValue('--edge-top').trim();
    const bottom = css.getPropertyValue('--edge-bottom').trim();
    if (!top || !bottom) return;
    const color = window.scrollY + window.innerHeight / 2 < root.scrollHeight / 2 ? top : bottom;
    if (color !== last) { root.style.backgroundColor = color; last = color; }
  }
  window.addEventListener('scroll', paint, { passive: true });
  window.addEventListener('resize', () => { last = ''; paint(); });
  paint();
})();

/* ---------- Переключатель языка (глобус в шапке) ----------
   Кнопка открывает список «Русский / English»; выбор запоминается в браузере (tianway_language) —
   js/lang-detect.js потом сразу показывает выбранную версию. Закрывается кликом мимо и клавишей Esc. */
(function langSwitch() {
  document.querySelectorAll('[data-lang]').forEach((box) => {
    const btn = box.querySelector('.lang__btn');
    const set = (open) => { box.classList.toggle('is-open', open); btn.setAttribute('aria-expanded', String(open)); };
    box.twSet = set;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = !box.classList.contains('is-open');
      // открыли язык — закрываем валюту, и наоборот (клик по кнопке не доходит до document)
      if (open) document.querySelectorAll('[data-lang].is-open').forEach((o) => o !== box && o.twSet && o.twSet(false));
      set(open);
    });
    document.addEventListener('click', (e) => { if (!box.contains(e.target)) set(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
    box.querySelectorAll('[data-lang-link]').forEach((a) => a.addEventListener('click', (e) => {
      try { localStorage.setItem('tianway_language', a.hreflang); } catch (err) { /* приватный режим — просто перейдем */ }
      // та же страница, то же место (#раздел) — в другой версии
      if (location.hash) { e.preventDefault(); location.href = a.href.split('#')[0] + location.hash; }
    }));
    // валюта: выбор запоминается в браузере (tianway_currency) и сразу меняет html[data-cur];
    // скрипты с ценами слушают событие tw:currency (пересчет — когда будут базовые цены в сомах, ТЗ № 1)
    box.querySelectorAll('[data-cur-opt]').forEach((b) => b.addEventListener('click', () => {
      setCurrency(b.dataset.curOpt);
      set(false);
      btn.focus();
    }));
  });
}());

/* ---------- Валюта цен (ТЗ № 1) ----------
   currency() — выбранная валюта: 'RUB' | 'USD' | 'KGS' (по умолчанию — сомы, CUR_DEFAULT в js/lang-detect.js).
   setCurrency(code) — выбрать (запоминается для всех страниц и языков; в других вкладках — через событие storage). */
const CURRENCIES = ['RUB', 'USD', 'KGS'];
function currency() {
  const c = document.documentElement.getAttribute('data-cur');
  return CURRENCIES.includes(c) ? c : 'KGS';
}
function setCurrency(code, save = true) {
  if (!CURRENCIES.includes(code) || code === document.documentElement.getAttribute('data-cur')) return;
  document.documentElement.setAttribute('data-cur', code);
  if (save) { try { localStorage.setItem('tianway_currency', code); } catch (e) { /* приватный режим — только эта страница */ } }
  window.dispatchEvent(new CustomEvent('tw:currency', { detail: code }));
}
window.addEventListener('storage', (e) => { if (e.key === 'tianway_currency' && e.newValue) setCurrency(e.newValue, false); });

/* ---------- Цены в выбранной валюте (ТЗ № 1) ----------
   Все цены сайта хранятся и считаются в сомах (KGS). На странице сумма — элемент с data-kgs="N"
   (data-from — «от N»): Money показывает ее в выбранной валюте. Доллары и рубли — справочно, по курсу
   Нацбанка КР: его раз в день получает сервер (api/rates.php → /api/rates), браузер помнит последний
   проверенный курс (tianway_rates) — так цены не «прыгают» при загрузке. Курса нет или он старше 72 часов —
   показываем только сомы.
   Money.fmt(kgs, { from, exact }) — текст суммы (exact — всегда в сомах); Money.kgs(kgs) — в сомах;
   Money.render(root) — обновить все [data-kgs]; событие tw:money — валюта или курс сменились (пересчитать итоги). */
const Money = (function () {
  const MAX_AGE = 72 * 3600 * 1000;        // курс старше 72 часов не показываем (ТЗ)
  const RATES_KEY = 'tianway_rates';
  let rates = null;                         // { date: 'ГГГГ-ММ-ДД', USD, RUB } — сомов за 1 доллар / 1 рубль
  const fresh = (r) => {
    if (!r || !(r.USD > 0) || !(r.RUB > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(r.date || '')) return false;
    const day = Date.parse(`${r.date}T00:00:00+06:00`);  // дата курса — по Бишкеку
    return Date.now() - day < MAX_AGE;
  };
  try { const r = JSON.parse(localStorage.getItem(RATES_KEY)); if (fresh(r)) rates = r; } catch (e) { /* нет сохраненного */ }

  const group = (s, sep) => s.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  // число по правилам языка: 21 900 / 21,900; дробная часть — только если она есть (или digits для долларов)
  const num = (n, digits) => {
    const fixed = Math.abs(n).toFixed(digits);
    let [int, frac] = fixed.split('.');
    if (frac && /^0+$/.test(frac) && digits !== 2) frac = '';
    int = group(int, LANG === 'en' ? ',' : ' ');
    return (n < 0 ? '−' : '') + int + (frac ? (LANG === 'en' ? '.' : ',') + frac : '');
  };
  const kgs = (n, from) => {
    const v = num(Math.round(n * 100) / 100, Number.isInteger(Math.round(n * 100) / 100) ? 0 : 2);
    const text = LANG === 'en' ? `${v} KGS` : `${v} сом`;
    return from ? `${t('от')} ${text}` : text;
  };
  // доллары и рубли — всегда до целого, без центов и копеек (решение заказчика 28.11.2026; в ТЗ доллары — 2 знака).
  // «≈» (сумма справочная) — только на последнем шаге
  // бронирования, где сумма юридически важна (Money.approxSign = true, js/rent-booking.js); на карточках — без него
  // (решение 27.11.2026)
  let approxSign = false;
  const other = (n, cur, from) => {
    const v = num(Math.round(n / rates[cur]), 0);
    const sym = cur === 'USD' ? '$' : '₽';
    const text = LANG === 'en' ? `${sym}${v}` : `${v} ${sym}`;
    return from ? `${t('от')} ${text}` : `${approxSign ? '≈ ' : ''}${text}`;
  };
  const shown = () => { const c = currency(); return c !== 'KGS' && rates ? c : 'KGS'; };
  const api = {
    get rates() { return rates; },
    shown,                                         // в какой валюте сейчас на самом деле показываем
    set approxSign(on) { approxSign = !!on; api.render(); },
    kgs: (n, from = false) => kgs(n, from),
    fmt(n, { from = false, exact = false } = {}) {
      const c = exact ? 'KGS' : shown();
      return c === 'KGS' ? kgs(n, from) : other(n, c, from);
    },
    // справочная сумма в выбранной валюте (без сомов) — или '' (выбраны сомы / курса нет)
    approx: (n) => (shown() === 'KGS' ? '' : `≈ ${other(n, shown(), false).replace(/^≈ /, '')}`),
    render(root = document) {
      root.querySelectorAll('[data-kgs]').forEach((el) => {
        el.textContent = api.fmt(Number(el.dataset.kgs) || 0, { from: el.hasAttribute('data-from') });
      });
    },
  };
  const changed = () => { api.render(); window.dispatchEvent(new CustomEvent('tw:money')); };
  api.render();
  window.addEventListener('tw:currency', changed);

  // курс с сервера (на хостинге — /api/rates); на GitHub Pages сервера нет — курс из data/rates.json,
  // его кладет автосборка (tools/fetch_rates.py); старше 72 часов — только сомы
  const ratesUrl = /github\.io$/.test(location.hostname) ? `${SITE_ROOT}data/rates.json?v=${Math.floor(Date.now() / 3600000)}` : `${SITE_ROOT}api/rates`;
  fetch(ratesUrl, { headers: { Accept: 'application/json' } })
    .then((r) => (r.ok ? r.json() : null))
    .then((r) => {
      if (r && r.ok && fresh(r)) {
        const next = { date: r.date, USD: Number(r.USD), RUB: Number(r.RUB) };
        const same = rates && rates.date === next.date && rates.USD === next.USD && rates.RUB === next.RUB;
        rates = next;
        try { localStorage.setItem(RATES_KEY, JSON.stringify(next)); } catch (e) { /* только эта страница */ }
        if (!same) changed();
      } else if (r && !r.ok && rates) {          // сервер сказал: курса нет или он устарел — только сомы
        rates = null;
        try { localStorage.removeItem(RATES_KEY); } catch (e) { /* ничего */ }
        changed();
      }
    })
    .catch(() => { /* сервер не ответил — остается последний проверенный курс (если он не старше 72 часов) */ });
  return api;
}());
