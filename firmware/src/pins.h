// =====================================================================================
// WHEELBOT W1 — pin map and hardware constants
// =====================================================================================
// Single source of truth for every GPIO, I2C address, PCA9685 channel and mechanical
// constant that the firmware depends on. main.cpp must not contain a bare pin number.
//
// Sources: SPEC.md "Electronics" and "Mechanics", bom.mjs for the real part names.
//
//   ESP32-WROOM DevKit 30 pin   control loop + BLE GATT
//   PCA9685  0x40  SDA21 SCL22  12 servo channels (4 hip + 4 knee + 4 brake), ch 12-15 spare
//   MPU6050  0x68  same bus     pitch/roll for levelling
//   PCF8574  0x20  same bus     4 brake-confirm microswitches
//   TB6612FNG x2                4 wheel motors
// =====================================================================================

#pragma once
#include <stdint.h>

// -------------------------------------------------------------------------------------
// Leg order. Every array in the firmware is indexed by this enum:
//   0 = front-left, 1 = front-right, 2 = rear-left, 3 = rear-right.
// The BLE telemetry brake-mask bit order and the PCF8574 bit order use it too.
// -------------------------------------------------------------------------------------
enum LegIndex : uint8_t {
  LEG_FL = 0,
  LEG_FR = 1,
  LEG_RL = 2,
  LEG_RR = 3
};
static const uint8_t LEG_COUNT = 4;

// -------------------------------------------------------------------------------------
// I2C bus
// -------------------------------------------------------------------------------------
#define PIN_I2C_SDA 21
#define PIN_I2C_SCL 22
#define I2C_CLOCK_HZ 400000
// Hard cap on a single Wire transaction. Without it a shorted bus can block the loop
// for the driver's own (long) timeout.
#define I2C_TIMEOUT_MS 5

#define I2C_ADDR_PCA9685 0x40
#define I2C_ADDR_MPU6050 0x68
#define I2C_ADDR_PCF8574 0x20

// -------------------------------------------------------------------------------------
// PCA9685 servo channels
// -------------------------------------------------------------------------------------
#define PCA_FREQ_HZ 50  // 20 ms frame, standard analogue servo timing
#define PCA_OSC_HZ 27000000L

enum PcaChannel : uint8_t {
  PCA_CH_HIP_FL = 0,     // two links per leg: hip 0..3, knee 4..7, brake 8..11
  PCA_CH_HIP_FR = 1,
  PCA_CH_HIP_RL = 2,
  PCA_CH_HIP_RR = 3,
  PCA_CH_KNEE_FL = 4,
  PCA_CH_KNEE_FR = 5,
  PCA_CH_KNEE_RL = 6,
  PCA_CH_KNEE_RR = 7,
  PCA_CH_BRAKE_FL = 8,
  PCA_CH_BRAKE_FR = 9,
  PCA_CH_BRAKE_RL = 10,
  PCA_CH_BRAKE_RR = 11,
  PCA_CH_SPARE_0 = 12,   // reserved: phone-dock pan servo
  PCA_CH_SPARE_1 = 13,   // reserved: light
  PCA_CH_COUNT = 16
};

// Hip channels are contiguous starting at 0, brake channels at 4 — the code relies on
// this so that hip channel = PCA_CH_HIP_FL + leg and brake channel = PCA_CH_BRAKE_FL + leg.

// -------------------------------------------------------------------------------------
// Wheel motors, TB6612FNG.
// SPEC.md gives four pin triples in the order 25/26/27, 32/33/14 (left module),
// 12/13/15, 16/17/18 (right module). Each triple is read as PWM, IN1, IN2 — that is the
// pin order silk-screened on the common red TB6612 breakout, verify before you solder.
//   left module  channel A = front-left, channel B = rear-left
//   right module channel A = front-right, channel B = rear-right
// -------------------------------------------------------------------------------------
#define PIN_FL_PWM 25
#define PIN_FL_IN1 26
#define PIN_FL_IN2 27

#define PIN_RL_PWM 32
#define PIN_RL_IN1 33
#define PIN_RL_IN2 14

#define PIN_FR_PWM 12
#define PIN_FR_IN1 13
#define PIN_FR_IN2 15

#define PIN_RR_PWM 16
#define PIN_RR_IN1 17
#define PIN_RR_IN2 18

// TB6612 /STBY. Both modules usually have the pin: tie it to 3V3 (or the 5 V rail the
// module is fed from) if you leave this at -1. Set it to a free GPIO only if you wire
// both modules' /STBY together.
#define PIN_TB_STBY -1

