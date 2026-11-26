<?php
/* =========================================================
   Tian Way — автоматическая бронь автодома (ТЗ «Автоматическое бронирование автодомов Tian Way», дополнение к ТЗ интеграции).

   Когда сделка аренды входит в стадию «Бронь подтверждена» (C2:FINAL_INVOICE), робот Битрикс24 «Исходящий вебхук»
   вызывает этот адрес:  https://tianway.kg/api/bitrix/confirm-booking.php?deal_id={{ID}}&secret=<пароль>
   (подойдет GET или POST; номер сделки можно передать и как deal_id, и как document_id — так робот шлет по умолчанию).
   Пароль — секрет GitHub BOOKING_ROBOT_SECRET → lead-config.php (только на хостинге); без него обработчик выключен.

   Что делает (под общей серверной блокировкой — одновременные вызовы идут по очереди):
     1. Читает сделку (crm.deal.get). Не воронка аренды или уже не «Бронь подтверждена» — ничего не делает (устаревший вызов).
     2. Машина и даты из полей сделки → интервал по Бишкеку (выдача TW_PICKUP_TIME, возврат TW_DROPOFF_TIME, запас TW_PREP_BUFFER).
        Чего-то нет или возврат не позже выдачи — комментарий менеджеру, сделка → «Уточняем даты».
     3. Ищет уже созданную бронь этой сделки (по метке «сделка #ID» в названии записи и по сохраненному номеру).
        Есть с теми же машиной и датами — проверяет связь со сделкой и заканчивает (повторный вызов не создает вторую бронь).
        Есть с другими машиной или датами — вторую не создает, пишет менеджеру (перенос — вручную в «Онлайн-записи»).
     4. Читает брони машины (все страницы). Пересечение — комментарий менеджеру с датами, сделка → «Уточняем даты».
        Ошибка чтения календаря — не «свободно»: брони нет, менеджеру — комментарий, повтор — новым входом в стадию.
     5. Свободно — создает запись (booking.v1.booking.add), запоминает ее номер, привязывает к сделке
        (booking.v1.booking.externalData.set, прежние связи записи сохраняются), проверяет запись и связь, пишет менеджеру.
   Ответ: JSON {"ok":true|false, "result": "created"|"exists"|"skipped"|"conflict"|"invalid"|"mismatch"|"error", ...}.
   ========================================================= */

require dirname(__DIR__) . '/bitrix.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function reply($data, $code = 200)
{
    http_response_code($code);
    echo json_encode($data);
    exit;
}

function param($name)
{
    if (isset($_POST[$name]) && is_string($_POST[$name])) {
        return $_POST[$name];
    }
    if (isset($_GET[$name]) && is_string($_GET[$name])) {
        return $_GET[$name];
    }
    return '';
}

// ---------- пароль робота ----------
$secret = tw_robot_secret();
if (!tw_configured() || $secret === '') {
    reply(array('ok' => false, 'result' => 'off'), 503);
}
$given = param('secret');
if ($given === '' && isset($_SERVER['HTTP_X_TIANWAY_SECRET'])) {
    $given = (string) $_SERVER['HTTP_X_TIANWAY_SECRET'];
}
if (!hash_equals($secret, $given)) {
    reply(array('ok' => false, 'result' => 'forbidden'), 403); // без пароля — ни чтения сделки, ни брони
}

// ---------- номер сделки: deal_id или document_id (['crm', 'CCrmDocumentDeal', 'DEAL_2']) ----------
$dealId = (int) param('deal_id');
if (!$dealId) {
    $doc = isset($_POST['document_id']) ? $_POST['document_id'] : (isset($_GET['document_id']) ? $_GET['document_id'] : '');
    $doc = is_array($doc) ? implode(' ', array_map('strval', $doc)) : (string) $doc;
    if (preg_match('/DEAL_(\d+)/', $doc, $m)) {
        $dealId = (int) $m[1];
    }
}
if ($dealId <= 0) {
    reply(array('ok' => false, 'result' => 'invalid', 'reason' => 'нет номера сделки'), 400);
}

// ---------- одна обработка за раз ----------
$lock = fopen(tw_tmp('robot-booking.lock'), 'c');
if (!$lock || !flock($lock, LOCK_EX)) {
    reply(array('ok' => false, 'result' => 'error', 'reason' => 'блокировка'), 503);
}

$fmt = function ($ts) {
    return date('d.m.Y H:i', $ts);
};
$stateFile = tw_tmp('robot-deal-' . $dealId . '.json');

