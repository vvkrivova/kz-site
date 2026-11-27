<?php
/* =========================================================
   Tian Way — курс Нацбанка КР для справочных цен в долларах и рублях (ТЗ № 1 «валютная система»).
   tw_rates() — последний проверенный курс: ['ok' => true, 'date' => 'ГГГГ-ММ-ДД', 'USD' => 87.45, 'RUB' => 1.1, …]
   или ['ok' => false, 'reason' => 'none' | 'stale', 'date' => …] — тогда сайт показывает только сомы.

   Источник — официальный файл НБКР https://www.nbkr.kg/XML/daily.xml (сомов за номинал валюты, номинал учитываем).
   Не ходим в НБКР при каждом открытии страницы: проверенный курс лежит во временной папке и обновляется,
   когда ему больше REFRESH секунд (не чаще одной попытки в RETRY секунд, если НБКР не отвечает).
   Проверки: ответ — XML с датой курса, курс USD и RUB есть и в разумных пределах, дата не из будущего (больше суток)
   и не старше недели. НБКР недоступен — остается последний проверенный курс; старше 72 часов — 'stale' (только сомы).
   Цены и суммы сайта считаются в сомах; курс нужен только для показа и пишется в сделку справочно.
   ========================================================= */

require_once __DIR__ . '/bitrix.php'; // tw_tmp(), часовой пояс Бишкека

const TW_RATES_URL = 'https://www.nbkr.kg/XML/daily.xml';
const TW_RATES_REFRESH = 4 * 3600;   // свежий курс проверяем раз в 4 часа (НБКР публикует раз в рабочий день)
const TW_RATES_RETRY = 15 * 60;      // НБКР не ответил — следующая попытка не раньше чем через 15 минут
const TW_RATES_MAX_AGE = 72 * 3600;  // курс старше 72 часов не показываем (ТЗ)
// разумные пределы (сомов за 1 единицу): защита от сломанного или подмененного ответа
const TW_RATES_LIMITS = array('USD' => array(30, 300), 'RUB' => array(0.2, 5));

/** скачать и разобрать daily.xml; ошибка — исключение */
function tw_rates_fetch()
{
    $curl = curl_init(TW_RATES_URL);
    curl_setopt_array($curl, array(
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 2,
        CURLOPT_USERAGENT => 'TianWay-site/1.0',
    ));
    $xml = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
    $error = curl_error($curl);
    if (PHP_VERSION_ID < 80000) {
        curl_close($curl);
    }
    if ($status !== 200 || !is_string($xml) || $xml === '') {
        throw new RuntimeException('НБКР: HTTP ' . $status . ($error !== '' ? ' — ' . $error : ''));
    }
    return tw_rates_parse($xml);
}

/** разбор daily.xml → ['date' => 'ГГГГ-ММ-ДД', 'USD' => …, 'RUB' => …] (сомов за 1 единицу валюты) */
function tw_rates_parse($xml)
{
    // НБКР объявляет кодировку windows-1251; на хостинге libxml ее может не знать («не XML»). В файле курсов только
    // латиница и цифры — объявление кодировки убираем (а если вдруг есть кириллица — сначала переводим в UTF-8)
    $body = ltrim((string) $xml, "\xEF\xBB\xBF \t\r\n");
    if (preg_match('/[\x80-\xFF]/', $body)) {
        $body = function_exists('mb_convert_encoding') ? mb_convert_encoding($body, 'UTF-8', 'Windows-1251')
            : (function_exists('iconv') ? (string) iconv('Windows-1251', 'UTF-8//IGNORE', $body) : $body);
    }
    $body = preg_replace('/^<\?xml[^>]*\?>/', '', $body);
    $prev = libxml_use_internal_errors(true);
    $doc = simplexml_load_string($body, 'SimpleXMLElement', LIBXML_NONET);
    libxml_use_internal_errors($prev);
    if ($doc === false) {
        // что пришло вместо XML (без тегов, коротко) — чтобы было видно, например, страницу защиты от ботов
        $peek = trim(preg_replace('/\s+/', ' ', strip_tags(substr($body, 0, 400))));
        throw new RuntimeException('НБКР: не XML' . ($peek !== '' ? ' — ' . substr($peek, 0, 120) : ''));
    }
    $d = (string) $doc['Date'];
    if (!preg_match('/^(\d{2})\.(\d{2})\.(\d{4})$/', $d, $m) || !checkdate((int) $m[2], (int) $m[1], (int) $m[3])) {
        throw new RuntimeException('НБКР: нет даты курса');
    }
    $date = $m[3] . '-' . $m[2] . '-' . $m[1];
    $dayTs = strtotime($date . ' 00:00:00');
    if ($dayTs > time() + 86400 || $dayTs < time() - 7 * 86400) {
        throw new RuntimeException('НБКР: дата курса ' . $date . ' не подходит');
    }
    $out = array('date' => $date);
    foreach ($doc->Currency as $c) {
        $code = strtoupper((string) $c['ISOCode']);
        if (!isset(TW_RATES_LIMITS[$code])) {
            continue;
        }
        $nominal = (float) str_replace(',', '.', (string) $c->Nominal);
        $value = (float) str_replace(',', '.', (string) $c->Value);
        if ($nominal <= 0 || $value <= 0) {
            continue;
        }
        $rate = round($value / $nominal, 6); // курс приводим к одной единице валюты
        list($lo, $hi) = TW_RATES_LIMITS[$code];
        if ($rate < $lo || $rate > $hi) {
            throw new RuntimeException('НБКР: курс ' . $code . ' ' . $rate . ' вне разумных пределов');
        }
        $out[$code] = $rate;
    }
    foreach (array_keys(TW_RATES_LIMITS) as $code) {
        if (!isset($out[$code])) {
            throw new RuntimeException('НБКР: нет курса ' . $code);
        }
    }
    return $out;
}

