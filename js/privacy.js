/* Tian Way — «Политика конфиденциальности» (privacy.html): кнопка «Наверх» появляется, когда страницу прокрутили
   ниже первого экрана, и прячется, пока виден подвал (иначе закрывает его ссылки).
   Плавная прокрутка к #top — smoothAnchors в js/main.js. */
(function upButton() {
  const btn = document.querySelector('.pp__up');
  if (!btn) return;
  const footer = document.querySelector('.footer');
  const update = () => {
    const low = footer && footer.getBoundingClientRect().top < window.innerHeight;
    btn.classList.toggle('is-shown', window.scrollY > window.innerHeight * 0.8 && !low);
  };
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();
})();
