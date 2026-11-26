<?php
/* Образец файла lead-config.php — ключ Битрикс24 для lead.php.
   Настоящий lead-config.php лежит только на хостинге рядом с lead.php, на GitHub его нет (.gitignore).
   Обычно его создает автозагрузка на хостинг (.github/workflows/build.yml) из секрета BITRIX_WEBHOOK.

   Где взять адрес: Битрикс24 → Разработчикам → Другое → Входящий вебхук, права — «CRM (crm)» и «Онлайн-запись (booking)»:
   без «Онлайн-записи» не работают занятость машин, проверка дат перед бронью и автоматическая бронь.
   robot_secret — пароль робота «Бронь подтверждена» (секрет BOOKING_ROBOT_SECRET, не короче 16 символов).
   Адрес выглядит так: https://ПОРТАЛ.bitrix24.ru/rest/1/xxxxxxxxxxxxxxxx/ */
return array(
    'webhook' => 'https://ПОРТАЛ.bitrix24.ru/rest/1/КЛЮЧ/',
    'robot_secret' => '',
    // с каких адресов сайта принимать заявки
    'hosts' => array('tianway.kg', 'www.tianway.kg'),
);
