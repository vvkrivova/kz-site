<?php
/* Образец файла lead-config.php — ключ Битрикс24 для lead.php.
   Настоящий lead-config.php лежит только на хостинге рядом с lead.php, на GitHub его нет (.gitignore).
   Обычно его создает автозагрузка на хостинг (.github/workflows/build.yml) из секрета BITRIX_WEBHOOK.

   Где взять адрес: Битрикс24 → Разработчикам → Другое → Входящий вебхук, права — только «CRM (crm)».
   Адрес выглядит так: https://ПОРТАЛ.bitrix24.ru/rest/1/xxxxxxxxxxxxxxxx/ */
return array(
    'webhook' => 'https://ПОРТАЛ.bitrix24.ru/rest/1/КЛЮЧ/',
    // с каких адресов сайта принимать заявки
    'hosts' => array('tianway.kg', 'www.tianway.kg'),
);
