<?php
/* =========================================================
   Tian Way — прием заявок с сайта → сделка в Битрикс24 (ТЗ «Интеграция сайта TianWay с Битрикс24», финальная редакция).
   Формы сайта отправляют сюда заявку (js/main.js, sendLead). Связь с Битриксом — api/bitrix.php,
   адрес вебхука — в lead-config.php рядом (только на хостинге).

   Куда идет заявка:
     • бронирование автодома (rent-booking) и форма главной с выбором «Аренда автодома» — воронка «Аренда автодомов»
       (CATEGORY_ID 2, C2:NEW): автодом, выдача, возврат, гости — в полях сделки, «Дата завершения» — день возврата;
     • «Соберем путешествие», «Рыбалка и охота», вопрос с сайта, остальные варианты формы главной — воронка «Туры Tian Way»
       (CATEGORY_ID 4, C4:NEW); календарь аренды не трогается.
   Контакт: ищем по телефону или e-mail, нет — создаем. Только мессенджер — он пишется в комментарий, без контакта.
   Бронь: перед созданием сделки сервер еще раз проверяет даты машины в «Онлайн-записи»; занято — ответ reason=busy,
   Битрикс не ответил — reason=check («Не удалось проверить доступность»).
   Повтор одной и той же отправки (тот же key) не создает вторую сделку — возвращается номер первой.
   Ответ: {"ok":true,"id":номер сделки}. Битрикс не подключен (нет lead-config.php или ключа) — {"ok":false}: посетитель видит
   ошибку с телефоном, а не ложное «Спасибо» (заявка иначе потерялась бы).

   Защита от спама: заявки только со страниц tianway.kg, не раньше 2 с после открытия страницы, не больше 8 попыток за 10 минут
   с адреса (считаются и неудачные — чтобы скриптом нельзя было бесконечно гонять проверки дат и тратить лимит Битрикса).
   ========================================================= */

require __DIR__ . '/api/bitrix.php';
require __DIR__ . '/api/rent-calc.php';   // расчет аренды по data/rent.json (ТЗ № 1)
require __DIR__ . '/api/rates-lib.php';   // курс НБКР для справочной валюты

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function answer($data, $code = 200)
{
    http_response_code($code);
    echo json_encode(is_array($data) ? $data : array('ok' => (bool) $data));
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    answer(false, 405);
}

// Битрикс24 не подключен — заявку некуда отправить: честная ошибка (форма покажет телефон), а не «Спасибо»
if (!tw_configured()) {
    error_log('Tian Way lead.php: нет ключа Битрикс24 (lead-config.php) — заявка не отправлена');
    answer(array('ok' => false, 'reason' => 'send'), 503);
}

