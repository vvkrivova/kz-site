/* Tian Way — автовыбор языка (подключен в <head> каждой страницы, до показа страницы).
   Русская версия — tianway.kg/<страница>, английская — tianway.kg/en/<страница>.
   • Посетитель уже выбирал язык переключателем — показываем выбранный (запомнен в браузере, tw-lang).
   • Не выбирал — смотрим главный язык устройства: русский (и языки, где обычно читают по-русски:
     кыргызский, казахский, узбекский, таджикский, украинский, белорусский) — русская версия, любой другой — английская.
   • Поисковых роботов не перекидываем — они видят обе версии по ссылкам hreflang. */
(function () {
  var d = document.documentElement;
  var page = d.lang === 'en' ? 'en' : 'ru';
  var want = null;
  try { want = localStorage.getItem('tw-lang'); } catch (e) { /* приватный режим */ }
  if (want !== 'ru' && want !== 'en') {
    // переход внутри сайта (в том числе переключателем языка) — язык выбран ссылкой, не перекидываем
    try { if (document.referrer && new URL(document.referrer).host === location.host) return; } catch (e) { /* нет адреса */ }
    if (/bot|crawl|spider|slurp|lighthouse|headless|preview/i.test(navigator.userAgent)) return;
    var first = (navigator.languages && navigator.languages[0]) || navigator.language || '';
    want = /^(ru|ky|kk|uz|tg|uk|be)\b/i.test(first) ? 'ru' : 'en';
  }
  if (want === page) return;
  var path = location.pathname;
  var to = page === 'ru' ? path.replace(/\/([^/]*)$/, '/en/$1') : path.replace(/\/en\/([^/]*)$/, '/$1');
  if (to !== path) location.replace(to + location.search + location.hash);
}());
