/* =========================================================
   Tian Way — скрипты главной страницы
   ========================================================= */

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

/* ---------- 0.1. Появление первого экрана (вариант 3) ----------
   Ждём, пока загрузятся картинки первого экрана, и запускаем проявление.
   Классы hero-wait / hero-play ставит скрипт в <head>, стили — в css/style.css. */
(function heroIntro() {
  const html = document.documentElement;
  if (!html.classList.contains('hero-wait')) return;
  const imgs = [...document.querySelectorAll('.hero img, .ov-tape img, .ov-photo-bw img, .ov-lines-a img, .ov-lines-b img')];
  const ready = (img) => (img.complete
    ? (img.decode ? img.decode().catch(() => {}) : Promise.resolve())
    : new Promise((r) => { img.addEventListener('load', r, { once: true }); img.addEventListener('error', r, { once: true }); }));
  const play = () => {
    if (!html.classList.contains('hero-wait')) return;
    html.classList.remove('hero-wait');
    html.classList.add('hero-play');
    setTimeout(() => html.classList.remove('hero-play'), 2600); // сразу после окончания — обычные стили (и параллакс)
  };
  Promise.race([Promise.all(imgs.map(ready)), new Promise((r) => setTimeout(r, 3500))]).then(() => requestAnimationFrame(play));
})();

/* ---------- 1. Масштаб: макет 1440px вписываем в ширину экрана ---------- */
// Используем transform: scale — он одинаково работает во всех браузерах
// (CSS-свойство zoom ведёт себя по-разному в Safari, Chrome и старом Firefox).
(function fitToScreen() {
  const DESIGN_WIDTH = 1440;
  const page = document.querySelector('.page');
  if (!page) return;
  const apply = () => {
    // поля слева и справа — из CSS-переменной --page-gutter (css/style.css)
    const gutter = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--page-gutter')) || 0;
    const scale = (document.documentElement.clientWidth - gutter * 2) / DESIGN_WIDTH;
    document.documentElement.style.setProperty('--page-scale', scale.toFixed(5));
    // высота документа = реальная высота страницы после масштабирования
    document.body.style.height = `${Math.ceil(page.offsetHeight * scale)}px`;
  };
  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('load', apply);
  // высота страницы может меняться и без изменения окна (например, раскрылась карточка) — пересчитываем
  if ('ResizeObserver' in window) new ResizeObserver(apply).observe(page);
})();

