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

// часы выдачи и возврата (до согласования с заказчицей): выдача днем, возврат утром,
// в день возврата машину можно выдать следующим гостям — как на сайте
const TW_PICKUP_TIME = '14:00:00';
const TW_DROPOFF_TIME = '11:00:00';

class TwBitrixError extends Exception
{
}

function tw_webhook()
{
    static $hook = null;
    if ($hook === null) {
        $file = dirname(__DIR__) . '/lead-config.php';
        $config = is_file($file) ? require $file : array();
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
    curl_close($curl);
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
function tw_busy($fromDay, $toDay, $cars = null)
{
    $cars = $cars === null ? array_keys(TW_CARS) : $cars;
    $byResource = array();
    foreach ($cars as $car) {
        $byResource[TW_CARS[$car]['resource']] = $car;
    }
    $busy = array_fill_keys($cars, array());
    $from = tw_day_ts($fromDay) - 60 * 86400;
    $to = tw_day_ts($toDay) + 86400;
    $start = 0;
    for ($page = 0; $page < 40; $page++) {
        $data = tw_call('booking.v1.booking.list', array(
            'filter' => array('resourceId' => array_keys($byResource), 'within' => array('dateFrom' => $from, 'dateTo' => $to)),
            'start' => $start,
        ));
        $list = isset($data['result']['booking']) ? $data['result']['booking'] : array();
        foreach ($list as $b) {
            $a = isset($b['datePeriod']['from']['timestamp']) ? (int) $b['datePeriod']['from']['timestamp'] : 0;
            $z = isset($b['datePeriod']['to']['timestamp']) ? (int) $b['datePeriod']['to']['timestamp'] : 0;
            if (!$a || !$z || $z <= $a) {
                continue;
            }
            $dayA = date('Y-m-d', $a);
            $dayZ = date('Y-m-d', $z);
            if ($dayZ === $dayA) {
                $dayZ = date('Y-m-d', $z + 86400); // бронь внутри одного дня занимает этот день
            }
            $ids = isset($b['resourceIds']) ? (array) $b['resourceIds'] : array();
            foreach ($ids as $rid) {
                if (isset($byResource[(int) $rid])) {
                    $busy[$byResource[(int) $rid]][] = array($dayA, $dayZ);
                }
            }
        }
        if (isset($data['next']) && (int) $data['next'] > $start) {
            $start = (int) $data['next'];
        } elseif (count($list) >= 50) {
            $start += 50;
        } else {
            break;
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
