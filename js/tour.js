/* =========================================================
   Tian Way — скрипты страницы тура (tour-issyk-ring.html)
   Общее (масштаб, появление при прокрутке, плавная прокрутка) — в js/main.js.
   ========================================================= */

/* ---------- Лента «Программа тура по дням» ----------
   На компьютере видно три карточки целиком, следующая выглядывает справа; на телефоне — одна (как в макетах).
   Шаг ленты и число видимых карточек — из CSS (--days-step, --days-visible у .tour-days).
   Стрелки сдвигают ленту на одну карточку; лишняя стрелка прячется. */
(function tourDays() {
  const track = document.querySelector('[data-days-track]');
  if (!track) return;
  const box = track.closest('.tour-days');
  const cssNum = (name, fallback) => parseFloat(getComputedStyle(box).getPropertyValue(name)) || fallback;
  const days = [...track.querySelectorAll('.tday')];
  const prev = document.querySelector('[data-days-prev]');
  const next = document.querySelector('[data-days-next]');
  let index = 0;

  function update(instant) {
    const STEP = cssNum('--days-step', 398);
    const max = Math.max(0, days.length - cssNum('--days-visible', 3));
    index = Math.min(index, max);
    days.forEach((d, i) => { d.style.left = `${i * STEP}px`; });
    if (instant) track.style.transition = 'none';
    track.style.translate = `${-index * STEP}px 0`;
    if (instant) { void track.offsetWidth; track.style.transition = ''; }
    prev.hidden = index === 0;
    next.hidden = index >= max;
  }
  prev.addEventListener('click', () => { index = Math.max(0, index - 1); update(); });
  next.addEventListener('click', () => { index += 1; update(); });
  update(true);
  // телефон ↔ компьютер (поворот экрана, изменение окна): другой шаг ленты — переставляем без анимации
  window.matchMedia('(max-width: 767px)').addEventListener('change', () => update(true));
})();

/* ---------- Оранжевые линии над горами рисуются, когда их становится видно ----------
   Ждем, пока сами штрихи (они начинаются примерно на 30% ниже верха картинки) поднимутся
   над нижним краем экрана на 15% его высоты, — и запускаем спокойную прорисовку
   слева направо (4 секунды, см. .tour__lines в css/tour.css). Один раз.
   При «уменьшить движение» класса reveal-on нет — линии просто видны целиком. */
(function drawLines() {
  const lines = document.querySelector('.tour__lines');
  if (!lines || !document.documentElement.classList.contains('reveal-on')) return;
  let done = false;
  function check() {
    if (done) return;
    const r = lines.getBoundingClientRect();
    const strokesTop = r.top + r.height * 0.3;
    if (strokesTop < window.innerHeight * 0.85) {
      done = true;
      lines.classList.add('is-drawing');
      window.removeEventListener('scroll', check);
    }
  }
  window.addEventListener('scroll', check, { passive: true });
  window.addEventListener('load', check);
  check();
})();