try {
    // 1. сделка
    $deal = tw_call('crm.deal.get', array('id' => $dealId));
    $deal = isset($deal['result']) && is_array($deal['result']) ? $deal['result'] : null;
    if (!$deal) {
        throw new TwBitrixError('crm.deal.get: сделка не найдена');
    }
    if ((int) $deal['CATEGORY_ID'] !== (int) TW_RENT['CATEGORY_ID'] || $deal['STAGE_ID'] !== TW_STAGE_CONFIRMED) {
        reply(array('ok' => true, 'result' => 'skipped', 'stage' => $deal['STAGE_ID']));
    }

    // 2. машина и даты
    $carKey = '';
    $option = isset($deal[TW_UF_CAR]) ? $deal[TW_UF_CAR] : '';
    $option = is_array($option) ? reset($option) : $option;
    foreach (TW_CARS as $key => $c) {
        if ((string) $c['option'] === (string) $option) {
            $carKey = $key;
        }
    }
    $fields = tw_deal_fields();
    $from = tw_deal_ts($fields, TW_UF_PICKUP, isset($deal[TW_UF_PICKUP]) ? $deal[TW_UF_PICKUP] : '', TW_PICKUP_TIME);
    $to = tw_deal_ts($fields, TW_UF_DROPOFF, isset($deal[TW_UF_DROPOFF]) ? $deal[TW_UF_DROPOFF] : '', TW_DROPOFF_TIME);
    if (!$carKey || !$from || !$to || $to <= $from) {
        $why = !$carKey ? 'не выбран автодом' : ((!$from || !$to) ? 'не заполнены даты выдачи и возврата' : 'дата возврата не позже даты выдачи');
        tw_deal_comment($dealId, "Автоматическая бронь не создана: $why. Сделка возвращена в «Уточняем даты» — исправьте поля и снова переведите ее в «Бронь подтверждена».");
        tw_call('crm.deal.update', array('id' => $dealId, 'fields' => array('STAGE_ID' => TW_STAGE_CLARIFY)));
        reply(array('ok' => false, 'result' => 'invalid', 'reason' => $why));
    }
    $car = TW_CARS[$carKey];
    $marker = 'сделка #' . $dealId;
    $name = 'Tian Way — аренда, ' . $marker;
    $period = $car['name'] . ', ' . $fmt($from) . ' — ' . $fmt($to);

    // 3. бронь этой сделки уже есть? (по метке в названии и по номеру, сохраненному в прошлый раз)
    $saved = is_file($stateFile) ? json_decode((string) file_get_contents($stateFile), true) : null;
    $savedId = isset($saved['booking']) ? (int) $saved['booking'] : 0;
    $allRes = array();
    foreach (TW_CARS as $c) {
        $allRes[] = $c['resource'];
    }
    $mine = array();
    foreach (tw_bookings($allRes, min($from, time()) - 400 * 86400, $to) as $b) {
        $tail = substr($b['name'], -strlen($marker));
        if (($savedId && $b['id'] === $savedId) || $tail === $marker) {
            $mine[$b['id']] = $b;
        }
    }
    if ($mine) {
        $same = null;
        foreach ($mine as $b) {
            if (in_array($car['resource'], $b['resources'], true) && $b['from'] === $from && $b['to'] === $to) {
                $same = $b;
            }
        }
        if (!$same) {
            $b = reset($mine);
            tw_deal_comment($dealId, "По сделке уже есть бронь №{$b['id']} в «Онлайн-записи» с другими машиной или датами ("
                . $fmt($b['from']) . ' — ' . $fmt($b['to']) . "). Новая бронь ($period) автоматически не создана — перенесите или снимите запись в «Онлайн-записи».");
            reply(array('ok' => false, 'result' => 'mismatch', 'booking' => $b['id']));
        }
        tw_link_booking($same['id'], $dealId);
        tw_check_booking($same['id'], $dealId);
        @file_put_contents($stateFile, json_encode(array('booking' => $same['id'], 'at' => time())));
        reply(array('ok' => true, 'result' => 'exists', 'booking' => $same['id']));
    }

    // 4. занятость машины (ошибка чтения — исключение, брони не будет)
    foreach (tw_bookings(array($car['resource']), $from, $to) as $b) {
        if (!in_array($car['resource'], $b['resources'], true)) {
            continue;
        }
        if ($from < $b['to'] + TW_PREP_BUFFER && $b['from'] < $to + TW_PREP_BUFFER) {
            tw_deal_comment($dealId, "Автоматическая бронь не создана: $period пересекается с бронью №{$b['id']} ("
                . $fmt($b['from']) . ' — ' . $fmt($b['to']) . '). Сделка возвращена в «Уточняем даты» — согласуйте с клиентом другие даты или машину.');
            tw_call('crm.deal.update', array('id' => $dealId, 'fields' => array('STAGE_ID' => TW_STAGE_CLARIFY)));
            reply(array('ok' => false, 'result' => 'conflict', 'booking' => $b['id']));
        }
    }

    // 5. создание, связь, проверка
    $made = tw_call('booking.v1.booking.add', array('fields' => array(
        'name' => $name,
        'resourceIds' => array($car['resource']),
        'datePeriod' => array(
            'from' => array('timestamp' => $from, 'timezone' => 'Asia/Bishkek'),
            'to' => array('timestamp' => $to, 'timezone' => 'Asia/Bishkek'),
        ),
    )));
    $r = isset($made['result']) ? $made['result'] : null;
    $bookingId = (int) (isset($r['booking']['id']) ? $r['booking']['id'] : (isset($r['id']) ? $r['id'] : (is_scalar($r) ? $r : 0)));
    if (!$bookingId) {
        throw new TwBitrixError('booking.v1.booking.add: нет номера записи');
    }
    @file_put_contents($stateFile, json_encode(array('booking' => $bookingId, 'at' => time())));
    tw_link_booking($bookingId, $dealId);
    tw_check_booking($bookingId, $dealId);
    tw_deal_comment($dealId, "Бронь создана автоматически: $period (запись №$bookingId в «Онлайн-записи», связана со сделкой). Сайт больше не предлагает эту машину на эти даты.");
    reply(array('ok' => true, 'result' => 'created', 'booking' => $bookingId));
} catch (TwBitrixError $e) {
    error_log('Tian Way confirm-booking, сделка ' . $dealId . ': ' . $e->getMessage());
    tw_deal_comment($dealId, 'Автоматическая бронь: техническая ошибка при обращении к Битрикс24, бронь не подтверждена. '
        . 'Повторите: переведите сделку в другую стадию и снова в «Бронь подтверждена» (созданная ранее бронь не задвоится).');
    reply(array('ok' => false, 'result' => 'error'), 502);
}

