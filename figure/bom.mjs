// What the robot costs, one row per commodity part, priced on AliExpress.
//
// The phone is not in this list: it is the one part you already own, and the whole point of
// the design is that it is the only expensive thing in the machine. Every other line is a
// part you can buy for a few hundred roubles and solder or plug in one evening.
//
// `q` is the search string a row links to, so a reader can check the price rather than
// trust the table. Prices are the ones I used to build the cost panel and the design record.

export const PRICED_ON = "10.2026";

// The AUDIENCE IS ENGLISH-SPEAKING, so every price the page prints is in dollars. The rows keep
// the rouble figures the parts were actually bought for and the conversion happens once, here, at
// a stated rate — a reader can check the arithmetic instead of trusting a table.
export const RUB_PER_USD = 90;
export const usd = (rub) => {
  const v = rub / RUB_PER_USD;
  return v >= 10 ? "$" + v.toFixed(0) : "$" + v.toFixed(2);
};

export const SEARCH = (q) => `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(q)}`;

// unit: "pc" | "m" | "m²" | "g"
export const BOM = [
  { id: "esp32", qty: 1, unit: "pc", price: 520,
    ru: { name: "ESP32 DevKit, 30 выводов", spec: "BLE + Wi-Fi, 240 МГц, 4 МБ flash" },
    en: { name: "ESP32 DevKit, 30 pins", spec: "BLE + Wi-Fi, 240 MHz, 4 MB flash" },
    q: "ESP32 DevKit V1 30 pin", range: [480, 650] },

  { id: "pca9685", qty: 1, unit: "pc", price: 190,
    ru: { name: "PCA9685, 16 каналов ШИМ", spec: "I2C, 12 бит, 50 Гц для сервоприводов" },
    en: { name: "PCA9685, 16 PWM channels", spec: "I2C, 12 bit, 50 Hz servo timing" },
    q: "PCA9685 16 channel servo driver", range: [170, 240] },

  { id: "tb6612", qty: 2, unit: "pc", price: 210,
    ru: { name: "TB6612FNG, драйвер моторов", spec: "2 канала по 1.2 А, два модуля на 4 колеса" },
    en: { name: "TB6612FNG motor driver", spec: "2 channels of 1.2 A, two modules for four wheels" },
    q: "TB6612FNG motor driver module", range: [180, 260] },

  { id: "mpu", qty: 1, unit: "pc", price: 160,
    ru: { name: "MPU6050, гироскоп и акселерометр", spec: "I2C, ±2 g, ±250 °/с — по нему выравнивание" },
    en: { name: "MPU6050 IMU", spec: "I2C, ±2 g, ±250 °/s — this is what levels the body" },
    q: "MPU6050 GY-521 module", range: [140, 200] },

  { id: "pcf", qty: 1, unit: "pc", price: 130,
    ru: { name: "PCF8574, 8 входов по I2C", spec: "четыре концевика тормоза на двух проводах" },
    en: { name: "PCF8574 I2C expander", spec: "four brake switches on two wires" },
    q: "PCF8574 I2C expander module", range: [110, 160] },

  { id: "hip-servo", qty: 8, unit: "pc", price: 480,
    ru: { name: "MG996R, металлические шестерни", spec: "8 шт: бедро и колено каждой ноги, 9.4 кг·см при 6 В" },
    en: { name: "MG996R metal-gear servo", spec: "eight: a hip and a knee on every leg, 9.4 kg.cm at 6 V" },
    q: "MG996R servo metal gear", range: [420, 560] },

  { id: "brake-servo", qty: 4, unit: "pc", price: 140,
    ru: { name: "SG90, 9 г", spec: "1.8 кг·см — отводит собачку тормоза" },
    en: { name: "SG90 9 g servo", spec: "1.8 kg·cm — it pulls the brake dog back" },
    q: "SG90 9g micro servo", range: [120, 180] },

  { id: "motor", qty: 4, unit: "pc", price: 260,
    ru: { name: "N20, 6 В, 200 об/мин", spec: "12 мм редуктор, вал 3 мм D — 0.50 м/с на колесе Ø48" },
    en: { name: "N20 gearmotor, 6 V 200 rpm", spec: "12 mm gearbox, 3 mm D shaft — 0.50 m/s on a Ø48 wheel" },
    q: "N20 gear motor 6V 200rpm", range: [220, 300] },

  { id: "wheel", qty: 4, unit: "pc", price: 130,
    ru: { name: "Колесо Ø48, резиновый протектор", spec: "под вал N20, 26 мм ширины" },
    en: { name: "Ø48 rubber wheel", spec: "for an N20 shaft, 26 mm wide" },
    q: "48mm rubber wheel N20", range: [110, 160] },

  { id: "shifter-spring", qty: 4, unit: "pc", price: 30,
    ru: { name: "Пружина растяжения 0.5 x 5 x 20", spec: "2 Н держат тормоз включённым без питания" },
    en: { name: "Extension spring 0.5 x 5 x 20", spec: "2 N hold the brake engaged with no power" },
    q: "extension spring 0.5mm 20mm", range: [20, 45] },

  { id: "cell", qty: 2, unit: "pc", price: 380,
    ru: { name: "18650, 3500 мА·ч", spec: "2S = 7.4 В, 25.9 Вт·ч" },
    en: { name: "18650 cell, 3500 mAh", spec: "2S = 7.4 V, 25.9 Wh" },
    q: "18650 battery 3500mAh", range: [320, 450] },

  { id: "holder", qty: 1, unit: "pc", price: 110,
    ru: { name: "Держатель 2 x 18650", spec: "с выводами, крепится на стойки" },
    en: { name: "2 x 18650 holder", spec: "tabbed, bolts to the standoffs" },
    q: "18650 battery holder 2 slot", range: [90, 140] },

  { id: "bms", qty: 1, unit: "pc", price: 240,
    ru: { name: "BMS 2S, 20 А", spec: "защита от переразряда, балансировка" },
    en: { name: "2S BMS, 20 A", spec: "over-discharge cut-off, balancing" },
    q: "2S 20A BMS 18650", range: [200, 280] },

  { id: "buck6", qty: 1, unit: "pc", price: 290,
    ru: { name: "SZBK07, 6 В 8 А", spec: "раскачивает четыре сервы и четыре мотора" },
    en: { name: "SZBK07 buck, 6 V 8 A", spec: "feeds four servos and four motors" },
    q: "SZBK07 DC DC buck 8A", range: [250, 340] },

  { id: "buck5", qty: 1, unit: "pc", price: 120,
    ru: { name: "MP1584, 5 В 3 А", spec: "ESP32 и зарядка телефона" },
    en: { name: "MP1584 buck, 5 V 3 A", spec: "ESP32 and the phone's charge" },
    q: "MP1584 DC DC buck module", range: [100, 150] },

  { id: "power", qty: 1, unit: "pc", price: 220,
    ru: { name: "Выключатель, XT60, предохранитель", spec: "клавиша 20 А, держатель 5 x 20, 5 А" },
    en: { name: "Switch, XT60, fuse", spec: "20 A rocker, 5 x 20 holder, 5 A" },
    q: "rocker switch 20A XT60 fuse holder", range: [180, 260] },

  { id: "microswitch", qty: 4, unit: "pc", price: 35,
    ru: { name: "Концевик KW11", spec: "подтверждает, что собачка вошла в паз" },
    en: { name: "KW11 microswitch", spec: "confirms the dog is seated in its slot" },
    q: "KW11 microswitch lever", range: [25, 50] },

  { id: "petg", qty: 300, unit: "g", price: 2,
    ru: { name: "PETG, 300 г", spec: "стойки, качалки, кронштейны, док" },
    en: { name: "PETG, 300 g", spec: "brackets, arms, deck, dock" },
    q: "PETG filament 1.75", range: [17, 24], per: "10 g" },

  { id: "hardware", qty: 1, unit: "pc", price: 450,
    ru: { name: "Крепёж M2 и M3", spec: "винты, гайки, стойки 25 мм, шайбы" },
    en: { name: "M2 and M3 hardware", spec: "screws, nuts, 25 mm standoffs, washers" },
    q: "M3 screw kit assorted", range: [400, 520] },

  { id: "cable", qty: 1, unit: "pc", price: 320,
    ru: { name: "Кабель USB-C, 90°", spec: "0.3 м, угловой штекер в док" },
    en: { name: "USB-C cable, right angle", spec: "0.3 m, angled plug into the dock" },
    q: "USB C 90 degree cable 0.3m", range: [260, 390] },

  { id: "foam", qty: 1, unit: "pc", price: 80,
    ru: { name: "Поролон и липучка", spec: "губки дока и площадка под телефон" },
    en: { name: "Foam and hook tape", spec: "dock jaws and the phone's seat" },
    q: "EVA foam sheet 2mm adhesive", range: [60, 110] },

  { id: "knob", qty: 2, unit: "pc", price: 40,
    ru: { name: "Винт-барашек M4", spec: "фиксирует наклон дока" },
    en: { name: "M4 thumbscrew", spec: "locks the dock's tilt" },
    q: "M4 thumbscrew knurled", range: [30, 60] },
];

export const rowTotal = (row) => row.qty * row.price;
export const bomTotal = () => BOM.reduce((sum, row) => sum + rowTotal(row), 0);
/** Everything that carries current: boards, drivers, cells, rails, fuses. */
const ELECTRONICS = new Set(["esp32", "pca9685", "tb6612", "mpu", "pcf", "bms", "buck6", "buck5", "power", "cell", "holder", "microswitch", "cable"]);
export const electronicsTotal = () => BOM.filter((row) => ELECTRONICS.has(row.id)).reduce((sum, row) => sum + rowTotal(row), 0);
export const mechanicsTotal = () => bomTotal() - electronicsTotal();

export const WHAT_HUB_PAYS =
  "Телефона в смете нет: это единственная дорогая часть, и она у вас уже есть. Остальное — крепёж, три сервы на ногу и печать.";
export const WHAT_HUB_PAYS_EN =
  "The phone is not in the bill: it is the one expensive part and you already own it. Everything else is hardware, three servos a leg and printing.";
