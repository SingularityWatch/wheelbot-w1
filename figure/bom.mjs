// What the robot costs, one row per commodity part, priced on AliExpress.
//
// The phone is not in this list: it is the one part you already own, and the whole point of
// the design is that it is the only expensive thing in the machine. Every other line is a
// part you can buy for a few dollars and plug in one evening.
//
// `q` is the search string a row links to, so a reader can check the price rather than
// trust the table. Prices are the ones I used to build the cost panel and the design record.

export const PRICED_ON = "10.2026";

// Prices are dollar figures; formatting lives here so the page and the docs print them the same.
export const usd = (v) => (v >= 10 ? "$" + v.toFixed(0) : "$" + v.toFixed(2));

export const SEARCH = (q) => `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(q)}`;

// unit: "pc" | "m" | "m²" | "g"
export const BOM = [
  { id: "esp32", qty: 1, unit: "pc", price: 5.78,
    en: { name: "ESP32 DevKit, 30 pins", spec: "BLE + Wi-Fi, 240 MHz, 4 MB flash" },
    q: "ESP32 DevKit V1 30 pin", range: [5.33, 7.22] },

  { id: "pca9685", qty: 1, unit: "pc", price: 2.11,
    en: { name: "PCA9685, 16 PWM channels", spec: "I2C, 12 bit, 50 Hz servo timing" },
    q: "PCA9685 16 channel servo driver", range: [1.89, 2.67] },

  { id: "tb6612", qty: 2, unit: "pc", price: 2.33,
    en: { name: "TB6612FNG motor driver", spec: "2 channels of 1.2 A, two modules for four wheels" },
    q: "TB6612FNG motor driver module", range: [2, 2.89] },

  { id: "mpu", qty: 1, unit: "pc", price: 1.78,
    en: { name: "MPU6050 IMU", spec: "I2C, ±2 g, ±250 °/s — this is what levels the body" },
    q: "MPU6050 GY-521 module", range: [1.56, 2.22] },

  { id: "pcf", qty: 1, unit: "pc", price: 1.44,
    en: { name: "PCF8574 I2C expander", spec: "four brake switches on two wires" },
    q: "PCF8574 I2C expander module", range: [1.22, 1.78] },

  { id: "hip-servo", qty: 8, unit: "pc", price: 5.33,
    en: { name: "MG996R metal-gear servo", spec: "eight: a hip and a knee on every leg, 9.4 kg.cm at 6 V" },
    q: "MG996R servo metal gear", range: [4.67, 6.22] },

  { id: "brake-servo", qty: 4, unit: "pc", price: 1.56,
    en: { name: "SG90 9 g servo", spec: "1.8 kg·cm — it pulls the brake dog back" },
    q: "SG90 9g micro servo", range: [1.33, 2] },

  { id: "motor", qty: 4, unit: "pc", price: 2.89,
    en: { name: "N20 gearmotor, 6 V 200 rpm", spec: "12 mm gearbox, 3 mm D shaft — 0.50 m/s on a Ø48 wheel" },
    q: "N20 gear motor 6V 200rpm", range: [2.44, 3.33] },

  { id: "wheel", qty: 4, unit: "pc", price: 1.44,
    en: { name: "Ø48 rubber wheel", spec: "for an N20 shaft, 26 mm wide" },
    q: "48mm rubber wheel N20", range: [1.22, 1.78] },

  { id: "shifter-spring", qty: 4, unit: "pc", price: 0.33,
    en: { name: "Extension spring 0.5 x 5 x 20", spec: "2 N hold the brake engaged with no power" },
    q: "extension spring 0.5mm 20mm", range: [0.22, 0.5] },

  { id: "cell", qty: 2, unit: "pc", price: 4.22,
    en: { name: "18650 cell, 3500 mAh", spec: "2S = 7.4 V, 25.9 Wh" },
    q: "18650 battery 3500mAh", range: [3.56, 5] },

  { id: "holder", qty: 1, unit: "pc", price: 1.22,
    en: { name: "2 x 18650 holder", spec: "tabbed, bolts to the standoffs" },
    q: "18650 battery holder 2 slot", range: [1, 1.56] },

  { id: "bms", qty: 1, unit: "pc", price: 2.67,
    en: { name: "2S BMS, 20 A", spec: "over-discharge cut-off, balancing" },
    q: "2S 20A BMS 18650", range: [2.22, 3.11] },

  { id: "buck6", qty: 1, unit: "pc", price: 3.22,
    en: { name: "SZBK07 buck, 6 V 8 A", spec: "feeds four servos and four motors" },
    q: "SZBK07 DC DC buck 8A", range: [2.78, 3.78] },

  { id: "buck5", qty: 1, unit: "pc", price: 1.33,
    en: { name: "MP1584 buck, 5 V 3 A", spec: "ESP32 and the phone's charge" },
    q: "MP1584 DC DC buck module", range: [1.11, 1.67] },

  { id: "power", qty: 1, unit: "pc", price: 2.44,
    en: { name: "Switch, XT60, fuse", spec: "20 A rocker, 5 x 20 holder, 5 A" },
    q: "rocker switch 20A XT60 fuse holder", range: [2, 2.89] },

  { id: "microswitch", qty: 4, unit: "pc", price: 0.39,
    en: { name: "KW11 microswitch", spec: "confirms the dog is seated in its slot" },
    q: "KW11 microswitch lever", range: [0.28, 0.56] },

  { id: "petg", qty: 300, unit: "g", price: 0.02,
    en: { name: "PETG, 300 g", spec: "brackets, arms, deck, dock" },
    q: "PETG filament 1.75", range: [0.19, 0.27], per: "10 g" },

  { id: "hardware", qty: 1, unit: "pc", price: 5,
    en: { name: "M2 and M3 hardware", spec: "screws, nuts, 25 mm standoffs, washers" },
    q: "M3 screw kit assorted", range: [4.44, 5.78] },

  { id: "cable", qty: 1, unit: "pc", price: 3.56,
    en: { name: "USB-C cable, right angle", spec: "0.3 m, angled plug into the dock" },
    q: "USB C 90 degree cable 0.3m", range: [2.89, 4.33] },

  { id: "foam", qty: 1, unit: "pc", price: 0.89,
    en: { name: "Foam and hook tape", spec: "dock jaws and the phone's seat" },
    q: "EVA foam sheet 2mm adhesive", range: [0.67, 1.22] },

  { id: "knob", qty: 2, unit: "pc", price: 0.44,
    en: { name: "M4 thumbscrew", spec: "locks the dock's tilt" },
    q: "M4 thumbscrew knurled", range: [0.33, 0.67] },
];

export const rowTotal = (row) => row.qty * row.price;
export const bomTotal = () => BOM.reduce((sum, row) => sum + rowTotal(row), 0);
/** Everything that carries current: boards, drivers, cells, rails, fuses. */
const ELECTRONICS = new Set(["esp32", "pca9685", "tb6612", "mpu", "pcf", "bms", "buck6", "buck5", "power", "cell", "holder", "microswitch", "cable"]);
export const electronicsTotal = () => BOM.filter((row) => ELECTRONICS.has(row.id)).reduce((sum, row) => sum + rowTotal(row), 0);
export const mechanicsTotal = () => bomTotal() - electronicsTotal();

export const WHAT_HUB_PAYS_EN =
  "The phone is not in the bill: it is the one expensive part and you already own it. Everything else is hardware, three servos a leg and printing.";
