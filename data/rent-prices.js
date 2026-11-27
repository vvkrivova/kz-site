/* =========================================================
   Tian Way — цены аренды в сомах (KGS) для расчета итога: js/rent-store.js
   ФАЙЛ СОБИРАЕТСЯ САМ из data/rent.json (tools/build_rent.py) — руками не править.

   cars  — сом за сутки по сроку: ставки от 1, 4, 7, 14, 21 суток (tiers); ставка срока — на все сутки.
   items — снаряжение и услуги: day — сом за сутки × количество × сутки; from — разовая «от» (в сумму не входит);
           free — бесплатно; quote — цена по запросу; delivery — сом за направление, бесплатно
           по Бишкеку (city) и в аэропорт (airport) от N суток.
   deposit — возвратный залог (отдельно от аренды), prepay — предоплата аренды, %, minNights — минимальный срок, суток.
   ========================================================= */
window.RENT_PRICES = {
  "deposit": 44000,
  "prepay": 30,
  "minNights": 3,
  "tiers": [
    1,
    4,
    7,
    14,
    21
  ],
  "cars": {
    "forland-s1": [
      21900,
      21000,
      20100,
      19700,
      19200
    ],
    "freedom-cannon": [
      21900,
      20500,
      19700,
      19200,
      18800
    ],
    "prado-camper": [
      13100,
      12700,
      12300,
      11800,
      11400
    ]
  },
  "items": {
    "table": {
      "type": "day",
      "price": 200
    },
    "chair": {
      "type": "day",
      "price": 150
    },
    "tent": {
      "type": "day",
      "price": 600
    },
    "sleeping-bag": {
      "type": "day",
      "price": 350
    },
    "mat": {
      "type": "day",
      "price": 150
    },
    "lantern": {
      "type": "day",
      "price": 200
    },
    "grill": {
      "type": "day",
      "price": 450
    },
    "bike": {
      "type": "day",
      "price": 900
    },
    "sup": {
      "type": "day",
      "price": 900
    },
    "fishing": {
      "type": "day",
      "price": 700
    },
    "poles": {
      "type": "day",
      "price": 250
    },
    "kit-camping": {
      "type": "day",
      "price": 1600
    },
    "kit-picnic": {
      "type": "day",
      "price": 850
    },
    "kit-bike": {
      "type": "day",
      "price": 1600
    },
    "sv-route": {
      "type": "free",
      "price": 0
    },
    "sv-custom-route": {
      "type": "from",
      "price": 4500
    },
    "sv-sputnik": {
      "type": "day",
      "price": 1300
    },
    "sv-kid-seat": {
      "type": "day",
      "price": 200
    },
    "sv-delivery": {
      "type": "delivery",
      "price": 2200,
      "free": {
        "city": 3,
        "airport": 5
      }
    },
    "sv-escort": {
      "type": "free",
      "price": 0
    }
  }
};
