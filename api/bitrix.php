<?php
/* =========================================================
   Tian Way — общий модуль связи с Битрикс24 (портал b24-ckbtwm.bitrix24.ru). Подключают lead.php и api/availability.php.
   Адрес вебхука — только в lead-config.php в корне сайта (на хостинге, его кладет автозагрузка из секрета
   BITRIX_WEBHOOK). Адрес никуда не выводится: ни в ответы, ни в журналы ошибок.
   ТЗ: «Интеграция сайта TianWay с Битрикс24», финальная редакция (ноябрь 2026).
   ========================================================= */

date_default_timezone_set('Asia/Bishkek'); // даты выдачи и возврата — по времени Бишкека

// автодомы сайта (data-car) → ресурс «Онлайн-записи» и вариант поля сделки «Автодом» (подтверждены через REST)
const TW_CARS = array(
    'forland-s1' => array('resource' => 2, 'option' => 44, 'name' => 'Forland S1'),
    'freedom-cannon' => array('resource' => 4, 'option' => 46, 'name' => 'Freedom Cannon'),
    'prado-camper' => array('resource' => 6, 'option' => 76, 'name' => 'Toyota Prado с кемпером'),
);

// воронки сделок
const TW_RENT = array('CATEGORY_ID' => 2, 'STAGE_ID' => 'C2:NEW');
const TW_TOURS = array('CATEGORY_ID' => 4, 'STAGE_ID' => 'C4:NEW');

// поля сделки (пользовательские)
const TW_UF_CAR = 'UF_CRM_1795695844104';      // Автодом
const TW_UF_PICKUP = 'UF_CRM_1795695855897';   // Выдача автодома
const TW_UF_DROPOFF = 'UF_CRM_1795695857043';  // Возврат автодома
const TW_UF_GUESTS = 'UF_CRM_1795695858220';   // Количество гостей
const TW_UF_LANG = 'UF_CRM_1795695873303';     // Язык общения
const TW_UF_EXTRAS = 'UF_CRM_1795695879879';   // Дополнительное оборудование
// деньги (ТЗ № 1, поля созданы заказчиком 27.11.2026 — ~/Desktop/TianWay_Bitrix24_KGS_Fields.docx):
// полная стоимость — OPPORTUNITY + CURRENCY_ID = KGS (базовая валюта портала — RUB, поэтому KGS передаем явно);
// поля «деньги» — строкой «сумма|KGS» без разделителей тысяч
const TW_UF_PREPAY = 'UF_CRM_1795695859637';          // Предоплата к внесению (деньги)
const TW_UF_BALANCE = 'UF_CRM_TW_BALANCE_KGS';        // Остаток после предоплаты (деньги)
const TW_UF_DEPOSIT = 'UF_CRM_1795695862167';         // Возвратный залог (деньги)
const TW_UF_DISPLAY_CUR = 'UF_CRM_TW_DISPLAY_CURRENCY'; // Валюта отображения (ISO: KGS / USD / RUB)
const TW_UF_FX_RATE = 'UF_CRM_TW_FX_RATE';            // Курс отображения (сомов за 1 единицу; для KGS — 1)
const TW_UF_FX_DATE = 'UF_CRM_TW_FX_DATE';            // Дата курса отображения (ГГГГ-ММ-ДД)
const TW_UF_PAY_STATUS = 'UF_CRM_TW_PAYMENT_STATUS';  // Статус оплаты (список)
const TW_PAY_UNPAID = 78;                             // «Не оплачено» (80 — частично, 82 — оплачено, 84 — возвращено)

// часы выдачи и возврата (до согласования с заказчицей): выдача днем, возврат утром,
// в день возврата машину можно выдать следующим гостям — как на сайте
const TW_PICKUP_TIME = '14:00:00';
const TW_DROPOFF_TIME = '11:00:00';
// запас на подготовку машины между возвратом и следующей выдачей, секунды (0 — до согласования с заказчицей;
// при 11:00 возврата и 14:00 выдачи между ними и так 3 часа)
const TW_PREP_BUFFER = 0;

// автоматическая бронь (api/bitrix/confirm-booking.php): стадия запуска и стадия возврата при конфликте
const TW_STAGE_CONFIRMED = 'C2:FINAL_INVOICE';   // «Бронь подтверждена»
const TW_STAGE_CLARIFY = 'C2:PREPARATION';       // «Уточняем даты»

class TwBitrixError extends Exception
{
}

function tw_config()
{
    static $config = null;
    if ($config === null) {
        $file = dirname(__DIR__) . '/lead-config.php';
        $config = is_file($file) ? require $file : array();
        $config = is_array($config) ? $config : array();
    }
    return $config;
}

/** пароль робота «Бронь подтверждена» (секрет BOOKING_ROBOT_SECRET); пусто — обработчик выключен */
function tw_robot_secret()
{
    $config = tw_config();
    $secret = isset($config['robot_secret']) ? trim((string) $config['robot_secret']) : '';
    return strlen($secret) >= 16 ? $secret : '';
}