// заявки — только со страниц сайта
$from = !empty($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : (isset($_SERVER['HTTP_REFERER']) ? $_SERVER['HTTP_REFERER'] : '');
if (!in_array(strtolower((string) parse_url($from, PHP_URL_HOST)), array('tianway.kg', 'www.tianway.kg'), true)) {
    answer(false, 403);
}

$data = json_decode((string) file_get_contents('php://input', false, null, 0, 200000), true);
if (!is_array($data)) {
    answer(false, 400);
}
if (isset($data['ms']) && (int) $data['ms'] < 2000) {
    answer(true); // отправлено быстрее, чем человек успел бы заполнить форму, — робот
}

function clean($value, $max = 300)
{
    if (is_array($value) || is_object($value)) {
        return '';
    }
    $value = trim(strip_tags((string) $value));
    return function_exists('mb_substr') ? mb_substr($value, 0, $max, 'UTF-8') : substr($value, 0, $max);
}

// ---------- повтор той же отправки: отдаем уже созданную сделку ----------
$key = preg_replace('/[^a-zA-Z0-9-]/', '', clean(isset($data['key']) ? $data['key'] : '', 64));
$lock = null;
if ($key !== '') {
    $lock = fopen(tw_tmp('lead-' . $key . '.lock'), 'c');
    if ($lock) {
        flock($lock, LOCK_EX); // одновременный двойной клик ждет, пока первая отправка закончится
    }
    $done = tw_tmp('lead-' . $key . '.json');
    if (is_file($done)) {
        $prev = json_decode((string) file_get_contents($done), true);
        if (!empty($prev['id'])) {
            answer(array('ok' => true, 'id' => $prev['id']));
        }
    }
}

// ---------- не больше 8 попыток за 10 минут с одного адреса (считаются все, до обращений к Битриксу) ----------
$ip = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '';
$limit = fopen(tw_tmp('limit-' . md5($ip)), 'c+');
$now = time();
$recent = array();
if ($limit && flock($limit, LOCK_EX)) {
    foreach (explode(',', (string) stream_get_contents($limit)) as $stamp) {
        if ((int) $stamp > $now - 600) {
            $recent[] = (int) $stamp;
        }
    }
    if (count($recent) >= 8) {
        answer(false, 429);
    }
    $recent[] = $now;
    ftruncate($limit, 0);
    rewind($limit);
    fwrite($limit, implode(',', $recent));
    flock($limit, LOCK_UN);
}

// ---------- что пришло ----------
$form = isset($data['form']) ? clean($data['form'], 20) : '';
$name = clean(isset($data['name']) ? $data['name'] : '', 100);
$surname = clean(isset($data['surname']) ? $data['surname'] : '', 100);
$contact = clean(isset($data['contact']) ? $data['contact'] : '', 100);
$email = clean(isset($data['email']) ? $data['email'] : '', 100);
$email = filter_var($email, FILTER_VALIDATE_EMAIL) ? $email : '';
$page = clean(isset($data['page']) ? $data['page'] : '', 500);
$lang = (isset($data['lang']) && $data['lang'] === 'en') ? 'en' : 'ru';
$kind = clean(isset($data['kind']) ? $data['kind'] : '', 60);   // форма главной: «Аренда автодома», «Готовое путешествие»…
$car = isset($data['car']) && is_string($data['car']) && isset(TW_CARS[$data['car']]) ? $data['car'] : '';
$fromDay = isset($data['from']) && tw_valid_day($data['from']) ? $data['from'] : '';
$toDay = isset($data['to']) && tw_valid_day($data['to']) ? $data['to'] : '';
if ($fromDay && $toDay && $toDay <= $fromDay) {
    $fromDay = $toDay = '';
}
$guests = isset($data['guests']) ? max(0, min(50, (int) $data['guests'])) : 0;
$extras = clean(isset($data['extras']) ? $data['extras'] : '', 1000);
// что выбрано в аренду (без цен — их сервер берет из data/rent.json) и валюта, в которой человек смотрел цены
$items = array();
if (isset($data['items']) && is_array($data['items'])) {
    foreach (array_slice($data['items'], 0, 40) as $row) {
        if (is_array($row) && isset($row['id']) && is_string($row['id']) && preg_match('/^[\w-]{1,40}$/', $row['id'])) {
            $items[] = array('id' => $row['id'], 'qty' => isset($row['qty']) ? (int) $row['qty'] : 0,
                'variant' => isset($row['variant']) && $row['variant'] === 'airport' ? 'airport' : 'city');
        }
    }
}
$displayCur = isset($data['currency']) && in_array($data['currency'], array('KGS', 'USD', 'RUB'), true) ? $data['currency'] : 'KGS';
if ($name === '' && $contact === '' && $email === '') {
    answer(false, 400);
}
$isRent = $form === 'rent' || ($form === 'home' && preg_match('/аренд/iu', $kind));
$phone = ($contact !== '' && !preg_match('/\p{L}/u', $contact)) ? $contact : '';
$messenger = ($contact !== '' && $phone === '') ? $contact : '';

// ---------- бронь: заезд не в прошлом (по Бишкеку) и повторная проверка дат машины ----------
if ($isRent && $fromDay && $fromDay < date('Y-m-d')) {
    answer(array('ok' => false, 'reason' => 'past'), 400);
}
// минимальный срок аренды (data/rent.json, min_nights): сайт короче не дает, но проверяем и здесь
if ($isRent && $car && $fromDay && $toDay
    && (int) round((strtotime($toDay . ' 12:00:00') - strtotime($fromDay . ' 12:00:00')) / 86400) < tw_rent_min_nights()) {
    answer(array('ok' => false, 'reason' => 'short', 'min' => tw_rent_min_nights()), 400);
}
if ($isRent && $car && $fromDay && $toDay) {
    try {
        $busy = tw_busy($fromDay, $toDay, array($car));
        $hit = tw_overlap($busy[$car], $fromDay, $toDay);
        if ($hit) {
            answer(array('ok' => false, 'reason' => 'busy', 'busy' => $busy[$car]), 409);
        }
    } catch (TwBitrixError $e) {
        error_log('Tian Way lead.php: ' . $e->getMessage());
        answer(array('ok' => false, 'reason' => 'check'), 503);
    }
}

try {
    // ---------- контакт: по телефону или e-mail ----------
    $contactId = null;
    foreach (array(array('PHONE', $phone), array('EMAIL', $email)) as $pair) {
        if ($pair[1] === '' || $contactId) {
            continue;
        }
        $found = tw_call('crm.duplicate.findbycomm', array('entity_type' => 'CONTACT', 'type' => $pair[0], 'values' => array($pair[1])));
        if (!empty($found['result']['CONTACT'][0])) {
            $contactId = (int) $found['result']['CONTACT'][0];
        }
    }
    if (!$contactId && ($phone !== '' || $email !== '')) {
        $fields = array('NAME' => $name !== '' ? $name : 'Без имени', 'LAST_NAME' => $surname, 'SOURCE_ID' => 'WEB', 'OPENED' => 'Y');
        if ($phone !== '') {
            $fields['PHONE'] = array(array('VALUE' => $phone, 'VALUE_TYPE' => 'WORK'));
        }
        if ($email !== '') {
            $fields['EMAIL'] = array(array('VALUE' => $email, 'VALUE_TYPE' => 'WORK'));
        }
        $made = tw_call('crm.contact.add', array('fields' => $fields));
        $contactId = isset($made['result']) ? (int) $made['result'] : null;
    }

    // ---------- комментарий: все, что написал человек ----------
    $lines = array();
    $who = trim($name . ' ' . $surname);
    if ($who !== '') {
        $lines[] = 'Имя: ' . $who;
    }
    if ($phone !== '') {
        $lines[] = 'Телефон: ' . $phone;
    }
    if ($messenger !== '') {
        $lines[] = 'Связь (мессенджер): ' . $messenger;
    }
    if ($email !== '') {
        $lines[] = 'E-mail: ' . $email;
    }
    if (isset($data['info']) && is_array($data['info'])) {
        foreach ($data['info'] as $label => $value) {
            $value = clean($value, 1500);
            if ($value !== '') {
                $lines[] = clean($label, 60) . ': ' . $value;
            }
        }
    }
    // расчет аренды на сервере (сомы) — суммам из браузера не доверяем (ТЗ № 1)
    $calc = null;
    $fx = array('cur' => 'KGS', 'rate' => 1, 'date' => '');
    if ($isRent && $car && $fromDay && $toDay) {
        $calc = tw_rent_calc($car, $fromDay, $toDay, $items);
        if (!$calc['rate']) {
            $calc = null;   // цена автодома не известна («Цена уточняется») — сумму назовет менеджер
        }
    }
    if ($calc) {
        // курс — тот, по которому сайт показывал цены (последний проверенный НБКР); нет курса — показывали сомы
        if ($displayCur !== 'KGS') {
            $r = tw_rates();
            $fx = !empty($r['ok']) ? array('cur' => $displayCur, 'rate' => $r[$displayCur], 'date' => $r['date']) : $fx;
        }
        $lines[] = '--- Расчет сайта (в сомах) ---';
        $lines[] = 'Автодом: ' . tw_kgs_text($calc['car']) . ' (' . tw_kgs_text($calc['rate']) . ' × ' . max(1, $calc['nights']) . ' сут.)';
        foreach ($calc['lines'] as $ln) {
            $lines[] = $ln['title'] . ' × ' . $ln['qty'] . ': ' . ($ln['sum'] ? tw_kgs_text($ln['sum']) . ' (' . $ln['note'] . ')' : $ln['note']);
        }
        $lines[] = 'Полная стоимость: ' . tw_kgs_text($calc['total']);
        $lines[] = 'Предоплата ' . $calc['percent'] . '%: ' . tw_kgs_text($calc['prepay']) . '; остаток: ' . tw_kgs_text($calc['rest']);
        $lines[] = 'Возвратный залог (отдельно): ' . tw_kgs_text($calc['deposit']);
        $lines[] = 'Валюта на сайте: ' . $fx['cur'] . ($fx['cur'] !== 'KGS' ? ' (курс НБКР ' . $fx['rate'] . ' сом на ' . $fx['date'] . ', справочно)' : '');
    }
    $lines[] = 'Язык сайта: ' . ($lang === 'en' ? 'английский' : 'русский');
    if ($page !== '') {
        $lines[] = 'Страница: ' . $page;
    }

    // ---------- сделка ----------
    $titles = array('trip' => 'Заявка на тур — %s', 'fishing' => 'Заявка на тур — Рыбалка и охота', 'ask' => 'Вопрос с сайта', 'home' => 'Заявка на тур — %s');
    if ($isRent) {
        $title = 'Аренда — ' . ($car ? TW_CARS[$car]['name'] : 'автодом (заявка с главной)');
    } else {
        $tour = clean(isset($data['tour']) ? $data['tour'] : '', 120);
        $tour = $tour !== '' ? $tour : ($kind !== '' ? $kind : 'без выбора');
        $title = sprintf(isset($titles[$form]) ? $titles[$form] : 'Заявка с сайта', $tour);
    }
    $deal = array_merge($isRent ? TW_RENT : TW_TOURS, array(
        'TITLE' => $title,
        'SOURCE_ID' => 'WEB',
        'SOURCE_DESCRIPTION' => 'tianway.kg',
        'COMMENTS' => implode("\n", $lines),
        'OPENED' => 'Y',
    ));
    if ($contactId) {
        $deal['CONTACT_ID'] = $contactId;
    }
    $query = array();
    parse_str((string) parse_url($page, PHP_URL_QUERY), $query);
    foreach (array('utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term') as $utm) {
        if (!empty($query[$utm])) {
            $deal[strtoupper($utm)] = clean($query[$utm], 100);
        }
    }
    if ($isRent) {
        $uf = tw_deal_fields();
        if ($car) {
            $deal[TW_UF_CAR] = TW_CARS[$car]['option'];
        }
        if ($fromDay) {
            $deal[TW_UF_PICKUP] = tw_field_value($uf, TW_UF_PICKUP, $fromDay, TW_PICKUP_TIME);
        }
        if ($toDay) {
            $deal[TW_UF_DROPOFF] = tw_field_value($uf, TW_UF_DROPOFF, $toDay, TW_DROPOFF_TIME);
            $deal['CLOSEDATE'] = $toDay; // «Дата завершения» — день возврата (иначе Битрикс ставит +7 дней от создания)
        }
        if ($guests) {
            $deal[TW_UF_GUESTS] = tw_field_value($uf, TW_UF_GUESTS, $guests);
        }
        if ($extras !== '' && isset($uf[TW_UF_EXTRAS]) && in_array($uf[TW_UF_EXTRAS]['type'], array('string', 'text'), true)) {
            $deal[TW_UF_EXTRAS] = $extras;
        }
        // деньги: полная стоимость, предоплата, остаток, залог — в сомах; валюта и курс показа — справочно
        if ($calc) {
            $deal['OPPORTUNITY'] = (float) tw_kgs($calc['total']);
            $deal['CURRENCY_ID'] = 'KGS';
            $deal[TW_UF_PREPAY] = tw_kgs($calc['prepay']) . '|KGS';
            $deal[TW_UF_BALANCE] = tw_kgs($calc['rest']) . '|KGS';
            if ($calc['deposit']) {
                $deal[TW_UF_DEPOSIT] = tw_kgs($calc['deposit']) . '|KGS';
            }
            $deal[TW_UF_DISPLAY_CUR] = $fx['cur'];
            $deal[TW_UF_FX_RATE] = (float) $fx['rate'];
            if ($fx['date'] !== '') {
                $deal[TW_UF_FX_DATE] = $fx['date'];
            }
            $deal[TW_UF_PAY_STATUS] = TW_PAY_UNPAID;
        }
        if (isset($uf[TW_UF_LANG]) && $uf[TW_UF_LANG]['type'] === 'enumeration') {
            $opt = tw_field_value($uf, TW_UF_LANG, $lang === 'en' ? '/англ|engl/iu' : '/рус|russ/iu');
            if ($opt) {
                $deal[TW_UF_LANG] = $opt;
            }
        }
    }
    $made = tw_call('crm.deal.add', array('fields' => $deal, 'params' => array('REGISTER_SONET_EVENT' => 'Y')));
    $dealId = isset($made['result']) ? (int) $made['result'] : 0;
    if (!$dealId) {
        throw new TwBitrixError('crm.deal.add: нет номера сделки');
    }
} catch (TwBitrixError $e) {
    error_log('Tian Way lead.php: ' . $e->getMessage());
    answer(array('ok' => false, 'reason' => 'send'), 502);
}

if ($key !== '') {
    @file_put_contents(tw_tmp('lead-' . $key . '.json'), json_encode(array('id' => $dealId, 'at' => time())));
}
answer(array('ok' => true, 'id' => $dealId));
