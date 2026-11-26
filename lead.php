<?php
/* =========================================================
   Tian Way — прием заявок с сайта и передача в Битрикс24 (новый лид)
   Формы сайта отправляют сюда заявку (js/main.js, sendLead), этот файл передает ее в Битрикс24.
   Работает только на хостинге с PHP (tianway.kg). Ключ Битрикса — в соседнем файле lead-config.php
   (его нет на GitHub; образец — tools/lead-config.example.php, на хостинг его кладет автозагрузка).

   Защита от спама: заявки принимаются только со страниц tianway.kg, не быстрее чем через 2 секунды
   после открытия страницы и не больше 5 заявок за 10 минут с одного адреса.
   ========================================================= */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function answer($ok, $code = 200)
{
    http_response_code($code);
    echo json_encode(array('ok' => $ok));
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    answer(false, 405);
}

$configFile = __DIR__ . '/lead-config.php';
if (!is_file($configFile)) {
    error_log('Tian Way lead.php: нет файла lead-config.php с ключом Битрикс24');
    answer(false, 500);
}
$config = require $configFile;
$webhook = isset($config['webhook']) ? rtrim($config['webhook'], '/') . '/' : '';
if (strpos($webhook, 'https://') !== 0) {
    error_log('Tian Way lead.php: в lead-config.php не указан адрес вебхука Битрикс24');
    answer(false, 500);
}

// заявки — только со страниц сайта
$allowedHosts = isset($config['hosts']) ? $config['hosts'] : array('tianway.kg', 'www.tianway.kg');
$from = !empty($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : (isset($_SERVER['HTTP_REFERER']) ? $_SERVER['HTTP_REFERER'] : '');
$fromHost = strtolower((string) parse_url($from, PHP_URL_HOST));
if (!in_array($fromHost, $allowedHosts, true)) {
    answer(false, 403);
}

$raw = file_get_contents('php://input', false, null, 0, 20000);
$data = json_decode($raw, true);
if (!is_array($data)) {
    answer(false, 400);
}

// форму отправили быстрее, чем человек успел бы ее заполнить, — робот: делаем вид, что все хорошо
if (isset($data['ms']) && (int) $data['ms'] < 2000) {
    answer(true);
}

// не больше 5 заявок за 10 минут с одного адреса
$ip = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '';
$limitFile = sys_get_temp_dir() . '/tianway-lead-' . md5($ip . __DIR__);
$now = time();
$recent = array();
if (is_file($limitFile)) {
    foreach (explode(',', (string) file_get_contents($limitFile)) as $stamp) {
        if ((int) $stamp > $now - 600) {
            $recent[] = (int) $stamp;
        }
    }
}
if (count($recent) >= 5) {
    answer(false, 429);
}
$recent[] = $now;
@file_put_contents($limitFile, implode(',', $recent));

// текст из заявки: без тегов, обрезанный до разумной длины
function clean($value, $max = 300)
{
    if (is_array($value) || is_object($value)) {
        return '';
    }
    $value = trim(strip_tags((string) $value));
    return function_exists('mb_substr') ? mb_substr($value, 0, $max, 'UTF-8') : substr($value, 0, $max);
}

$forms = array(
    'rent' => 'Аренда автодома',
    'trip' => 'Готовое путешествие',
    'fishing' => 'Рыбалка и охота',
    'ask' => 'Вопрос',
    'home' => 'Главная страница',
);
$form = isset($data['form']) && isset($forms[$data['form']]) ? $data['form'] : 'home';
$name = clean(isset($data['name']) ? $data['name'] : '', 100);
$surname = clean(isset($data['surname']) ? $data['surname'] : '', 100);
$contact = clean(isset($data['contact']) ? $data['contact'] : '', 100);
$email = clean(isset($data['email']) ? $data['email'] : '', 100);
$title = clean(isset($data['title']) ? $data['title'] : $forms[$form], 150);
$page = clean(isset($data['page']) ? $data['page'] : '', 500);
$lang = (isset($data['lang']) && $data['lang'] === 'en') ? 'английская' : 'русская';

if ($name === '' && $contact === '') {
    answer(false, 400);
}

// все остальное — в комментарий лида: «подпись: значение» по строкам
$lines = array();
if (isset($data['info']) && is_array($data['info'])) {
    foreach ($data['info'] as $label => $value) {
        $value = clean($value, 1500);
        if ($value !== '') {
            $lines[] = clean($label, 60) . ': ' . $value;
        }
    }
}
$lines[] = 'Версия сайта: ' . $lang;
if ($page !== '') {
    $lines[] = 'Страница: ' . $page;
}

$fields = array(
    'TITLE' => $title . ($name !== '' ? ' — ' . $name : ''),
    'NAME' => $name,
    'LAST_NAME' => $surname,
    'SOURCE_ID' => 'WEB',
    'SOURCE_DESCRIPTION' => 'Сайт tianway.kg: ' . $forms[$form],
    'COMMENTS' => implode("\n", $lines),
    'OPENED' => 'Y',
);

// контакт: есть буквы — это ник или ссылка Telegram, иначе — телефон
if ($contact !== '') {
    if (preg_match('/\p{L}/u', $contact)) {
        $fields['IM'] = array(array('VALUE' => $contact, 'VALUE_TYPE' => 'TELEGRAM'));
    } else {
        $fields['PHONE'] = array(array('VALUE' => $contact, 'VALUE_TYPE' => 'WORK'));
    }
}
if ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $fields['EMAIL'] = array(array('VALUE' => $email, 'VALUE_TYPE' => 'WORK'));
}
if (isset($data['sum']) && is_numeric($data['sum']) && $data['sum'] > 0) {
    $fields['OPPORTUNITY'] = (float) $data['sum'];
    $fields['CURRENCY_ID'] = 'USD';
}

// метки рекламы из адреса страницы (?utm_source=…) — в одноименные поля лида
$query = array();
parse_str((string) parse_url($page, PHP_URL_QUERY), $query);
foreach (array('utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term') as $utm) {
    if (!empty($query[$utm])) {
        $fields[strtoupper($utm)] = clean($query[$utm], 100);
    }
}

$body = http_build_query(array('fields' => $fields, 'params' => array('REGISTER_SONET_EVENT' => 'Y')));
$curl = curl_init($webhook . 'crm.lead.add.json');
curl_setopt_array($curl, array(
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $body,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CONNECTTIMEOUT => 5,
    CURLOPT_TIMEOUT => 12,
));
$response = curl_exec($curl);
$status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
$error = curl_error($curl);
curl_close($curl);

$result = json_decode((string) $response, true);
if ($status === 200 && is_array($result) && !empty($result['result'])) {
    answer(true);
}
error_log('Tian Way lead.php: Битрикс24 не принял заявку (' . $status . ') ' . ($error !== '' ? $error : substr((string) $response, 0, 300)));
answer(false, 502);