#define MOTOR_PWM_FREQ_HZ 20000  // above audible, well inside TB6612's 100 kHz limit
#define MOTOR_PWM_BITS 8         // duty 0..255
#define MOTOR_MAX_DUTY 255

// GPIO12 (MTDI) is a strapping pin that selects the flash voltage and GPIO15 (MTDO)
// must be low at reset: both are driven low by the firmware before anything else, and
// the TB6612 inputs are high-impedance, so boot is safe — but never fit a pull-up on
// PIN_FR_PWM or PIN_RR_IN2.

// -------------------------------------------------------------------------------------
// LEDs-free indicators
// -------------------------------------------------------------------------------------
#define PIN_MODE_BUTTON 4  // to GND, internal pull-up, active low. GPIO4 is a strapping
                           // pin: do not hold the button while powering up.
#define PIN_BUZZER 19      // passive piezo, driven by LEDC
#define LEDC_CH_BUZZER 4   // LEDC channels 0..3 are the four motors

// -------------------------------------------------------------------------------------
// Battery sense: 2S 18650 pack through a 100k/100k divider into ADC1.
// Fit a 100 nF from the tap to GND: 50k of source impedance is high for the ESP32 ADC.
// -------------------------------------------------------------------------------------
#define PIN_BATT_ADC 34  // input-only pin, ADC1 channel 6
#define BATT_DIVIDER 2.0f
#define BATT_ADC_SAMPLES 8

// -------------------------------------------------------------------------------------
// Brake-confirm microswitches on the PCF8574.
// KW11 levers wired from the expander pin to GND; the expander's internal pull-up makes
// them read 0 when the pawl is seated. BRAKE_SW_ACTIVE_LOW=1 means: switch closed (pin
// low) => clutch ENGAGED. Set it to 0 if your forks are wired the other way round.
// -------------------------------------------------------------------------------------
#define BRAKE_SW_ACTIVE_LOW 1
#define PCF_BIT_BRAKE_FL 0
#define PCF_BIT_BRAKE_FR 1
#define PCF_BIT_BRAKE_RL 2
#define PCF_BIT_BRAKE_RR 3
#define PCF_INPUT_LATCH 0xFF  // all eight pins high = inputs with pull-up

// -------------------------------------------------------------------------------------
// Servo pulse defaults, from SPEC.md / bom.mjs:
//   hips  MG996R 9.4 kg.cm  -> 500..2500 us over the full 0..180 deg travel
//   brakes SG90  1.8 kg.cm  -> 600..2400 us
// These are only the factory fallback; `cal` in the serial console stores the pulses
// that suit your linkage in NVS.
// -------------------------------------------------------------------------------------
#define HIP_PULSE_DEFAULT_US0 500   // pulse for 0 deg
#define HIP_PULSE_DEFAULT_US1 2500  // pulse for 180 deg
#define BRAKE_PULSE_ENGAGE_US 600   // ASSUMPTION: fork pulled in = engage = 600 us
#define BRAKE_PULSE_RELEASE_US 2400 // ASSUMPTION: fork released = 2400 us
                                    // If your fork pulls the other way, swap the two
                                    // numbers with `cal <ch> <us_engage> <us_release>`.

// -------------------------------------------------------------------------------------
// Mechanics (SPEC.md "Geometry"). All in millimetres / degrees.
// -------------------------------------------------------------------------------------
static const float HIP_ARM_MM = 68.0f;    // hip pivot -> axle
static const float AXLE_Z_MM = 24.0f;     // axle height when the arm is vertical
static const float HIP_X_MM = 60.0f;      // hip station, front/rear, from centre
static const float HIP_Y_MM = 61.0f;      // hip plane, left/right, from centre
static const float WHEEL_RADIUS_MM = 24.0f;   // D48 wheel
static const float MOTOR_MAX_RPM = 200.0f;    // N20 6 V 200 rpm, 0.503 m/s at D48

static const float THETA_STANCE_DEG = 20.0f;  // ride height 88 mm
static const float THETA_STOW_DEG = 125.0f;   // arms up, body on its rubber feet
static const float THETA_MIN_DEG = 8.0f;      // ride height 91 mm (top of the range)
static const float THETA_MAX_DEG = 36.0f;     // ride height 79 mm (bottom)

// 1 mm of hip height costs this many degrees of hip angle at stance:
//   dH/dtheta = -L sin(theta) -> 68 * sin(20 deg) = 23.26 mm/rad = 0.406 mm/deg
// (kept as a comment; the firmware computes it from THETA_STANCE_DEG so it stays right
// if the arm length changes)