/** связать запись со сделкой; прежние связи записи сохраняются (externalData.set заменяет весь набор) */
function tw_link_booking($bookingId, $dealId)
{
    $links = array();
    try {
        $res = tw_call('booking.v1.booking.externalData.list', array('bookingId' => $bookingId));
        $list = isset($res['result']['externalData']) ? $res['result']['externalData'] : (isset($res['result']) && is_array($res['result']) ? $res['result'] : array());
        foreach ($list as $x) {
            if (isset($x['moduleId'], $x['entityTypeId'], $x['value'])) {
                $links[] = array('moduleId' => $x['moduleId'], 'entityTypeId' => $x['entityTypeId'], 'value' => (string) $x['value']);
            }
        }
    } catch (TwBitrixError $e) {
        // список связей не прочитался — ставим только связь со сделкой
    }
    foreach ($links as $x) {
        if ($x['moduleId'] === 'crm' && $x['entityTypeId'] === 'DEAL' && $x['value'] === (string) $dealId) {
            return; // связь уже есть
        }
    }
    $links[] = array('moduleId' => 'crm', 'entityTypeId' => 'DEAL', 'value' => (string) $dealId);
    tw_call('booking.v1.booking.externalData.set', array('bookingId' => $bookingId, 'externalData' => $links));
}

/** перед «успешно»: запись существует (booking.get), связь со сделкой есть (если Битрикс отдает список связей) */
function tw_check_booking($bookingId, $dealId)
{
    $got = tw_call('booking.v1.booking.get', array('id' => $bookingId));
    if (empty($got['result'])) {
        throw new TwBitrixError('booking.v1.booking.get: запись не найдена');
    }
    try {
        $res = tw_call('booking.v1.booking.externalData.list', array('bookingId' => $bookingId));
    } catch (TwBitrixError $e) {
        return; // метода списка связей нет — проверено тем, что externalData.set прошел без ошибки
    }
    $list = isset($res['result']['externalData']) ? $res['result']['externalData'] : (isset($res['result']) && is_array($res['result']) ? $res['result'] : array());
    foreach ($list as $x) {
        if (isset($x['entityTypeId'], $x['value']) && $x['entityTypeId'] === 'DEAL' && (string) $x['value'] === (string) $dealId) {
            return;
        }
    }
    throw new TwBitrixError('связь записи ' . $bookingId . ' со сделкой не найдена');
}