/* ---------- 2. Карта «Куда на автодоме реально проехать» ---------- */
(function routesSwitcher() {
  const card = document.querySelector('[data-route-card]');
  const layer = document.querySelector('[data-routes-layer]');
  if (!card || !layer) return;

  const T = 'img/map/';

  // чёрточки пунктира каждого маршрута в порядке движения по маршруту:
  // [d, сдвиг x, сдвиг y, центр чёрточки x, центр y] — координаты из макета
  const ROUTE_DASHES = {"r1":[["M1.5 32.5L4.08333 29.9167",375.5,515.5,378.3,546.7],["M9.25 24.75L14.4167 19.5833",375.5,515.5,387.3,537.7],["M19.5833 14.4167L24.75 9.25",375.5,515.5,397.7,527.3],["M32.5 1.5L29.9167 4.08333",375.5,515.5,406.7,518.3],["M1.50022 13.5858C2.42529 13.7318 3.56016 13.9654 4.86743 14.2963",415.49,502.41,418.7,516.4],["M11.4483 16.3522C13.4339 17.0786 15.5768 17.9532 17.82 18.991",415.49,502.41,430.1,520.1],["M23.9572 22.1323C25.8902 23.2209 27.8563 24.4265 29.8247 25.7572",415.49,502.41,442.4,526.4],["M35.3683 29.8581C36.252 30.573 37.1303 31.3153 38.0002 32.0858C39.2674 33.2081 40.5522 34.216 41.846 35.1193",415.49,502.41,454.1,534.9],["M50.485 39.6912C53.7728 40.9342 56.9899 41.6379 59.9887 41.9646",415.49,502.41,470.7,543.2],["M74.5002 40.5858C73.2641 41.0412 71.6533 41.4674 69.7572 41.7663",415.49,502.41,487.6,543.6],["M74.5002 40.5858C75.3462 39.7038 76.3733 38.7336 77.5714 37.7075",415.49,502.41,491.5,541.6],["M91.6157 28.3891C88.9489 29.7753 86.5147 31.22 84.3347 32.6553",415.49,502.41,503.5,532.9],["M107.266 22.1202C104.47 22.9311 101.806 23.8601 99.2872 24.8695",415.49,502.41,518.8,525.9],["M123.844 19.0873C120.965 19.3129 118.174 19.6859 115.478 20.18",415.49,502.41,535.2,522.0],["M140.676 19.3577C139.32 19.2872 137.928 19.197 136.5 19.0858C135.077 18.9749 133.67 18.9027 132.279 18.8667",415.49,502.41,552.0,521.5],["M157.351 19.1924C154.776 19.4022 152 19.5283 149.015 19.5508",415.49,502.41,568.7,521.8],["M173.716 16.1485C171.407 16.8983 168.719 17.5818 165.623 18.1366",415.49,502.41,585.2,519.6],["M188.806 8.62211C187.105 9.16272 185.645 9.664 184.5 10.0858C183.876 10.874 182.83 11.7942 181.317 12.7454",415.49,502.41,600.6,513.1],["M206.45 4.1684C203.373 4.74094 200.363 5.4208 197.562 6.13047",415.49,502.41,617.5,507.6],["M224.216 2.42562C222.675 2.4919 221.26 2.54758 220 2.58576C218.516 2.63074 216.997 2.73094 215.46 2.87667",415.49,502.41,635.3,505.1],["M241.155 1.7166C238.22 1.81132 235.369 1.92756 232.683 2.04525",415.49,502.41,652.4,504.3],["M258.097 1.54448C255.31 1.49042 252.463 1.48873 249.624 1.52277",415.49,502.41,669.4,503.9],["M274.978 2.85157C272.419 2.42317 269.576 2.11622 266.557 1.90427",415.49,502.41,686.3,504.8],["M290.313 10.7591C288.705 9.79389 287.396 8.7376 286.5 7.58576C285.756 6.62846 284.604 5.81259 283.12 5.11948",415.49,502.41,702.2,510.3],["M309.187 16.9878C305.919 16.3413 302.594 15.5491 299.501 14.6",415.49,502.41,719.8,518.2],["M327.34 20.5753C326.338 19.928 325.159 19.4303 324 19.0858C322.555 18.9673 320.877 18.7957 319.044 18.5677",415.49,502.41,738.7,522.0],["M324.189 31.8916C326.966 30.0012 328.59 28.3027 329.382 26.8014",415.49,502.41,742.3,531.8],["M310.467 38.948C311.747 38.3364 313.09 37.7154 314.5 37.0859C315.693 36.5533 316.804 36.0316 317.836 35.5209",415.49,502.41,729.6,539.6],["M295.069 47.7808C297.107 46.3112 299.583 44.7226 302.572 43.0351",415.49,502.41,714.3,547.8],["M284.915 61.2747C285.567 59.9478 286.098 58.6915 286.5 57.5859C286.5 56.7555 287.043 55.4239 288.468 53.6819",415.49,502.41,702.2,559.9],["M274.945 73.6801C277.119 72.1892 279.042 70.2224 280.688 68.0987",415.49,502.41,693.3,573.3],["M259.258 75.6783C260.664 75.6304 262.082 75.755 263.5 76.0859C264.881 76.4081 266.213 76.5083 267.493 76.4222",415.49,502.41,678.9,578.5],["M243.826 82.3409C246.019 80.5858 248.454 78.9804 251.034 77.7844",415.49,502.41,662.9,582.5],["M230.566 95.5496C232.821 94.0061 234.286 92.5605 235 91.5859C235.71 90.5863 236.608 89.4464 237.662 88.2463",415.49,502.41,649.6,594.3],["M209.486 102.587C211.027 102.529 212.54 102.369 214 102.086C216.091 101.681 218.022 101.186 219.795 100.629",415.49,502.41,630.1,604.0],["M191.599 99.7627C194.394 100.635 197.39 101.399 200.431 101.915",415.49,502.41,611.5,603.2],["M174.806 93.6658C176.369 93.9871 177.788 94.3007 179 94.5859C180.106 95.1815 181.49 95.861 183.087 96.5668",415.49,502.41,594.4,597.5],["M157.81 91.0597C160.594 91.3072 163.513 91.6889 166.341 92.1314",415.49,502.41,577.6,594.0],["M141.317 91.6732C142.798 91.9286 144.051 91.921 145 91.5859C146.118 91.1916 147.556 90.9538 149.218 90.8407",415.49,502.41,560.8,593.8],["M127.537 86.0701C129.856 87.3152 132.121 88.4366 134.239 89.3531",415.49,502.41,546.4,590.1],["M114.729 78.4098C116.758 79.7288 118.892 81.0706 121.055 82.3705",415.49,502.41,533.4,582.8],["M101.329 71.7154C102.875 71.8919 104.288 72.0132 105.5 72.0859C106.423 72.756 107.443 73.4811 108.538 74.2444",415.49,502.41,520.4,575.4],["M84.9588 68.2043C87.5355 69.1016 90.3148 69.823 93.0493 70.3917",415.49,502.41,504.5,571.7],["M72.3541 56.579C72.7648 58.3137 73.4509 60.012 74.5002 61.5859C75.2179 62.6624 76.2276 63.6405 77.4539 64.5273",415.49,502.41,490.4,563.0],["M74.5002 40.5858C73.8799 41.8265 73.1825 43.6253 72.6589 45.7315",415.49,502.41,489.1,545.6]],"r2":[["M1.5 19.2425C2.22778 18.5147 3.29184 17.8098 4.65456 17.3305",412.5,483.8,415.6,502.1],["M11.9867 17.1891C14.0121 17.7072 16.2618 18.6882 18.7032 20.3084",412.5,483.8,427.8,502.5],["M24.4363 25.0385C25.2751 25.8642 26.13 26.7637 27 27.7425C27.9989 28.8662 29.0114 29.9646 30.0343 31.0349",412.5,483.8,439.7,511.8],["M36.462 37.2694C38.7655 39.3338 41.0862 41.2354 43.3896 42.945",412.5,483.8,452.4,523.9],["M50.877 47.8477C53.7125 49.444 56.458 50.6754 59.0422 51.481",412.5,483.8,467.5,533.5],["M67.8698 52.3811C69.3926 52.1159 70.7789 51.5778 72 50.7424C72.9225 50.1112 73.8262 49.4564 74.7238 48.7904",412.5,483.8,483.8,534.4],["M80.099 44.7879C81.8807 43.512 83.7346 42.2857 85.7525 41.1976",412.5,483.8,495.4,526.8],["M91.9121 38.5817C93.9061 37.9575 96.0719 37.4851 98.4619 37.2152",412.5,483.8,507.7,521.7],["M105.155 36.9998C106.23 37.0438 107.344 37.1238 108.5 37.2424C110.015 37.3977 111.516 37.4883 112.998 37.5227",412.5,483.8,521.6,521.1],["M121.995 37.0756C125.162 36.6957 128.143 36.1098 130.851 35.4239",412.5,483.8,538.9,520.0],["M139.42 32.6411C141.096 31.9609 142.476 31.3038 143.5 30.7424C144.484 30.0569 145.748 29.2488 147.238 28.3839",412.5,483.8,555.8,514.3],["M155.134 24.3891C157.712 23.2602 160.517 22.1963 163.434 21.3321",412.5,483.8,571.8,506.7],["M172.086 19.5091C173.562 19.3366 175.038 19.2425 176.5 19.2425C177.856 19.2425 179.107 19.2796 180.268 19.3447",412.5,483.8,588.7,503.2],["M187.724 20.2526C190.646 20.7992 192.865 21.4041 195.113 21.612",412.5,483.8,603.9,504.7],["M202.505 20.6465C203.566 20.2901 204.721 19.8288 206 19.2425C207.523 18.5446 208.965 17.9465 210.321 17.4355",412.5,483.8,618.9,502.8],["M219.339 14.9497C221.59 14.5978 223.172 14.6044 224 14.7424C223.751 15.613 224.231 16.6135 226.156 17.2349",412.5,483.8,635.2,499.7],["M233.434 17.7676C235.448 17.6542 237.853 17.3905 240.709 16.9325",412.5,483.8,649.6,501.2],["M247.912 15.5582C249.056 15.3101 250.251 15.0386 251.5 14.7424C252.793 14.4356 254.003 14.1212 255.136 13.801",412.5,483.8,664.0,498.5],["M262.164 11.3648C265.097 10.1065 267.143 8.83043 268.584 7.6322",412.5,483.8,677.9,493.3],["M275.5 3.74222C273.581 2.06266 272.899 1.41936 272.564 1.50842",412.5,483.8,686.5,486.4]],"r3":[["M1.50021 47.0736C2.27785 46.957 3.28589 46.6226 4.42022 46.0007",376.53,497.21,379.5,543.7],["M9.20928 42.0176C10.4091 40.6393 11.602 38.9329 12.7039 36.8418",376.53,497.21,387.5,536.6],["M15.1214 31.0819C15.4345 30.1316 15.7287 29.1296 16.0002 28.0736C16.3141 26.853 16.6758 25.692 17.0777 24.5885",376.53,497.21,392.6,525.0],["M20.2738 18.0512C21.6891 15.8138 23.2604 13.9386 24.8495 12.39",376.53,497.21,399.1,512.4],["M30.6651 8.02199C31.9357 7.32032 33.0807 6.84606 34.0002 6.57361C34.3246 7.62798 34.7684 8.7899 35.3367 10.0075",376.53,497.21,409.5,505.5],["M39.2021 16.2739C40.657 18.1184 42.3965 19.8985 44.4365 21.4512",376.53,497.21,418.3,516.1],["M50.8542 25.0379C53.0257 25.8673 55.4157 26.435 58.0334 26.6469",376.53,497.21,431.0,523.1],["M65.3847 26.331C66.5543 26.146 67.7593 25.8953 69.0002 25.5736C70.3294 25.229 71.6364 24.9571 72.9201 24.752",376.53,497.21,445.7,522.8],["M80.9068 24.299C83.6883 24.4318 86.3266 24.8661 88.8072 25.5243",376.53,497.21,461.4,522.1],["M96.289 28.3495C98.8101 29.5989 101.087 31.0457 103.095 32.5596",376.53,497.21,476.2,527.7],["M109.006 37.9459C110.004 39.0531 110.839 40.1133 111.5 41.0736C111.746 40.2283 112.098 39.2447 112.56 38.1907",376.53,497.21,487.3,536.7],["M115.623 32.8697C116.813 31.2601 118.241 29.7314 119.915 28.493",376.53,497.21,494.3,527.9],["M125.447 25.9089C126.414 25.6917 127.431 25.5736 128.5 25.5736C129.88 25.5736 131.156 25.6345 132.353 25.7395",376.53,497.21,505.4,523.0],["M139.94 27.021C142.442 27.5919 144.814 28.189 147.493 28.5179",376.53,497.21,520.2,525.0],["M155.182 28.6017C156.372 28.4889 157.639 28.3167 159 28.0736C160.9 27.7343 162.654 27.3039 164.266 26.8116",376.53,497.21,536.3,524.9],["M174.022 22.2091C176.04 20.8047 177.355 19.4769 178 18.5736C178.799 17.8796 179.769 17.1124 180.89 16.3088",376.53,497.21,554.0,516.5],["M187.124 12.4364C189.155 11.3432 191.391 10.2859 193.788 9.34918",376.53,497.21,567.0,508.1],["M200.787 7.13115C203.123 6.56476 205.549 6.15251 208.032 5.95225",376.53,497.21,580.9,503.8],["M215.369 6.01818C216.575 6.14214 217.786 6.32528 219 6.57361C220.625 6.90594 222.234 7.20959 223.82 7.48675",376.53,497.21,596.1,504.0],["M233.528 8.91101C237.019 9.32839 240.304 9.62153 243.297 9.82033",376.53,497.21,614.9,506.6],["M253.1 10.1826C255.136 10.1898 256.796 10.1446 258 10.0737C258.931 9.67498 260.06 9.20752 261.335 8.70017",376.53,497.21,633.7,506.7],["M268.091 6.16317C270.31 5.37932 272.646 4.60471 274.949 3.9176",376.53,497.21,648.0,502.3],["M281.94 2.12966C283.209 1.87434 284.408 1.68301 285.5 1.57375C286.877 1.43606 288.178 1.49743 289.435 1.70566",376.53,497.21,662.2,499.0],["M296.833 4.3694C299.076 5.46751 301.386 6.70545 303.965 7.74678",376.53,497.21,676.9,503.3],["M311.562 9.81333C312.804 9.98046 314.113 10.0737 315.5 10.0737C317.533 10.0737 319.431 10.2604 321.191 10.5828",376.53,497.21,692.9,507.4],["M331.745 14.7909C333.784 16.1544 335.217 17.5492 336 18.5736C337.119 18.423 338.377 18.2963 339.717 18.2122",376.53,497.21,712.3,513.9],["M347.185 18.2607C349.786 18.4785 352.329 18.9373 354.488 19.7445",376.53,497.21,727.4,516.2],["M360.057 24.4007C360.493 25.4552 360.662 26.6725 360.5 28.0736C360.302 29.7939 359.937 31.129 359.425 32.1912",376.53,497.21,736.6,525.5],["M352.672 36.9659C350.407 37.7639 347.775 38.6544 344.926 40.4985",376.53,497.21,725.3,535.9],["M338.59 46.1677C337.734 47.1762 336.87 48.3053 336 49.5737C335.405 50.441 334.842 51.2783 334.309 52.0862",376.53,497.21,713.0,546.3],["M331.079 57.2165C329.885 59.2209 328.923 60.9819 328.156 62.5181",376.53,497.21,706.1,557.1],["M325.841 68.1054C325.376 69.6829 325.337 70.6373 325.5 71.0737C324.879 71.5614 323.775 72.1718 322.15 72.7976",376.53,497.21,700.5,567.7],["M314.85 74.7741C312.688 75.1808 310.194 75.5271 307.351 75.7643",376.53,497.21,687.6,572.5],["M299.791 76.1002C298.573 76.1109 297.31 76.1028 296 76.0737C295.008 76.3572 294.016 76.7271 293.031 77.1658",376.53,497.21,672.9,573.8],["M287.541 80.3077C285.773 81.5297 284.096 82.8796 282.573 84.2315",376.53,497.21,661.6,579.5],["M278.059 88.6734C277.237 89.5719 276.541 90.39 276 91.0737L274.5 95.0737",376.53,497.21,652.8,589.1],["M270 107.074L271.5 103.074",376.53,497.21,647.3,602.3]]};

  // пунктир по кривой (кубическая кривая Безье, координаты макета): черточки 7px через 8px,
  // с отступом 11px от точек на концах — в том же формате, что ROUTE_DASHES
  const bezierDashes = (p0, p1, p2, p3, dash = 7, gap = 8, pad = 11) => {
    const pt = (t) => {
      const u = 1 - t;
      return [0, 1].map((k) => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k]);
    };
    const N = 400; const pts = [pt(0)]; const acc = [0];
    for (let i = 1; i <= N; i++) {
      pts.push(pt(i / N));
      acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    }
    const at = (d) => {
      let i = acc.findIndex((v) => v >= d); if (i < 1) i = 1;
      const f = (d - acc[i - 1]) / (acc[i] - acc[i - 1] || 1);
      return [0, 1].map((k) => pts[i - 1][k] + (pts[i][k] - pts[i - 1][k]) * f);
    };
    const r = (v) => Math.round(v * 10) / 10;
    const out = [];
    for (let d = pad; d + dash <= acc[N] - pad; d += dash + gap) {
      const a = at(d); const b = at(d + dash);
      out.push([`M${r(a[0])} ${r(a[1])}L${r(b[0])} ${r(b[1])}`, 0, 0, r((a[0] + b[0]) / 2), r((a[1] + b[1]) / 2)]);
    }
    return out;
  };

  // Порядок прорисовки (как просила заказчица):
  // «Большое кольцо»: Бишкек → Балыкчы → Чолпон-Ата → … → Каракол → … → Боконбаево → Бишкек → Ала-Арча.
  // В макете первые 4 черточки идут от Ала-Арчи к Бишкеку — переносим их в конец и рисуем от Бишкека;
  // последние 5 черточек (Боконбаево → Балыкчы, замыкание кольца) убраны — вместо них своя линия Боконбаево → Бишкек
  // (с легким изгибом: прямая легла бы на подпись «Боконбаево» и слилась бы с отрезком Бишкек — Балыкчы).
  ROUTE_DASHES.r1 = [...ROUTE_DASHES.r1.slice(4, -5), ...bezierDashes([548, 591], [500, 580], [420, 585], [411, 510]), ...ROUTE_DASHES.r1.slice(0, 4).reverse()];
  // «Зимний маршрут» — как в макете: Ала-Арча → Бишкек → Балыкчы → Чолпон-Ата → Каракол → Ак-Суу → Джети-Огуз (порядок не меняем).

  const ROUTES = [
    {
      title: 'Большое кольцо Иссык-Куля',
      desc: 'Полноценное путешествие вокруг Иссык-Куля: горные ущелья, каньоны, живописные берега озера, национальная кухня и знакомство с кыргызскими традициями.',
      days: '8 дней / 7 ночей',
      fun: 'Конные прогулки, каньон Сказка, рыбалка, встреча с беркутчи, национальная кухня и Ала-Арча.',
      food: 'Завтраки и гастрономические активности по программе включены. Остальное оплачивается отдельно.',
      season: 'Октябрь — первая половина ноября, по действующей программе.',
      who: 'Кто хочет увидеть максимум Кыргызстана за одно путешествие.',
      path: 'r1', // пунктир маршрута из макета (см. ROUTE_DASHES)
      page: 'tour-issyk-ring.html', // страница программы — на нее ведет «Смотреть программу»
      dots: [[405, 504], [482, 536], [549, 515], [630, 500], [725, 532], [672, 575], [625, 597], [542, 585], [371, 544]]
        .map(([l, t]) => [l + 6, t + 6]),
      labels: [
        { lines: [['Бишкек', 69]], left: 377, top: 468, tail: { src: 'tail-2.svg', x: 405, y: 486, w: 13, h: 27, rot: 180 } },
        { lines: [['Балыкчы', 76]], left: 450, top: 498, tail: { src: 'tail-2.svg', x: 482, y: 516, w: 13, h: 27, rot: 180 } },
        { lines: [['Каракол', 76]], left: 725, top: 553, tail: { src: 'tail-2.svg', x: 725, y: 537, w: 13, h: 27, rot: 0 } },
        { lines: [['Ала-Арча', 76]], left: 339, top: 568, tail: { src: 'tail-3.svg', x: 371, y: 551, w: 13, h: 27, rot: 0 } },
        { lines: [['Боконбаево', 92, 22]], left: 441, top: 588, tail: { src: 'tail-4.svg', x: 529.19, y: 582.70, w: 13.012, h: 27.236, rot: 72.02 } },
        { lines: [['Джети-', 76], ['Огуз', 52]], left: 672, top: 594, tail: { src: 'tail-2.svg', x: 672, y: 578, w: 13, h: 27, rot: 0 } },
        { lines: [['Каньон', 67], ['Сказка', 67]], left: 573, top: 619, tail: { src: 'tail-5.svg', x: 620.18, y: 600.23, w: 13, h: 29.458, rot: 16.28 } },
        { lines: [['Чолпон-Ата', 88]], left: 518, top: 472, small: true, tail: { src: 'tail-6.svg', x: 552.72, y: 484.04, w: 13, h: 38, rot: -164.92 } },
        { lines: [['Кырчын', 71]], left: 637, top: 455, small: true, tail: { src: 'tail-6.svg', x: 635.72, y: 468.04, w: 13, h: 38, rot: -164.92 } },
      ],
    },
    {
      title: 'Северный берег Иссык-Куля',
      desc: 'Размеренное путешествие по северному побережью Иссык-Куля: отдых у озера, конные прогулки, горные ущелья, традиционная кухня и рыбалка.',
      days: '6 дней / 5 ночей',
      fun: 'Конная прогулка, рыбалка, приготовление куурдака, баня, прогулки у озера и горный пикник.',
      food: 'Завтраки и гастрономические активности по программе. Обеды и ужины оплачиваются отдельно.',
      season: 'Октябрь — первая половина ноября, по действующей программе.',
      who: 'Для\u00a0любителей спокойного отдыха, природы и\u00a0путешествий без\u00a0длительных ежедневных переездов.',
      path: 'r2',
      page: 'tour-issyk-north.html',
      dots: [[411, 502], [488, 534], [555, 513], [636, 498], [692, 488]],
      labels: [
        { lines: [['Бишкек', 69]], left: 377, top: 460, tail: { src: 'tail-2.svg', x: 405, y: 478, w: 13, h: 27, rot: 180 } },
        { lines: [['Балыкчы', 76]], left: 450, top: 490, tail: { src: 'tail-2.svg', x: 482, y: 508, w: 13, h: 27, rot: 180 } },
        { lines: [['Чолпон-Ата', 88]], left: 518, top: 464, small: true, tail: { src: 'tail-6.svg', x: 552.72, y: 476.04, w: 13, h: 38, rot: -164.92 } },
        { lines: [['Кырчын', 71]], left: 601, top: 433, small: true, tail: { src: 'tail-6.svg', x: 629.18, y: 442.01, w: 13, h: 56.1, rot: 178.97 } },
        { lines: [['Григорьевское ущелье', 156]], left: 687, top: 441, small: true, tail: { src: 'tail-6.svg', x: 686.93, y: 453.66, w: 13.9, h: 35.95, rot: -173.69 } },
      ],
    },
    {
      title: 'Зимний маршрут:\nИссык-Куль',
      desc: 'Путешествие к заснеженным вершинам Тянь-Шаня: зимние пейзажи Иссык-Куля, горнолыжный отдых в Караколе, красные скалы и горячие источники.',
      days: '6 дней / 5 ночей',
      fun: 'Горные лыжи и сноуборд, горячие источники, красные скалы Джети-Огуза и зимняя природа.',
      food: 'Завтраки, обеды и ужины предусмотрены программой.',
      season: 'Декабрь — март.',
      who: 'Для любителей зимних гор, активного отдыха и необычных природных пейзажей.',
      path: 'r3',
      page: 'tour-issyk-winter.html',
      dots: [[411, 505], [488, 537], [555, 516], [711, 511], [647, 604], [377, 545], [702, 568]],
      labels: [
        { lines: [['Бишкек', 69]], left: 377, top: 463, tail: { src: 'tail-2.svg', x: 405, y: 481, w: 13, h: 27, rot: 180 } },
        { lines: [['Балыкчы', 76]], left: 450, top: 493, tail: { src: 'tail-2.svg', x: 482, y: 511, w: 13, h: 27, rot: 180 } },
        { lines: [['Каракол', 76]], left: 721, top: 520, tail: { src: 'tail-2.svg', x: 713.28, y: 507.6, w: 13, h: 27, rot: -54.74 } },
        { lines: [['Ак-Суу', 64]], left: 712, top: 578, tail: { src: 'tail-2.svg', x: 706.06, y: 563.52, w: 12, h: 31, rot: -36.58 } },
        { lines: [['Ала-Арча', 76]], left: 339, top: 563, tail: { src: 'tail-2.svg', x: 371, y: 546, w: 13, h: 27, rot: 0 } },
        { lines: [['Джети-', 76], ['Огуз', 52]], left: 641, top: 617, tail: { src: 'tail-2.svg', x: 641, y: 601, w: 13, h: 27, rot: 0 } },
        { lines: [['Чолпон-Ата', 88]], left: 518, top: 467, small: true, tail: { src: 'tail-6.svg', x: 552.72, y: 479.04, w: 13, h: 38, rot: -164.92 } },
      ],
    },
  ];

  const el = (tag, cls, styles) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (styles) Object.assign(n.style, styles);
    return n;
  };
  const px = (v) => `${v}px`;

  const fields = {
    title: card.querySelector('[data-route-title]'),
    desc: card.querySelector('[data-route-desc]'),
    days: card.querySelector('[data-route-days]'),
    fun: card.querySelector('[data-route-fun]'),
    food: card.querySelector('[data-route-food]'),
    season: card.querySelector('[data-route-season]'),
    who: card.querySelector('[data-route-who]'),
  };
  const counter = card.querySelector('[data-route-counter]');
  const programBtn = card.querySelector('.route-card__btn');

  function renderMap(route) {
    layer.textContent = '';
    // анимация 9: пунктир рисуется чёрточка за чёрточкой по ходу маршрута,
    // точки и подписи появляются, когда линия до них доходит
    const dashes = ROUTE_DASHES[route.path];
    const DRAW = 2.2;   // секунд на весь маршрут
    const START = 0.1;
    const SVGNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', 'map-route');
    svg.setAttribute('width', '1440'); svg.setAttribute('height', '1024');
    svg.setAttribute('viewBox', '0 0 1440 1024');
    Object.assign(svg.style, { left: '0', top: '0' });
    layer.append(svg);

    // «ручка» идёт по маршруту с постоянной скоростью: каждая чёрточка прочерчивается
    // от начала к концу, промежутки между чёрточками ручка «пролетает» с той же скоростью
    const items = dashes.map(([d, ox, oy]) => {
      const path = document.createElementNS(SVGNS, 'path');
      path.setAttribute('d', d);
      path.setAttribute('transform', `translate(${ox} ${oy})`);
      path.setAttribute('class', 'map-dash');
      svg.append(path);
      const len = path.getTotalLength();
      const a = path.getPointAtLength(0); const b = path.getPointAtLength(len);
      return { path, len, a: { x: a.x + ox, y: a.y + oy }, b: { x: b.x + ox, y: b.y + oy } };
    });
    let travelled = 0; let prev = null;
    items.forEach((it) => {
      // чёрточка нарисована «задом наперёд» — рисуем её с конца
      it.reversed = prev ? Math.hypot(it.b.x - prev.x, it.b.y - prev.y) < Math.hypot(it.a.x - prev.x, it.a.y - prev.y) : false;
      const from = it.reversed ? it.b : it.a; const to = it.reversed ? it.a : it.b;
      if (prev) travelled += Math.min(Math.hypot(from.x - prev.x, from.y - prev.y), 40);
      it.startDist = travelled;
      travelled += it.len;
      prev = to;
    });
    const speed = travelled / DRAW;
    items.forEach((it) => {
      it.t = START + it.startDist / speed;
      const st = it.path.style;
      st.strokeDasharray = `${it.len} ${it.len + 1}`;
      st.setProperty('--from', String(it.reversed ? -it.len : it.len));
      st.animationDuration = `${Math.max(0.02, it.len / speed).toFixed(3)}s`;
      st.animationDelay = `${it.t.toFixed(3)}s`;
    });

    // точка появляется, когда ручка доходит до ближайшей к ней чёрточки (при двух проходах — до первой)
    const timeAt = (x, y) => {
      const dist = dashes.map(([, , , mx, my]) => Math.hypot(mx - x, my - y));
      const min = Math.min(...dist);
      const idx = dist.findIndex((v) => v <= min + 6);
      return items[idx].t;
    };
    const dotTimes = route.dots.map(([cx, cy]) => timeAt(cx, cy));
    const delayAt = (x, y) => {
      // подпись появляется вместе со своей точкой (ближайшей к хвостику)
      let best = 0; let bd = Infinity;
      route.dots.forEach(([cx, cy], i) => { const v = Math.hypot(cx - x, cy - y); if (v < bd) { bd = v; best = i; } });
      return `${dotTimes[best].toFixed(2)}s`;
    };

    route.dots.forEach(([cx, cy], i) => {
      const img = el('img', 'map-dot', { left: px(cx - 9), top: px(cy - 9), animationDelay: `${dotTimes[i].toFixed(2)}s` });
      img.src = T + 'pin-dot.svg'; img.alt = '';
      layer.append(img);
    });

    route.labels.forEach((lb) => {
      const t = lb.tail;
      const appear = delayAt(t.x + t.w / 2, t.y + t.h / 2);
      const tail = el('div', 'map-tail', {
        left: px(t.x), top: px(t.y), width: px(t.w), height: px(t.h), transform: `rotate(${t.rot}deg)`, animationDelay: appear,
      });
      const timg = el('img'); timg.src = T + t.src; timg.alt = '';
      tail.append(timg);
      layer.append(tail);

      const label = el('div', 'map-label' + (lb.small ? ' map-label--small' : ''), { left: px(lb.left), top: px(lb.top), animationDelay: appear });
      const lines = lb.lines || [[lb.text]];
      lines.forEach(([text, w, h]) => {
        const line = el('span', 'map-label__line');
        line.textContent = text;
        if (w) { line.style.width = px(w); line.style.padding = '0'; line.style.textAlign = 'center'; }
        if (h) { line.style.height = px(h); line.style.lineHeight = px(h); }
        label.append(line);
      });
      layer.append(label);
    });
  }

  let current = 0;
  let revealed = false; // карта уже появлялась на экране — маршрут можно рисовать
  let swapTimer = null;

  // анимация 9: перезапуск прорисовки маршрута
  function playDraw() {
    layer.classList.remove('is-play');
    void layer.offsetWidth; // сброс, чтобы анимация началась заново
    layer.classList.add('is-play');
  }

  function fill(i) {
    current = (i + ROUTES.length) % ROUTES.length;
    const r = ROUTES[current];
    Object.keys(fields).forEach((k) => { fields[k].textContent = r[k]; });
    if (programBtn && r.page) programBtn.href = r.page;
    counter.textContent = `${current + 1}/${ROUTES.length}`;
    renderMap(r);
  }

  // анимация 2: старый маршрут уезжает влево, новый мягко появляется справа
  function show(i) {
    clearTimeout(swapTimer);
    card.classList.add('is-leaving');
    layer.classList.add('is-leaving');
    swapTimer = setTimeout(() => {
      fill(i);
      card.classList.remove('is-leaving');
      layer.classList.remove('is-leaving');
      card.classList.add('is-entering');
      requestAnimationFrame(() => requestAnimationFrame(() => card.classList.remove('is-entering')));
      if (revealed) playDraw();
    }, 280);
  }

  card.querySelector('[data-route-prev]').addEventListener('click', () => show(current - 1));
  card.querySelector('[data-route-next]').addEventListener('click', () => show(current + 1));
  fill(0);

  // маршрут рисуется только когда на экране видна сама карта (а не просто начало блока):
  // ждём, пока карта покажется хотя бы на 60%
  const mapImg = layer.closest('.stage').querySelector('.routes__map');
  if ('IntersectionObserver' in window && mapImg) {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.6)) { revealed = true; playDraw(); io.disconnect(); }
    }, { threshold: [0.6] });
    io.observe(mapImg);
  } else {
    revealed = true; playDraw();
  }
})();

