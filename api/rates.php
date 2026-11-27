<?php
/* =========================================================
   Tian Way — курс Нацбанка КР для показа цен в долларах и рублях (ТЗ № 1).
   GET /api/rates → {"ok":true,"date":"2026-11-27","USD":87.45,"RUB":1.1,"source":"НБКР"} (сомов за 1 единицу)
   или {"ok":false,"reason":"none"|"stale"} — тогда сайт показывает только сомы. Логика и проверки — api/rates-lib.php.
   Ответ браузер может хранить 10 минут: курс меняется раз в день.
   ========================================================= */

require __DIR__ . '/rates-lib.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=600');
echo json_encode(tw_rates());
