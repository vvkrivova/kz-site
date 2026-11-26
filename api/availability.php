<?php
/* =========================================================
   Tian Way — занятость автодомов из «Онлайн-записи» Битрикс24 для страницы аренды.
   GET /api/availability[?vehicle=forland-s1] — всегда период «сегодня — +400 дней» по Бишкеку (from/to в адресе
   не учитываются: иначе каждый новый период шел бы в Битрикс мимо кэша и тратил его лимит).
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

$from = date('Y-m-d');
$to = date('Y-m-d', time() + 400 * 86400);
$vehicle = isset($_GET['vehicle']) && is_string($_GET['vehicle']) ? $_GET['vehicle'] : '';
if ($vehicle !== '' && !isset(TW_CARS[$vehicle])) {
    out(array('ok' => false, 'reason' => 'vehicle'), 400);
}

// один кэш на всех (все машины, сегодняшний период) — 60 секунд
$cache = tw_tmp('busy-' . $from . '.json');
$busy = null;
if (is_file($cache) && filemtime($cache) > time() - 60) {
    $busy = json_decode((string) file_get_contents($cache), true);
}
if (!is_array($busy)) {
    try {
        $busy = tw_busy($from, $to);
    } catch (TwBitrixError $e) {
        error_log('Tian Way availability: ' . $e->getMessage());
        out(array('ok' => false, 'reason' => 'check'), 503);
    }
    @file_put_contents($cache, json_encode($busy));
}
out(array('ok' => true, 'busy' => $vehicle !== '' ? array($vehicle => $busy[$vehicle]) : $busy));