/* ---------- 3. Отзывы: две карточки, стрелки листают по одному ----------
   text — полный текст отзыва (абзацы разделяются пустой строкой \n\n).
   В карточке он сам обрезается до 4 строк с «...», поэтому карточки всегда одного размера,
   какой бы длины ни был отзыв. «Читать отзыв полностью» раскрывает карточку вниз,
   блок отзывов при этом растет и отодвигает все, что ниже (экран не сдвигается). */
(function reviewsSlider() {
  const REVIEWS = [
    {
      name: 'Анна и Максим',
      trip: 'Аренда автодома. Путешествие по северному берегу Иссык-Куля',
      days: '6 дней',
      text: 'Первый раз ехали на автодоме. За шесть дней прошли северный берег, Каракол и южную часть озера. Больше всего переживали за размер машины...',
    },
    {
      name: 'Кирилл',
      trip: 'Аренда автодома. Путешествие по северному берегу Иссык-Куля',
      days: '6 дней',
      text: 'Первый раз ехали на автодоме. За шесть дней прошли северный берег, Каракол и южную часть озера. Больше всего переживали за размер машины',
    },
  ];

  const section = document.querySelector('.reviews');
  const stage = section && section.querySelector('.stage');
  const page = document.querySelector('.page');
  const slots = [...document.querySelectorAll('[data-review-slot]')];
  if (!section || !slots.length) return;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const n = REVIEWS.length;
  let start = 0;
  const reviewAt = (i) => REVIEWS[(start + i) % n];
  const render = () => {
    slots.forEach((slot, i) => {
      const r = reviewAt(i);
      slot.querySelector('[data-review-name]').textContent = r.name;
      slot.querySelector('[data-review-trip]').textContent = r.trip;
      slot.querySelector('[data-review-days]').textContent = r.days;
      slot.querySelector('[data-review-text]').textContent = r.text;
    });
  };

  /* --- раскрытие карточки вниз --- */
  const EXPAND_MS = reduce ? 0 : 500;   // = длительность в css/style.css
  const CARD_H = 370;                   // высота карточки по макету
  const MORE_TOP = 325;                 // положение «Читать отзыв полностью» по макету
  const STAGE_H = parseFloat(getComputedStyle(stage).height) || 1024; // обычная высота блока (из css/style.css)
  const LABEL_OPEN = 'Читать отзыв полностью';
  const LABEL_CLOSE = 'Свернуть отзыв';
  const grow = new Map();               // слот → насколько карточка сейчас выросла
  const timers = new Map();

  // высота документа: страница масштабирована, поэтому body выставляем вручную (как в fitToScreen)
  const setBodyHeight = (pageH) => {
    const scale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--page-scale')) || 1;
    document.body.style.height = `${Math.ceil(pageH * scale)}px`;
  };
  // блок отзывов вырастает на столько, на сколько выросла самая длинная карточка, — все, что ниже, отодвигается
  const syncStage = () => {
    const extra = Math.max(0, ...grow.values());
    const before = stage.offsetHeight;
    const target = STAGE_H + extra;
    stage.style.height = `${target}px`;
    if (target > before) setBodyHeight(page.offsetHeight - before + target);       // растем — сразу даем место
    else setTimeout(() => setBodyHeight(page.offsetHeight), EXPAND_MS + 30);       // сжимаемся — после анимации
  };
  const expand = (slot) => {
    const card = slot.querySelector('.review__card');
    const text = slot.querySelector('[data-review-text]');
    const more = slot.querySelector('[data-review-open]');
    clearTimeout(timers.get(slot));
    const h0 = text.offsetHeight;                 // высота 4 строк
    text.style.height = `${h0}px`;
    slot.classList.add('is-unclamped');            // снимаем обрезку — текст целиком, но пока в старой высоте
    const delta = Math.max(0, text.scrollHeight - h0);
    grow.set(slot, delta);
    void text.offsetWidth;
    text.style.height = `${h0 + delta}px`;
    card.style.height = `${CARD_H + delta}px`;
    more.style.top = `${MORE_TOP + delta}px`;
    slot.classList.add('is-open');
    more.textContent = LABEL_CLOSE;
    more.setAttribute('aria-expanded', 'true');
    syncStage();
  };
  const collapse = (slot) => {
    if (!slot.classList.contains('is-open')) return;
    const card = slot.querySelector('.review__card');
    const text = slot.querySelector('[data-review-text]');
    const more = slot.querySelector('[data-review-open]');
    text.scrollTop = 0;
    slot.classList.remove('is-open');
    text.style.height = `${text.offsetHeight - (grow.get(slot) || 0)}px`;
    card.style.height = '';
    more.style.top = '';
    more.textContent = LABEL_OPEN;
    more.setAttribute('aria-expanded', 'false');
    grow.set(slot, 0);
    syncStage();
    timers.set(slot, setTimeout(() => {          // после анимации возвращаем обрезку с «...»
      slot.classList.remove('is-unclamped');
      text.style.height = '';
    }, EXPAND_MS));
  };
  slots.forEach((slot) => {
    const more = slot.querySelector('[data-review-open]');
    more.setAttribute('aria-expanded', 'false');
    more.addEventListener('click', () => (slot.classList.contains('is-open') ? collapse(slot) : expand(slot)));
  });

  /* --- плавная смена: текст уходит в сторону стрелки и гаснет → подменяем → новый выезжает с другой стороны
     (длительности — в css/style.css, блок «плавная смена отзывов») --- */
  const LEAVE_MS = 380;  // 0.22s уход + самая большая задержка «волны» 0.15s
  const CALM_MS = 300;   // после начала въезда можно листать снова
  let busy = false;
  let queued = 0;
  const go = (step) => {
    if (busy) { queued = step; return; }   // быстрый повторный клик — выполним сразу после текущей смены
    const open = slots.filter((s) => s.classList.contains('is-open'));
    if (open.length) {                      // сначала сворачиваем раскрытые отзывы
      busy = true;
      open.forEach(collapse);
      setTimeout(() => { busy = false; go(step); }, EXPAND_MS);
      return;
    }
    if (reduce) { start = (start + step + n) % n; render(); return; }
    busy = true;
    section.style.setProperty('--rev-dir', step);
    section.classList.add('is-leaving');
    setTimeout(() => {
      start = (start + step + n) % n;
      render();
      section.classList.add('is-entering');      // новый текст сразу ставим «за краем», без анимации
      section.classList.remove('is-leaving');
      void section.offsetWidth;                  // браузер фиксирует стартовое положение
      section.classList.remove('is-entering');   // …и плавно возвращает текст на место
      setTimeout(() => {
        busy = false;
        if (queued) { const q = queued; queued = 0; go(q); }
      }, CALM_MS);
    }, LEAVE_MS);
  };
  document.querySelector('[data-review-next]').addEventListener('click', () => go(1));
  document.querySelector('[data-review-prev]').addEventListener('click', () => go(-1));
  render();
})();

