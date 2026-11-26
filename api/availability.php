<?php
/* =========================================================
   Tian Way — занятость автодомов из «Онлайн-записи» Битрикс24 для страницы аренды.
   GET /api/availability?from=2026-12-01&to=2027-12-01[&vehicle=forland-s1]
   Ответ: {"ok":true,"busy":{"forland-s1":[["2026-12-10","2026-12-17"]],…}} — только интервалы занятости,
   без названий записей, описаний и данных клиентов. Интервал — с дня выдачи до дня возврата.
   Ответ хранится 60 секунд (хостинг медленный, а Битрикс ограничивает частоту запросов).
   Битрикс не подключен — {"ok":false,"reason":"off"}: сайт берет даты из data/rent.json (панель).
   ========================================================= */

require __DIR__ . '/bitrix.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function out($data, $code = 200)
{
    http_response_code($code);
    echo json_encode($data);
    exit;
}

if (!tw_configured()) {
    out(array('ok' => false, 'reason' => 'off'));
}

$from = isset($_GET['from']) ? $_GET['from'] : date('Y-m-d');
$to = isset($_GET['to']) ? $_GET['to'] : date('Y-m-d', time() + 400 * 86400);
if (!tw_valid_day($from) || !tw_valid_day($to) || $to <= $from || tw_day_ts($to) - tw_day_ts($from) > 800 * 86400) {
    out(array('ok' => false, 'reason' => 'dates'), 400);
}
$cars = array_keys(TW_CARS);
if (!empty($_GET['vehicle'])) {
    if (!isset(TW_CARS[$_GET['vehicle']])) {
        out(array('ok' => false, 'reason' => 'vehicle'), 400);
    }
    $cars = array($_GET['vehicle']);
}

$cache = tw_tmp('busy-' . md5($from . '|' . $to . '|' . implode(',', $cars)) . '.json');
if (is_file($cache) && filemtime($cache) > time() - 60) {
    $cached = json_decode((string) file_get_contents($cache), true);
    if (is_array($cached)) {
        out(array('ok' => true, 'busy' => $cached));
    }
}

try {
    $busy = tw_busy($from, $to, $cars);
} catch (TwBitrixError $e) {
    error_log('Tian Way availability: ' . $e->getMessage());
    out(array('ok' => false, 'reason' => 'check'), 503);
}
@file_put_contents($cache, json_encode($busy));
out(array('ok' => true, 'busy' => $busy));