function tw_webhook()
{
    static $hook = null;
    if ($hook === null) {
        $config = tw_config();
        $hook = isset($config['webhook']) ? rtrim($config['webhook'], '/') . '/' : '';
        if (strpos($hook, 'https://') !== 0 || strpos($hook, 'ПОРТАЛ') !== false) {
            $hook = '';
        }
    }
    return $hook;
}

function tw_configured()
{
    return tw_webhook() !== '';
}

/** вызов метода REST; ошибка — исключение без адреса вебхука в тексте */
function tw_call($method, $params = array())
{
    $curl = curl_init(tw_webhook() . $method . '.json');
    curl_setopt_array($curl, array(
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($params),
        CURLOPT_HTTPHEADER => array('Content-Type: application/json'),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 15,
    ));
    $response = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
    $error = curl_error($curl);
    if (PHP_VERSION_ID < 80000) {
        curl_close($curl); // с PHP 8 не нужен (а в PHP 8.5 устарел)
    }
    $data = json_decode((string) $response, true);
    if ($status !== 200 || !is_array($data) || isset($data['error'])) {
        $why = isset($data['error_description']) ? $data['error_description'] : (isset($data['error']) ? $data['error'] : ($error !== '' ? $error : 'HTTP ' . $status));
        throw new TwBitrixError($method . ': ' . substr((string) $why, 0, 200));
    }
    return $data;
}

function tw_tmp($name)
{
    $dir = sys_get_temp_dir() . '/tianway-' . substr(md5(__DIR__), 0, 8);
    if (!is_dir($dir)) {
        @mkdir($dir, 0700, true);
    }
    // изредка убираем старые служебные файлы (повторы заявок, кэш, счетчики), чтобы папка не росла
    if (mt_rand(1, 50) === 1) {
        foreach ((array) glob($dir . '/*') as $old) {
            if (is_file($old) && filemtime($old) < time() - 14 * 86400 && strpos(basename($old), 'robot-') !== 0) {
                @unlink($old);
            }
        }
    }
    return $dir . '/' . $name;
}

/** день «ГГГГ-ММ-ДД» → Unix-время начала этого дня по Бишкеку */
function tw_day_ts($day)
{
    $d = DateTime::createFromFormat('!Y-m-d', $day, new DateTimeZone('Asia/Bishkek'));
    return $d ? $d->getTimestamp() : null;
}

function tw_valid_day($day)
{
    return is_string($day) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $day) && tw_day_ts($day) !== null;
}

/**
 * занятость машин из «Онлайн-записи» за период: array('forland-s1' => array(array('2026-12-01', '2026-12-05'), …), …)
 * Интервал — с дня выдачи до дня возврата (в день возврата машину можно выдать снова).
 * Берем записи с запасом 60 дней до начала периода — чтобы попали брони, начавшиеся раньше и пересекающие его.
 */
/**
 * записи «Онлайн-записи» ресурсов за период: array(array('id', 'name', 'resources' => [...], 'from', 'to'), …), все страницы по 50.
 * Окно запроса расширено: 60 дней назад и 400 дней вперед — так попадают и брони, начавшиеся раньше периода,
 * и брони, которые начинаются внутри периода, а заканчиваются позже (если Битрикс отбирает только записи целиком внутри окна).
 */
function tw_bookings($resources, $fromTs, $toTs)
{
    $out = array();
    $start = 0;
    for ($page = 0; $page < 40; $page++) {
        $data = tw_call('booking.v1.booking.list', array(
            'filter' => array('resourceId' => array_values($resources), 'within' => array('dateFrom' => $fromTs - 60 * 86400, 'dateTo' => $toTs + 400 * 86400)),
            'start' => $start,
        ));
        $list = isset($data['result']['booking']) ? $data['result']['booking'] : array();
        foreach ($list as $b) {
            $a = isset($b['datePeriod']['from']['timestamp']) ? (int) $b['datePeriod']['from']['timestamp'] : 0;
            $z = isset($b['datePeriod']['to']['timestamp']) ? (int) $b['datePeriod']['to']['timestamp'] : 0;
            if (!$a || !$z || $z <= $a) {
                continue;
            }
            $out[] = array(
                'id' => isset($b['id']) ? (int) $b['id'] : 0,
                'name' => isset($b['name']) ? (string) $b['name'] : '',
                'resources' => array_map('intval', isset($b['resourceIds']) ? (array) $b['resourceIds'] : array()),
                'from' => $a,
                'to' => $z,
            );
        }
        if (isset($data['next']) && (int) $data['next'] > $start) {
            $start = (int) $data['next'];
        } elseif (count($list) >= 50) {
            $start += 50;
        } else {
            break;
        }
    }
    return $out;
}