/** запасной проверенный курс — data/rates.json: его при каждой загрузке сайта кладет автосборка
 *  (tools/fetch_rates.py берет daily.xml НБКР и проверяет так же). Нужен, когда хостинг сам до НБКР не достучался. */
function tw_rates_backup()
{
    $r = json_decode((string) @file_get_contents(__DIR__ . '/../data/rates.json'), true);
    if (!is_array($r) || empty($r['ok']) || !isset($r['date'], $r['USD'], $r['RUB']) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $r['date'])) {
        return null;
    }
    if (strtotime($r['date'] . ' 00:00:00') > time() + 86400) {
        return null;
    }
    foreach (TW_RATES_LIMITS as $code => $lim) {
        if (!is_numeric($r[$code]) || $r[$code] < $lim[0] || $r[$code] > $lim[1]) {
            return null;
        }
    }
    return array('date' => $r['date'], 'USD' => (float) $r['USD'], 'RUB' => (float) $r['RUB'], 'backup' => true);
}

/** последний проверенный курс (с обновлением, если пора); свой нет или старее — запасной из автосборки */
function tw_rates()
{
    $file = tw_tmp('rates.json');
    $read = function () use ($file) {
        $r = is_file($file) ? json_decode((string) file_get_contents($file), true) : null;
        return is_array($r) && isset($r['date'], $r['USD'], $r['RUB']) ? $r : null;
    };
    $rates = $read();
    $checked = $rates && isset($rates['checked']) ? (int) $rates['checked'] : 0;
    $tried = is_file($file . '.try') ? (int) filemtime($file . '.try') : 0;
    if (time() - $checked > TW_RATES_REFRESH && time() - $tried > TW_RATES_RETRY) {
        // обновляет один запрос, остальные в это время берут прежний курс
        $lock = @fopen($file . '.lock', 'c');
        if ($lock && flock($lock, LOCK_EX | LOCK_NB)) {
            @touch($file . '.try');
            try {
                $new = tw_rates_fetch();
                $new['checked'] = time();
                $tmp = $file . '.' . getmypid();
                if (file_put_contents($tmp, json_encode($new)) !== false) {
                    rename($tmp, $file);
                }
                $rates = $new;
            } catch (Exception $e) {
                error_log('Tian Way rates: ' . $e->getMessage());
                @file_put_contents($file . '.err', substr($e->getMessage(), 0, 300));   // причина — в ответ /api/rates
            }
            flock($lock, LOCK_UN);
        }
        if ($lock) {
            fclose($lock);
        }
    }
    // последняя ошибка получения курса (без секретов: только текст ошибки сети или проверки) — чтобы было видно причину
    $why = is_file($file . '.err') && (!$rates || filemtime($file . '.err') > (isset($rates['checked']) ? (int) $rates['checked'] : 0))
        ? (string) file_get_contents($file . '.err') : '';
    $backup = tw_rates_backup();
    if ($backup && (!$rates || $backup['date'] > $rates['date'])) {
        $rates = $backup;
    }
    if (!$rates) {
        return array('ok' => false, 'reason' => 'none', 'why' => $why);
    }
    if (time() - strtotime($rates['date'] . ' 00:00:00') > TW_RATES_MAX_AGE) {
        return array('ok' => false, 'reason' => 'stale', 'date' => $rates['date']);
    }
    $out = array('ok' => true, 'date' => $rates['date'], 'USD' => (float) $rates['USD'], 'RUB' => (float) $rates['RUB'],
        'source' => 'НБКР');
    if (!empty($rates['backup'])) {
        $out['via'] = 'build';   // курс из автосборки (хостинг сам до НБКР не достучался)
        if ($why !== '') {
            $out['why'] = $why;
        }
    }
    return $out;
}
