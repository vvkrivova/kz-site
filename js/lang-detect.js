/* Tian Way — автовыбор языка и валюта цен (подключен в <head> каждой страницы, до показа страницы).
   Русская версия — tianway.kg/<страница>, английская — tianway.kg/en/<страница>.
   • Посетитель уже выбирал язык переключателем — показываем выбранный (запомнен в браузере, ключ tianway_language — так он назван в политике конфиденциальности, раздел 10;
     до 27.11.2026 ключ назывался tw-lang — старый выбор переносится в новый ключ).
   • Не выбирал — смотрим главный язык устройства: русский (и языки, где обычно читают по-русски:
     кыргызский, казахский, узбекский, таджикский, украинский, белорусский) — русская версия, любой другой — английская.
   • Поисковых роботов не перекидываем — они видят обе версии по ссылкам hreflang. */
(function () {
  var d = document.documentElement;
  var page = d.lang === 'en' ? 'en' : 'ru';
  // валюта цен (ТЗ № 1): выбранная — из браузера (tianway_currency), иначе по языку страницы. Ставим сразу,
  // до показа страницы: подпись переключателя берется из html[data-cur] (css/style.css) — без скачков.
  // Валюта по умолчанию для языка — здесь. Решение заказчицы 27.11.2026: сразу показываем сомы на обоих языках
  // (в ТЗ предлагалось RU → рубли, EN → доллары).
  var CUR_DEFAULT = { ru: 'KGS', en: 'KGS' };
  var cur = null;
  try { cur = localStorage.getItem('tianway_currency'); } catch (e) { /* приватный режим */ }
  d.setAttribute('data-cur', /^(RUB|USD|KGS)$/.test(cur || '') ? cur : CUR_DEFAULT[page]);
  var want = null;
  try {
    want = localStorage.getItem('tianway_language');
    var old = localStorage.getItem('tw-lang');
    if (old !== null) {                       // перенос со старого ключа
      if (want === null && (old === 'ru' || old === 'en')) { want = old; localStorage.setItem('tianway_language', old); }
      localStorage.removeItem('tw-lang');
    }
  } catch (e) { /* приватный режим */ }
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