function tw_busy($fromDay, $toDay, $cars = null)
{
    $cars = $cars === null ? array_keys(TW_CARS) : $cars;
    $byResource = array();
    foreach ($cars as $car) {
        $byResource[TW_CARS[$car]['resource']] = $car;
    }
    $busy = array_fill_keys($cars, array());
    foreach (tw_bookings(array_keys($byResource), tw_day_ts($fromDay), tw_day_ts($toDay) + 86400) as $bk) {
        $dayA = date('Y-m-d', $bk['from']);
        $dayZ = date('Y-m-d', $bk['to']);
        if ($dayZ === $dayA) {
            $dayZ = date('Y-m-d', $bk['to'] + 86400); // бронь внутри одного дня занимает этот день
        }
        foreach ($bk['resources'] as $rid) {
            if (isset($byResource[$rid])) {
                $busy[$byResource[$rid]][] = array($dayA, $dayZ);
            }
        }
    }
    foreach ($busy as $car => $ranges) {
        usort($ranges, function ($x, $y) {
            return strcmp($x[0], $y[0]);
        });
        $merged = array();
        foreach ($ranges as $r) {
            $n = count($merged);
            if ($n && $r[0] <= $merged[$n - 1][1]) {
                if ($r[1] > $merged[$n - 1][1]) {
                    $merged[$n - 1][1] = $r[1];
                }
            } else {
                $merged[] = $r;
            }
        }
        $busy[$car] = $merged;
    }
    return $busy;
}

/** пересекается ли аренда [from, to) с занятыми интервалами машины; возвращает первый мешающий интервал */
function tw_overlap($ranges, $fromDay, $toDay)
{
    foreach ($ranges as $r) {
        if ($fromDay < $r[1] && $toDay > $r[0]) {
            return $r;
        }
    }
    return null;
}

/** описания пользовательских полей сделки (тип, варианты списков) — один раз в сутки */
function tw_deal_fields()
{
    $cache = tw_tmp('deal-fields.json');
    if (is_file($cache) && filemtime($cache) > time() - 86400) {
        $data = json_decode((string) file_get_contents($cache), true);
        if (is_array($data)) {
            return $data;
        }
    }
    $fields = array();
    $res = tw_call('crm.deal.userfield.list', array('filter' => array()));
    foreach ((isset($res['result']) ? $res['result'] : array()) as $f) {
        if (isset($f['FIELD_NAME'])) {
            $fields[$f['FIELD_NAME']] = array(
                'type' => isset($f['USER_TYPE_ID']) ? $f['USER_TYPE_ID'] : 'string',
                'list' => isset($f['LIST']) ? $f['LIST'] : array(),
            );
        }
    }
    @file_put_contents($cache, json_encode($fields));
    return $fields;
}

/** значение для поля сделки по его типу: дата, дата со временем, число, строка, вариант списка */
function tw_field_value($fields, $code, $value, $time = '12:00:00')
{
    $type = isset($fields[$code]['type']) ? $fields[$code]['type'] : 'string';
    switch ($type) {
        case 'date':
            return $value;
        case 'datetime':
            return $value . 'T' . $time . '+06:00';
        case 'integer':
            return (int) $value;
        case 'double':
            return (float) $value;
        case 'enumeration':
            foreach ($fields[$code]['list'] as $opt) {
                if (isset($opt['VALUE']) && preg_match($value, $opt['VALUE'])) {
                    return $opt['ID'];
                }
            }
            return null;
        default:
            return (string) $value;
    }
}

/** значение поля даты сделки (crm.deal.get) → Unix-время: поле «дата» — этот день в указанный час по Бишкеку,
 *  поле «дата со временем» — как записано. Пусто или не разобрать — null. */
function tw_deal_ts($fields, $code, $value, $time)
{
    if (is_array($value)) {
        $value = reset($value);
    }
    $value = trim((string) $value);
    if ($value === '') {
        return null;
    }
    $type = isset($fields[$code]['type']) ? $fields[$code]['type'] : 'date';
    if ($type === 'datetime' && strlen($value) > 10) {
        $ts = strtotime($value);
        return $ts ? $ts : null;
    }
    if (preg_match('/^(\d{4})-(\d{2})-(\d{2})/', $value, $m)) {
        $day = $m[1] . '-' . $m[2] . '-' . $m[3];
    } elseif (preg_match('/^(\d{2})\.(\d{2})\.(\d{4})/', $value, $m)) {
        $day = $m[3] . '-' . $m[2] . '-' . $m[1];
    } else {
        return null;
    }
    $d = DateTime::createFromFormat('Y-m-d H:i:s', $day . ' ' . $time, new DateTimeZone('Asia/Bishkek'));
    return $d ? $d->getTimestamp() : null;
}

/** комментарий в ленту сделки — так менеджер видит, что сделала автоматика и почему */
function tw_deal_comment($dealId, $text)
{
    try {
        tw_call('crm.timeline.comment.add', array('fields' => array('ENTITY_ID' => (int) $dealId, 'ENTITY_TYPE' => 'deal', 'COMMENT' => $text)));
        return true;
    } catch (TwBitrixError $e) {
        error_log('Tian Way: комментарий к сделке ' . (int) $dealId . ' не добавлен: ' . $e->getMessage());
        return false;
    }
}