/* ---------- Календарь «даты заезда и выезда» (общий для форм) ----------
   rangeCalendar(cal, { toggle, onApply }) — оживляет разметку .calendar[data-calendar]:
   два месяца, выбор диапазона, предпросмотр под курсором, «Применить».
   toggle — кнопка/поле, которое открывает календарь; onApply(from, to) — выбранные даты. */
function rangeCalendar(cal, { toggle, onApply } = {}) {
  const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const WD = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let view = new Date(today.getFullYear(), today.getMonth(), 1);
  let from = null; let to = null;

  const nightsWord = (n) => {
    const m10 = n % 10; const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'ночь';
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'ночи';
    return 'ночей';
  };
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
      days.push({ btn, t });
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
    const preview = a !== null && b === null && hoverT !== null && hoverT > a;
    if (preview) b = hoverT;
    let i = 0;
    days.forEach(({ btn, t }) => {
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

    let text = 'Выберите даты заезда и выезда';
    if (a !== null && b !== null) {
      const n = Math.round((b - a) / 86400000);
      text = `${fmtLong(new Date(a))} — ${fmtLong(new Date(b))}, ${n} ${nightsWord(n)}`;
    } else if (a !== null) {
      text = `${fmtLong(new Date(a))} — выберите дату выезда`;
    }
    if (summary.textContent !== text) summary.textContent = text;
    applyBtn.disabled = !(from && to);
  }

  function pick(date) {
    const t = date.getTime();
    if (!from || to || t <= from.getTime()) { from = date; to = null; } else { to = date; }
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

/* ---------- 4. Форма «Соберем поездку под вас» ---------- */
(function tripForm() {
  const form = document.querySelector('[data-trip-form]');
  if (!form) return;

  const steps = [...form.querySelectorAll('[data-step]')];
  const bars = [...form.querySelectorAll('[data-progress]')];
  const errorEl = form.querySelector('[data-trip-error]');             // под галочкой согласия
  const contactErrorEl = form.querySelector('[data-contact-error]');   // под полями «Имя» и «Телефон»
  const clearContactError = () => {
    contactErrorEl.hidden = true;
    form.querySelectorAll('.trip-input input.is-invalid').forEach((i) => i.classList.remove('is-invalid'));
  };
  // как только человек начал исправлять — убираем подсветку и сообщение
  ['name', 'phone'].forEach((n) => form.elements[n].addEventListener('input', clearContactError));
  form.elements.consent.addEventListener('change', () => { errorEl.hidden = true; });

  // плавная смена шагов: текущий уплывает и гаснет, новый выплывает с другой стороны,
  // его элементы — по очереди. Вперед — влево, «Назад» — вправо. Шаг 3 («Спасибо») — со своей анимацией.
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const STEP_OUT_MS = 260;   // = длительность step-out в css/style.css
  let curStep = 0;
  let swapTimer = null;
  let settleTimer = null;
  function goTo(n) {
    bars.forEach((b) => b.classList.toggle('is-done', Number(b.dataset.progress) <= n));
    errorEl.hidden = true;
    clearContactError();
    const dir = n >= curStep ? 1 : -1;
    const fromEl = steps.find((s) => !s.hidden);
    const toEl = steps.find((s) => Number(s.dataset.step) === n);
    const animate = !reduceMotion && curStep !== 0 && fromEl && fromEl !== toEl;

    const showNew = () => {
      steps.forEach((s) => { s.hidden = s !== toEl; s.classList.remove('step-out', 'step-in'); });
      curStep = n;
      if (!animate || n === 3) return;
      [...toEl.children].forEach((c, i) => c.style.setProperty('--si', i));
      toEl.style.setProperty('--sdir', dir);
      void toEl.offsetWidth;                 // сброс, чтобы анимация началась заново
      toEl.classList.add('step-in');
      clearTimeout(settleTimer);              // после появления снимаем класс — чтобы ошибка или календарь
      settleTimer = setTimeout(() => toEl.classList.remove('step-in'), 1100); // потом не «выплывали» повторно
    };

    clearTimeout(swapTimer);
    if (!animate) { showNew(); return; }
    fromEl.style.setProperty('--sdir', dir);
    fromEl.classList.remove('step-in');
    fromEl.classList.add('step-out');
    swapTimer = setTimeout(showNew, STEP_OUT_MS);
  }

  // шаг 1: ничего не выбрано заранее; «Продолжить» включается после выбора варианта
  const nextBtn = form.querySelector('[data-trip-next]');
  const kindInputs = [...form.querySelectorAll('input[name="kind"]')];
  const syncNext = () => { nextBtn.disabled = !kindInputs.some((i) => i.checked); };
  kindInputs.forEach((i) => i.addEventListener('change', syncNext));
  syncNext();
  nextBtn.addEventListener('click', () => goTo(2));
  form.querySelector('[data-trip-back]').addEventListener('click', () => goTo(1));

  // количество человек
  const countEl = form.querySelector('[data-count]');
  let count = 4;
  // Рукописный шрифт Caveat рисует цифры со смещением внутри своего места,
  // поэтому центрируем не «коробку» символа, а сам рисунок цифры (по горизонтали и вертикали).
  const inkCanvas = document.createElement('canvas').getContext('2d');
  const centerInk = (el) => {
    const cs = getComputedStyle(el);
    inkCanvas.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const m = inkCanvas.measureText(el.textContent);
    const lineH = parseFloat(cs.lineHeight);
    const dx = m.width / 2 - (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2;
    const baseline = (lineH - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent;
    const dy = lineH / 2 - (baseline - (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
    el.style.translate = `${dx.toFixed(2)}px ${dy.toFixed(2)}px`;
  };
  // шрифт грузим явно: пока форма скрыта, браузер его не запрашивает, и замер был бы по запасному шрифту
  const inkFontReady = document.fonts.load('400 48px "Caveat"', '0123456789').catch(() => {});
  const setCount = (v) => {
    count = Math.min(20, Math.max(1, v));
    countEl.textContent = count;
    countEl.style.fontSize = count >= 10 ? '40px' : ''; // двузначные чуть меньше, чтобы не касались кнопок
    inkFontReady.then(() => centerInk(countEl));
  };
  setCount(count);
  form.querySelector('[data-count-minus]').addEventListener('click', () => setCount(count - 1));
  form.querySelector('[data-count-plus]').addEventListener('click', () => setCount(count + 1));

  // даты — общий календарь rangeCalendar (см. выше)
  const datesBtn = form.querySelector('[data-dates-toggle]');
  const datesLabel = form.querySelector('[data-dates-label]');
  const unknownBtn = form.querySelector('[data-dates-unknown]');
  let datesUnknown = false;
  const calendar = rangeCalendar(form.querySelector('[data-calendar]'), {
    toggle: datesBtn,
    onApply(from, to) {
      datesLabel.textContent = `${calendar.fmtShort(from)} — ${calendar.fmtShort(to)}`;
      datesBtn.classList.add('is-active');
      unknownBtn.classList.remove('is-active');
      datesUnknown = false;
    },
  });
  const closeCal = calendar.close;
  unknownBtn.addEventListener('click', () => {
    datesUnknown = !datesUnknown;
    unknownBtn.classList.toggle('is-active', datesUnknown);
    if (datesUnknown) {
      calendar.reset();
      datesLabel.textContent = 'Выбрать даты';
      datesBtn.classList.remove('is-active');
      closeCal();
    }
  });

  // отправка (пока без реальной отправки — показываем экран «Спасибо»)
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = form.elements.name.value.trim();
    const phone = form.elements.phone.value.trim();
    const consent = form.elements.consent.checked;
    clearContactError();
    errorEl.hidden = true;

    // имя и телефон — сообщение прямо под полями, незаполненное поле подсвечиваем
    const bad = [];
    let contactMsg = '';
    const phoneShort = phone && phone.replace(/\D/g, '').length < 10;
    if (!name && !phone) {                       // ничего не заполнено
      contactMsg = 'Укажите имя и телефон, чтобы мы могли связаться с вами.';
      bad.push(form.elements.name, form.elements.phone);
    } else if (!phone) {                         // есть только имя
      contactMsg = 'Укажите телефон, чтобы мы могли связаться с вами.';
      bad.push(form.elements.phone);
    } else if (!name && phoneShort) {            // нет имени, а номер слишком короткий
      contactMsg = 'Укажите имя и проверьте номер — в нем должно быть не меньше 10 цифр.';
      bad.push(form.elements.name, form.elements.phone);
    } else if (!name) {                          // есть только номер
      contactMsg = 'Укажите имя, чтобы мы знали, как к вам обращаться.';
      bad.push(form.elements.name);
    } else if (phoneShort) {                     // оба поля заполнены, но номер короткий
      contactMsg = 'Проверьте номер телефона — в нем должно быть не меньше 10 цифр.';
      bad.push(form.elements.phone);
    }
    if (contactMsg) {
      contactErrorEl.textContent = contactMsg;
      contactErrorEl.hidden = false;
      bad.forEach((input) => input.classList.add('is-invalid'));
      bad[0].focus({ preventScroll: true });
      return;
    }
    // согласие — сообщение под галочкой
    if (!consent) { errorEl.textContent = 'Нужно согласие на обработку персональных данных.'; errorEl.hidden = false; return; }

    // данные заявки — пригодятся, когда подключим отправку на почту / в Telegram
    const data = {
      kind: form.elements.kind.value,
      dates: datesUnknown ? 'пока не знают' : (calendar.range ? `${calendar.fmtLong(calendar.range.from)} — ${calendar.fmtLong(calendar.range.to)}` : 'не выбраны'),
      people: count, name, phone,
    };
    console.info('Заявка (отправка еще не подключена):', data);
    closeCal();
    goTo(3);
  });

  goTo(1);
})();

/* ---------- 6. Легкий параллакс (анимация 8) ----------
   Фото и марки коллажей при прокрутке чуть-чуть отстают или опережают страницу.
   Фоны и тексты стоят на месте — так ничего не «открывает» края блоков.
   «Точка покоя» — когда блок посередине экрана (первый экран — сразу при открытии):
   в этот момент коллаж стоит ровно как в макете, а сдвиг не больше MAX пикселей.
   ЧТОБЫ ВЫКЛЮЧИТЬ: поставить PARALLAX_ON = false. */
(function parallax() {
  const PARALLAX_ON = true;
  if (!PARALLAX_ON) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // скорость: минус — элемент «ближе» и уезжает вверх быстрее, плюс — «дальше» и отстаёт
  const LAYERS = [
    ['.hero__photo-rv', -0.05], ['.hero__stamp-horses', -0.12], ['.hero__stamp-red', -0.14],
    ['.hero__photo-bw', -0.08], ['.ov-photo-bw', -0.08], ['.hero__stamp-round', -0.12],
    ['.formats__cloud-1', 0.12], ['.formats__cloud-2', 0.1], ['.formats__clouds-a', 0.14],
    ['.formats__clouds-b', 0.1],
    ['.first__stamp-red', -0.1], ['.first__photo-bw', -0.06],
    // пунктир маршрута (.routes__route-top, .routes__dot, .routes__pin) не двигаем: он продолжает линию из блока выше
    ['.routes__photo-sunset', -0.05], ['.routes__photo-bw', -0.04],
    ['.routes__stamp-round', -0.1], ['.routes__stamp-horses', -0.12], ['.routes__stamp-red', -0.1],
    ['.faq__photo', -0.07], ['.faq__stamp-horses', -0.12], ['.faq__stamp-round', -0.1],
    ['.trip__photo', -0.06], ['.trip__stamp-red', -0.1], ['.trip__stamp-horses', -0.12], ['.trip__photo-bw', -0.08],
  ];
  const SOFT = 0.35; // общий «ослабитель» скоростей из списка выше
  const MAX = 18;    // не сдвигаем дальше, чем на 18px (раньше было 90 — коллажи «съезжали»)
  // элементы общего слоя поверх стыков привязываем к блоку, к которому они относятся
  const OVERLAY_HOME = { 'ov-photo-bw': '.hero' };
  const items = [];
  LAYERS.forEach(([sel, speed]) => document.querySelectorAll(sel).forEach((node) => {
    const homeSel = Object.keys(OVERLAY_HOME).find((c) => node.classList.contains(c));
    const home = homeSel ? document.querySelector(OVERLAY_HOME[homeSel]) : node.closest('.section');
    if (!home) return;
    node.style.willChange = 'translate';
    items.push({ node, speed, home });
  }));
  if (!items.length) return;

  const scale = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--page-scale')) || 1;

  // «точка покоя» каждого блока в координатах макета: прокрутка, при которой
  // середина блока совпадает с серединой экрана; у первого экрана — 0 (страница только открыта)
  function measure() {
    const vh = window.innerHeight / scale();
    items.forEach((it) => {
      it.rest = it.home.classList.contains('hero') ? 0
        : it.home.offsetTop + it.home.offsetHeight / 2 - vh / 2;
    });
    update();
  }
  function update() {
    const y = window.scrollY / scale(); // прокрутка в координатах макета
    items.forEach((it) => {
      const shift = Math.max(-MAX, Math.min(MAX, (y - it.rest) * it.speed * SOFT));
      it.node.style.translate = Math.abs(shift) < 0.05 ? '' : `0 ${shift.toFixed(1)}px`;
    });
  }

  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { update(); ticking = false; });
  }, { passive: true });
  window.addEventListener('resize', () => requestAnimationFrame(measure));
  window.addEventListener('load', () => requestAnimationFrame(measure));
  measure();
})();

/* ---------- 7. Анимации 2 и 8: блоки появляются при прокрутке ----------
   Когда блок доходит до экрана, ему добавляется класс is-revealed — заголовок и карточки
   выплывают снизу по очереди (стили — в css/style.css). Срабатывает один раз на блок. */
(function revealOnScroll() {
  const html = document.documentElement;
  if (!html.classList.contains('reveal-on')) return;
  const sections = [...document.querySelectorAll('.section:not(.hero)')];

  // задержки по порядку элементов в блоке (секунды)
  const stagger = (sel, list) => document.querySelectorAll(sel).forEach((el, i) => {
    if (list[i] !== undefined) el.style.setProperty('--rd', `${list[i]}s`);
  });
  stagger('.first-step', [0.2, 0.35, 0.5, 0.65]);
  stagger('.faq-item', [0.25, 0.55, 0.85]);       // анимация 8: вопросы по очереди
  stagger('.faq__divider', [0.45, 0.75, 1.05]);   // …и линия под каждым сразу после него

  const show = (s) => s.classList.add('is-revealed');
  if (!('IntersectionObserver' in window)) { sections.forEach(show); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { show(e.target); io.unobserve(e.target); } });
  }, { threshold: 0.2 });
  sections.forEach((s) => io.observe(s));
})();

/* ---------- 8. Значки-указатели в блоке «Первый раз за рулем» ----------
   Наведение на значок или на его текст: значок приподнимается и качается на «столбике»,
   столбик и заголовок подсвечиваются. Пары «значок — текст» связаны атрибутом data-sign.
   Качание всегда доигрывает до конца, даже если курсор уже ушел, — без рывков. */
(function signsHover() {
  const groups = {};
  document.querySelectorAll('.first [data-sign]').forEach((el) => {
    (groups[el.dataset.sign] = groups[el.dataset.sign] || []).push(el);
  });
  Object.values(groups).forEach((els) => {
    const sign = els.find((el) => el.classList.contains('first__stamp'));
    if (!sign) return;
    sign.addEventListener('animationend', () => sign.classList.remove('is-swaying'));
    els.forEach((el) => {
      el.addEventListener('mouseenter', () => {
        els.forEach((x) => x.classList.add('is-hover'));
        if (!sign.classList.contains('is-swaying')) sign.classList.add('is-swaying');
      });
      el.addEventListener('mouseleave', () => els.forEach((x) => x.classList.remove('is-hover')));
    });
  });
})();

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
