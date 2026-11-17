/* =========================================================
   Tian Way — скрипты страницы тура (tour-issyk-ring.html)
   Общее (масштаб, появление при прокрутке, плавная прокрутка) — в js/main.js.
   ========================================================= */

/* ---------- Лента «Программа тура по дням» ----------
   Видно три карточки целиком, следующая выглядывает справа (как в макете).
   Стрелки сдвигают ленту на одну карточку; лишняя стрелка прячется. */
(function tourDays() {
  const track = document.querySelector('[data-days-track]');
  if (!track) return;
  const STEP = 398;   // ширина карточки 372 + промежуток 26 (из макета)
  const VISIBLE = 3;
  const days = [...track.querySelectorAll('.tday')];
  const prev = document.querySelector('[data-days-prev]');
  const next = document.querySelector('[data-days-next]');
  const max = Math.max(0, days.length - VISIBLE);
  let index = 0;

  days.forEach((d, i) => { d.style.left = `${i * STEP}px`; });
  function update() {
    track.style.translate = `${-index * STEP}px 0`;
    prev.hidden = index === 0;
    next.hidden = index >= max;
  }
  prev.addEventListener('click', () => { index = Math.max(0, index - 1); update(); });
  next.addEventListener('click', () => { index = Math.min(max, index + 1); update(); });
  update();
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
