<?php
/* =========================================================
   Tian Way — расчет аренды на сервере (ТЗ № 1 «валютная система»): тот же, что в браузере (js/rent-store.js, summary),
   но по data/rent.json на сервере — суммам, пришедшим из браузера, не доверяем.
   Все суммы — в сомах; внутри считаем в тыйынах (целые числа, без дробей float): 1 сом = 100 тыйын.

   tw_rent_calc($car, $fromDay, $toDay, $items) → [
     'nights' => 7, 'rate' => 2010000 (ставка автодома за сутки, тыйын), 'car' => 14070000,
     'lines' => [['id', 'title', 'qty', 'sum' (тыйын), 'note']], 'total', 'prepay', 'rest', 'deposit', 'percent' ]
   $items — [['id' => 'table', 'qty' => 2, 'variant' => 'airport'], …] (что выбрано; цены берутся из data/rent.json).
   Правила: сутки = ночи (день выдачи считается, день возврата — нет); ставка автодома по сроку (1–3, 4–6, 7–13,
   14–20, 21+ суток) — на все сутки; снаряжение и услуги «за сутки» — цена × количество × сутки; доставка — цена
   за направление × направления (не больше 2), бесплатно по Бишкеку от free_from суток, в аэропорт — от
   free_from_airport; «от …», бесплатное и «по запросу» в сумму не входят. Предоплата — prepay_percent % от полной
   стоимости с округлением до тыйына, остаток — полная стоимость минус предоплата, залог — отдельно.
   ========================================================= */

const TW_RENT_TIERS = array('d1' => 1, 'd4' => 4, 'd7' => 7, 'd14' => 14, 'd21' => 21);

function tw_rent_data()
{
    static $data = null;
    if ($data === null) {
        $data = json_decode((string) @file_get_contents(__DIR__ . '/../data/rent.json'), true);
        if (!is_array($data)) {
            $data = array();
        }
    }
    return $data;
}

/** минимальный срок аренды, суток (data/rent.json, min_nights) */
function tw_rent_min_nights()
{
    $d = tw_rent_data();
    return max(1, tw_rent_num(isset($d['min_nights']) ? $d['min_nights'] : 1));
}

function tw_rent_num($v)
{
    return is_numeric($v) ? max(0, (int) round((float) $v)) : 0;
}

/** ставка автодома за сутки (сом) для срока $days; 0 — цена не известна */
function tw_rent_rate($car, $days)
{
    foreach ((array) (isset(tw_rent_data()['cars']) ? tw_rent_data()['cars'] : array()) as $c) {
        if (!isset($c['id']) || $c['id'] !== $car) {
            continue;
        }
        $prices = isset($c['prices']) && is_array($c['prices']) ? $c['prices'] : array();
        $rate = 0;
        $prev = 0;
        foreach (TW_RENT_TIERS as $key => $from) {
            $v = tw_rent_num(isset($prices[$key]) ? $prices[$key] : 0);
            $v = $v ?: $prev;   // пустая ступень — ставка предыдущей (как в tools/build_rent.py)
            $prev = $v;
            if ($days >= $from && $v) {
                $rate = $v;
            }
        }
        return tw_rent_num(isset($prices['d1']) ? $prices['d1'] : 0) ? $rate : 0;
    }
    return 0;
}

/** тип цены вещи — как item_type() в tools/build_rent.py */
function tw_rent_item($id)
{
    $d = tw_rent_data();
    foreach (array('gear', 'services') as $group) {
        foreach ((array) (isset($d[$group]) ? $d[$group] : array()) as $it) {
            if (!isset($it['id']) || $it['id'] !== $id) {
                continue;
            }
            $type = isset($it['type']) && in_array($it['type'], array('day', 'from', 'free', 'quote', 'delivery'), true) ? $it['type'] : 'day';
            $price = tw_rent_num(isset($it['price']) ? $it['price'] : 0);
            if (in_array($type, array('day', 'from', 'delivery'), true) && !$price) {
                $type = $type === 'delivery' ? 'free' : 'quote';
            }
            return array('type' => $type, 'price' => $price, 'name' => isset($it['name']) ? (string) $it['name'] : $id,
                'free_city' => tw_rent_num(isset($it['free_from']) ? $it['free_from'] : 0) ?: 3,
                'free_airport' => tw_rent_num(isset($it['free_from_airport']) ? $it['free_from_airport'] : 0) ?: 5);
        }
    }
    return null;
}

function tw_rent_calc($car, $fromDay, $toDay, $items)
{
    $nights = 0;
    if ($fromDay && $toDay) {
        $nights = (int) round((strtotime($toDay . ' 12:00:00') - strtotime($fromDay . ' 12:00:00')) / 86400);
    }
    $days = max(1, $nights);
    $rate = $car ? tw_rent_rate($car, $days) : 0;
    $out = array('nights' => $nights, 'rate' => $rate * 100, 'car' => $rate * $days * 100, 'lines' => array());
    $total = $out['car'];
    $seen = array();
    foreach ((array) $items as $row) {
        $id = isset($row['id']) && is_string($row['id']) ? $row['id'] : '';
        if ($id === '' || isset($seen[$id]) || !($it = tw_rent_item($id))) {
            continue;
        }
        $seen[$id] = true;
        $max = $it['type'] === 'delivery' ? 2 : 10;
        $qty = isset($row['qty']) ? max(0, min($max, (int) $row['qty'])) : 0;
        if (!$qty) {
            continue;
        }
        $sum = 0;
        $note = '';
        switch ($it['type']) {
            case 'day':
                $sum = $it['price'] * $qty * $days * 100;
                $note = number_format($it['price'], 0, '', ' ') . ' сом × ' . $qty . ' × ' . $days . ' сут.';
                break;
            case 'delivery':
                $where = isset($row['variant']) && $row['variant'] === 'airport' ? 'airport' : 'city';
                $freeFrom = $where === 'airport' ? $it['free_airport'] : $it['free_city'];
                $free = $nights >= $freeFrom;
                $sum = $free ? 0 : $it['price'] * $qty * 100;
                $note = ($where === 'airport' ? 'аэропорт' : 'по Бишкеку') . ', направлений: ' . $qty . ($free ? ' — бесплатно (от ' . $freeFrom . ' суток)' : ', ' . number_format($it['price'], 0, '', ' ') . ' сом за направление');
                break;
            case 'from':
                $note = 'от ' . number_format($it['price'], 0, '', ' ') . ' сом, цену уточнит менеджер (в сумму не входит)';
                break;
            case 'free':
                $note = 'бесплатно';
                break;
            default:
                $note = 'цена по запросу (в сумму не входит)';
        }
        $total += $sum;
        $out['lines'][] = array('id' => $id, 'title' => $it['name'], 'qty' => $qty, 'sum' => $sum, 'note' => $note);
    }
    $d = tw_rent_data();
    $percent = tw_rent_num(isset($d['prepay_percent']) ? $d['prepay_percent'] : 30) ?: 30;
    $out['total'] = $total;
    $out['percent'] = $percent;
    $out['prepay'] = intdiv($total * $percent + 50, 100);   // до тыйына, половина — вверх
    $out['rest'] = $total - $out['prepay'];
    $out['deposit'] = tw_rent_num(isset($d['deposit']) ? $d['deposit'] : 0) * 100;
    return $out;
}

/** тыйыны → «152600» / «45780.30» (для полей «деньги» Битрикса: без разделителей тысяч) */
function tw_kgs($tiyin)
{
    return $tiyin % 100 ? sprintf('%d.%02d', intdiv($tiyin, 100), $tiyin % 100) : (string) intdiv($tiyin, 100);
}

/** тыйыны → «152 600 сом» (для комментария сделки) */
function tw_kgs_text($tiyin)
{
    $int = number_format(intdiv($tiyin, 100), 0, '', ' ');
    return $int . ($tiyin % 100 ? sprintf(',%02d', $tiyin % 100) : '') . ' сом';
}
