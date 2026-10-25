// =====================================================================================
// WHEELBOT W1 — ESP32 firmware
// =====================================================================================
// A four-legged phone robot. The phone is the brain: it drives this chip over a BLE GATT
// link (12-byte commands up, ack + 20-byte telemetry down). Everything that has to stay
// safe when the phone dies lives here.
//
// THE ONE IDEA: the wheel is the foot. A spring-engaged dog clutch in every hub locks the
// wheel to the leg, and an SG90 pulse only ever *pulls* the fork to release it — so the
// brake cannot fail open: flat pack, brown-out or a lost BLE link all leave the robot
// standing on four locked wheels.
//
// Every stop follows the same order, and it is not negotiable:
//     1. stop the motors      2. engage all four brakes      3. flag it
// The motors are gated on the *measured* brake mask, never on our own command, so a
// jammed fork cannot be driven through.
//
// Modes STAND / DRIVE / STOW; FAULT is the fail-safe state, left only by `clear`.
// The loop never blocks more than 10 ms, never allocates, and every array is fixed size.
//
// NOTE: never compiled or run on hardware — there was no ESP32 toolchain on the machine
// this was written on. Read README.md "First power-up" before trusting it with 1.2 kg.
// =====================================================================================

#include <Arduino.h>
#include <Wire.h>
#include <math.h>
#include <string.h>
#include <Preferences.h>
#include <Adafruit_PWMServoDriver.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <esp_system.h>

#include "pins.h"
#include "protocol.h"

// =====================================================================================
// 1. Tunables
// =====================================================================================
static const uint32_t PERIOD_SENSOR_MS = 10;   // IMU sample, 100 Hz
static const uint32_t PERIOD_BRAKE_MS = 20;    // brake switch read
static const uint32_t PERIOD_CONTROL_MS = 20;  // motor mix and write, 50 Hz
static const uint32_t PERIOD_SERVO_MS = 20;    // hip command and PCA9685 write, 50 Hz
static const uint32_t PERIOD_TELEM_MS = 100;   // BLE notify
static const uint32_t PERIOD_BATT_MS = 200;    // pack voltage
static const uint32_t PERIOD_HEALTH_MS = 500;  // I2C ping
static const uint32_t LOOP_IDLE_MS = 1;        // let the idle task breathe

// fail-safe thresholds
static const uint32_t LINK_TIMEOUT_MS = 1000;
static const uint32_t BRAKE_DISAGREE_MS = 400;
static const uint32_t BRAKE_ENGAGE_TIMEOUT_MS = 1200;
static const uint32_t BRAKE_RELEASE_TIMEOUT_MS = 900;
static const uint16_t PACK_MIN_MV = 6000;
static const uint16_t PACK_OK_MV = 6400;             // hysteresis for `clear`
static const uint16_t PACK_MIN_PLAUSIBLE_MV = 3000;  // below: the sensor is broken
static const uint16_t PACK_MAX_PLAUSIBLE_MV = 9500;
static const float TILT_LIMIT_DEG = 40.0f;
static const uint32_t TILT_HOLD_MS = 300;
static const uint8_t I2C_ERRORS_BEFORE_RECOVER = 3;

// drive
static const float MAX_SPEED_MMPS = 500.0f;  // 0.503 m/s at 200 rpm on a D48 wheel
static const float SPIN_RATE_MMPS = 220.0f;  // full-stick spin in place
static const float SPEED_DEADBAND_MMPS = 8.0f;
// arg0 of a drive frame is int8 and the design speed is 500 mm/s, so the wire unit is
// 4 mm/s (+-508 covers the range). An app that sends raw mm/s wants this at 1.0f.
static const float DRIVE_SPEED_LSB_MMPS = 4.0f;
static const int16_t MOTOR_MIN_DUTY = 34;   // stiction: an N20 below this does not turn
static const int16_t MOTOR_SLEW_DUTY = 12;  // per control tick: full scale in ~420 ms

// levelling
static const float LEVEL_DEADBAND_DEG = 0.30f;
static const float LEVEL_GAIN = 0.55f;   // deliberately under-damped: no hunting
static const float LEVEL_MAX_MM = 9.0f;  // SPEC.md: +-9 mm at the hip
static const float COMP_ALPHA = 0.98f;   // complementary filter, gyro weight
static const float HIP_SLEW_DEG_S = 90.0f;

// button
static const uint32_t BTN_DEBOUNCE_MS = 20;
static const uint32_t BTN_LONG_MS = 800;

// NVS
static const char* NVS_NAMESPACE = "wb1";
static const char* NVS_KEY_CAL = "cal";
static const uint16_t CALIB_MAGIC = 0x5742;  // 'WB'
static const uint8_t CALIB_VERSION = 1;

// =====================================================================================
// 2. Types and globals
// =====================================================================================
enum class Mode : uint8_t {
  STAND = WB_MODE_STAND,
  DRIVE = WB_MODE_DRIVE,
  STOW = WB_MODE_STOW,
  FAULT = WB_MODE_FAULT
};

// Servo pulse table. Hips: the pulse at 0 deg and at 180 deg. Brakes: the ENGAGED and the
// RELEASED pulse, because for a two-position fork only the endpoints mean anything.
struct __attribute__((packed)) Calib {
  uint16_t magic;
  uint8_t version;
  uint8_t flags;                   // bit0: levelling on at boot
  uint16_t hipUs[LEG_COUNT][2];    // [leg][0]=0 deg, [1]=180 deg
  uint16_t brakeUs[LEG_COUNT][2];  // [leg][0]=ENGAGED, [1]=RELEASED
  int8_t hipTrimDeg[LEG_COUNT];    // per-hip mechanical zero
  float adcMult;                   // pack mV = pin mV * adcMult + adcOffsetMv
  float adcOffsetMv;
  uint16_t crc;
};

struct MotorPins { uint8_t pwm, in1, in2; };
struct PendingChange { bool active; Mode target; uint32_t sinceMs; };
struct BeepDef { const uint16_t* notes; uint8_t len; uint16_t stepMs; uint16_t periodMs; uint8_t priority; };
enum BeepId : uint8_t { BEEP_NONE = 0, BEEP_KEY, BEEP_MODE, BEEP_LOWBAT, BEEP_FAULT, BEEP_COUNT };

static Adafruit_PWMServoDriver pca(I2C_ADDR_PCA9685);
static Adafruit_MPU6050 mpu;
static Preferences prefs;

static const Calib CAL_DEFAULTS = {
    CALIB_MAGIC, CALIB_VERSION, 1,
    {{HIP_PULSE_DEFAULT_US0, HIP_PULSE_DEFAULT_US1}, {HIP_PULSE_DEFAULT_US0, HIP_PULSE_DEFAULT_US1},
     {HIP_PULSE_DEFAULT_US0, HIP_PULSE_DEFAULT_US1}, {HIP_PULSE_DEFAULT_US0, HIP_PULSE_DEFAULT_US1}},
    {{BRAKE_PULSE_ENGAGE_US, BRAKE_PULSE_RELEASE_US}, {BRAKE_PULSE_ENGAGE_US, BRAKE_PULSE_RELEASE_US},
     {BRAKE_PULSE_ENGAGE_US, BRAKE_PULSE_RELEASE_US}, {BRAKE_PULSE_ENGAGE_US, BRAKE_PULSE_RELEASE_US}},
    {0, 0, 0, 0}, BATT_DIVIDER, 0.0f, 0};
static Calib cal;

static Mode mode = Mode::STAND;
static PendingChange pending = {false, Mode::STAND, 0};
static bool faultLatched = false;
static uint16_t faults = WB_FAULT_NONE;
static bool calSavedDirty = false;  // last NVS write succeeded
static bool forceBrakes = false;    // e-stop bit from the master

static uint8_t brakeMask = 0;  // measured: 1 = ENGAGED
static bool brakeCmdEngaged[LEG_COUNT] = {true, true, true, true};
static uint16_t brakePulseUs[LEG_COUNT] = {0, 0, 0, 0};  // what we last wrote
static bool brakeMismatchActive[LEG_COUNT] = {false, false, false, false};
static uint32_t brakeMismatchMs[LEG_COUNT] = {0, 0, 0, 0};
static bool mismatchMonitorOn = false;
static uint8_t pcfRaw = PCF_INPUT_LATCH;

static float hipTargetDeg[LEG_COUNT] = {THETA_STANCE_DEG, THETA_STANCE_DEG, THETA_STANCE_DEG, THETA_STANCE_DEG};
static float hipCurDeg[LEG_COUNT] = {THETA_STANCE_DEG, THETA_STANCE_DEG, THETA_STANCE_DEG, THETA_STANCE_DEG};
static uint16_t hipPulseUs[LEG_COUNT] = {0, 0, 0, 0};
static bool servoRewriteAll = true;  // after a bus recovery every pulse goes out again

static const MotorPins MOTOR_PINS[LEG_COUNT] = {
    {PIN_FL_PWM, PIN_FL_IN1, PIN_FL_IN2}, {PIN_FR_PWM, PIN_FR_IN1, PIN_FR_IN2},
    {PIN_RL_PWM, PIN_RL_IN1, PIN_RL_IN2}, {PIN_RR_PWM, PIN_RR_IN1, PIN_RR_IN2}};
static const uint8_t LEDC_CH_MOTOR[LEG_COUNT] = {0, 1, 2, 3};
static int16_t motorDuty[LEG_COUNT] = {0, 0, 0, 0};    // on the pins now
static int16_t motorTarget[LEG_COUNT] = {0, 0, 0, 0};  // where the ramp is heading
static float wheelCmdMmps[LEG_COUNT] = {0, 0, 0, 0};
static float maxSpeedScale = 1.0f;

static bool imuOk = false;
static uint32_t imuLastMs = 0;
static float pitchDeg = 0.0f;  // nose up positive
static float rollDeg = 0.0f;   // right side down positive

static uint16_t packMv = 0;
static bool packOk = false;
static uint32_t battLastMs = 0;
static bool levelingEnabled = true;

static volatile bool bleConnected = false;
static volatile bool linkDropEvent = false;
static uint32_t lastFrameMs = 0;
static BLECharacteristic* txChar = nullptr;
static BLECharacteristic* rxChar = nullptr;
static uint16_t framesOk = 0;
static uint16_t framesBad = 0;

// Fixed-size frame ring: the BLE task pushes, the loop pops. No allocation.
static const uint8_t RXQ_LEN = 4;
static WbFrame rxq[RXQ_LEN];
static volatile uint8_t rxqHead = 0;
static volatile uint8_t rxqTail = 0;
static portMUX_TYPE rxqMux = portMUX_INITIALIZER_UNLOCKED;

static bool btnRaw = false, btnStable = false, btnLongFired = false;
static uint32_t btnChangeMs = 0, btnPressMs = 0;

static char serLine[96];
static uint8_t serLen = 0;
static bool monOn = false;

static BeepId beepAlarm = BEEP_NONE, beepEvent = BEEP_NONE, beepPlaying = BEEP_NONE;
static uint8_t beepStep = 0;
static uint32_t beepNextMs = 0, beepStartMs = 0;

enum DevId : uint8_t { DEV_PCA = 0, DEV_MPU = 1, DEV_PCF = 2, DEV_COUNT = 3 };
static uint8_t i2cErrors[DEV_COUNT] = {0, 0, 0};
static uint32_t healthLastMs = 0, i2cRecoveries = 0;
static bool pcaOk = false, pcfOk = false;

static uint32_t now = 0, lastControlMs = 0, lastServoMs = 0, lastTelemMs = 0;
static uint32_t lastBrakeMs = 0, lastMonMs = 0;
static bool tiltActive = false;
static uint32_t tiltMs = 0;

// Cross-references: the fail-safe calls the drivers and the drivers call the fail-safe.
static void safeStop(uint16_t faultBit, const char* why);
static void writeMotors(bool immediate);
static void writeBrakeServos(bool force);
static void requestMode(Mode m, const char* why);
static bool motorsAllowed();
static bool readBrakeSwitches();
static const char* modeName(Mode m);
static void calibrateBuzzer();
static void printStatus();
static void printCalTable();
static void printHelp();
static void saveCalib();
static void clearFaults(const char* why);

// =====================================================================================
// 3. Small helpers
// =====================================================================================
static inline float clampf(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }

static inline int16_t slewi16(int16_t cur, int16_t tgt, int16_t step) {
  if (cur < tgt) return (int16_t)((tgt - cur <= step) ? tgt : cur + step);
  if (cur > tgt) return (int16_t)((cur - tgt <= step) ? tgt : cur - step);
  return cur;
}

// The ESP32 Arduino core moved LEDC from channel-based to pin-based between 2.x and 3.x;
// these two shims keep one source tree building on both.
#if ESP_ARDUINO_VERSION_MAJOR >= 3
static inline void pwmSetup(uint8_t pin, uint8_t ch, uint32_t hz, uint8_t bits) { (void)ch; ledcAttach(pin, hz, bits); }
static inline void pwmWrite(uint8_t pin, uint8_t ch, uint32_t duty) { (void)ch; ledcWrite(pin, duty); }
#else
static inline void pwmSetup(uint8_t pin, uint8_t ch, uint32_t hz, uint8_t bits) { ledcSetup(ch, hz, bits); ledcAttachPin(pin, ch); }
static inline void pwmWrite(uint8_t pin, uint8_t ch, uint32_t duty) { (void)pin; ledcWrite(ch, duty); }
#endif

static void buzzerTone(uint16_t hz) {
  if (hz == 0) { pwmWrite(PIN_BUZZER, LEDC_CH_BUZZER, 0); return; }
#if ESP_ARDUINO_VERSION_MAJOR >= 3
  ledcWriteTone(PIN_BUZZER, hz);
#else
  ledcWriteTone(LEDC_CH_BUZZER, hz);
#endif
}

// =====================================================================================
// 4. NVS calibration
// =====================================================================================
static uint16_t calibCrc(const Calib& c) {
  return wbCrc16(reinterpret_cast<const uint8_t*>(&c), sizeof(Calib) - sizeof(uint16_t));
}

static void loadCalib() {
  cal = CAL_DEFAULTS;
  if (!prefs.begin(NVS_NAMESPACE, true)) { Serial.println(F("[nvs] open failed, defaults")); return; }
  Calib stored;
  const size_t got = prefs.getBytes(NVS_KEY_CAL, &stored, sizeof(stored));
  prefs.end();
  if (got != sizeof(stored) || stored.magic != CALIB_MAGIC || stored.version != CALIB_VERSION) {
    Serial.println(F("[nvs] no usable calibration, defaults"));
    return;
  }
  if (stored.crc != calibCrc(stored)) { Serial.println(F("[nvs] CRC bad, defaults")); return; }
  cal = stored;
  Serial.println(F("[nvs] calibration loaded"));
}

static void saveCalib() {
  cal.magic = CALIB_MAGIC;
  cal.version = CALIB_VERSION;
  cal.crc = calibCrc(cal);
  if (!prefs.begin(NVS_NAMESPACE, false)) { Serial.println(F("[nvs] open for write failed")); return; }
  const size_t put = prefs.putBytes(NVS_KEY_CAL, &cal, sizeof(cal));
  prefs.end();
  calSavedDirty = (put == sizeof(cal));
  Serial.printf("[nvs] calibration saved (%u bytes)\n", (unsigned)put);
}

// =====================================================================================
// 5. I2C: probing, error counting, bus recovery
// =====================================================================================
static bool i2cPing(uint8_t addr) {
  Wire.beginTransmission(addr);
  return Wire.endTransmission() == 0;
}

// Nine clocks on SCL to let a slave that is holding SDA low finish its byte, then a STOP.
// This is the fix for "one device died and took the whole bus with it".
static void i2cBusRecover() {
  Wire.end();
  pinMode(PIN_I2C_SDA, INPUT_PULLUP);
  pinMode(PIN_I2C_SCL, OUTPUT);
  digitalWrite(PIN_I2C_SCL, HIGH);
  delayMicroseconds(5);
  for (uint8_t i = 0; i < 9 && digitalRead(PIN_I2C_SDA) == LOW; i++) {
    digitalWrite(PIN_I2C_SCL, LOW);
    delayMicroseconds(5);
    digitalWrite(PIN_I2C_SCL, HIGH);
    delayMicroseconds(5);
  }
  pinMode(PIN_I2C_SDA, OUTPUT);  // STOP: SDA rises while SCL is high
  digitalWrite(PIN_I2C_SDA, LOW);
  delayMicroseconds(5);
  digitalWrite(PIN_I2C_SCL, HIGH);
  delayMicroseconds(5);
  digitalWrite(PIN_I2C_SDA, HIGH);
  delayMicroseconds(5);
  pinMode(PIN_I2C_SDA, INPUT_PULLUP);
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL, I2C_CLOCK_HZ);
  Wire.setTimeOut(I2C_TIMEOUT_MS);
  i2cRecoveries++;
}

static bool pcaInit() {
  Wire.beginTransmission(I2C_ADDR_PCA9685);
  if (Wire.endTransmission() != 0) return false;
  pca.begin();
  pca.setOscillatorFrequency(PCA_OSC_HZ);
  pca.setPWMFreq(PCA_FREQ_HZ);
  return true;
}

static bool pcfInit() {
  Wire.beginTransmission(I2C_ADDR_PCF8574);
  Wire.write((uint8_t)PCF_INPUT_LATCH);  // all pins high = inputs with pull-up
  return Wire.endTransmission() == 0;
}

static bool mpuInit() {
  if (!mpu.begin(I2C_ADDR_MPU6050, &Wire)) return false;
  mpu.setAccelerometerRange(MPU6050_RANGE_2_G);
  mpu.setGyroRange(MPU6050_RANGE_250_DEG);
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
  return true;
}

static void i2cOk(DevId dev) { i2cErrors[dev] = 0; }

// After a recovery the PCA9685 has lost its prescaler and its outputs, so every servo
// pulse is written again.
static void devicesReinit() {
  pcaOk = pcaInit();
  pcfOk = pcfInit();
  imuOk = mpuInit();
  if (pcaOk) { servoRewriteAll = true; writeBrakeServos(true); } else { faults |= WB_FAULT_I2C_PCA; }
  if (!pcfOk) faults |= WB_FAULT_I2C_PCF;
  if (!imuOk) faults |= WB_FAULT_I2C_MPU;
  // No servo driver: no brakes to command and no legs to hold. No expander: the brake
  // state is unknown. Either one means stop and latch — once. After that the latch stands
  // and the retries below only matter if someone hot-plugs the missing part back in.
  if ((!pcaOk || !pcfOk) && !faultLatched) {
    safeStop(pcaOk ? WB_FAULT_I2C_PCF : WB_FAULT_I2C_PCA, "I2C device lost");
  }
}

static void i2cFailed(DevId dev) {
  if (i2cErrors[dev] < 255) i2cErrors[dev]++;
  if (i2cErrors[dev] < I2C_ERRORS_BEFORE_RECOVER) return;
  i2cErrors[dev] = 0;
  Serial.printf("[i2c] device %u failed %u times, recovering\n", (unsigned)dev,
                (unsigned)I2C_ERRORS_BEFORE_RECOVER);
  i2cBusRecover();
  devicesReinit();
}

// The servo driver's writes never report failure, so ask it directly now and then.
static void healthService(uint32_t nowMs) {
  if (nowMs - healthLastMs < PERIOD_HEALTH_MS) return;
  healthLastMs = nowMs;
  if (i2cPing(I2C_ADDR_PCA9685)) i2cOk(DEV_PCA); else i2cFailed(DEV_PCA);
  if (i2cPing(I2C_ADDR_PCF8574)) i2cOk(DEV_PCF); else i2cFailed(DEV_PCF);
}

// =====================================================================================
// 6. Brakes
// =====================================================================================
static uint16_t brakePulseFor(uint8_t leg, bool engaged) {
  return engaged ? cal.brakeUs[leg][0] : cal.brakeUs[leg][1];
}

static void writeBrakeServos(bool force) {
  if (!pcaOk) return;
  for (uint8_t leg = 0; leg < LEG_COUNT; leg++) {
    const uint16_t us = brakePulseFor(leg, brakeCmdEngaged[leg]);
    if (force || us != brakePulseUs[leg]) {
      pca.writeMicroseconds((uint8_t)(PCA_CH_BRAKE_FL + leg), us);
      brakePulseUs[leg] = us;
    }
  }
}

static void brakeCommandAll(bool engaged) {
  for (uint8_t leg = 0; leg < LEG_COUNT; leg++) brakeCmdEngaged[leg] = engaged;
}

// The brake command is a pure function of the state we are in *or heading to*, decided in
// one place — so no transition can forget to release, and no fault path can leave a wheel
// unbraked.
static Mode effectiveMode() { return pending.active ? pending.target : mode; }

static void updateBrakeCommand() {
  brakeCommandAll(faultLatched || forceBrakes || effectiveMode() != Mode::DRIVE);
}

// Read the four confirm switches. On an I2C error the old mask is kept: a stale mask is
// safer than a fabricated one.
static bool readBrakeSwitches() {
  if (!pcfOk) return false;
  if (Wire.requestFrom((uint16_t)I2C_ADDR_PCF8574, (uint8_t)1) != 1 || Wire.available() < 1) {
    i2cFailed(DEV_PCF);
    return false;
  }
  const uint8_t raw = (uint8_t)Wire.read();
  i2cOk(DEV_PCF);

  uint8_t mask = 0;
  for (uint8_t leg = 0; leg < LEG_COUNT; leg++) {
    const bool level = ((raw >> (PCF_BIT_BRAKE_FL + leg)) & 0x01u) != 0;
#if BRAKE_SW_ACTIVE_LOW
    const bool engaged = !level;
#else
    const bool engaged = level;
#endif
    if (engaged) mask |= (uint8_t)(1u << leg);
  }
  pcfRaw = raw;
  brakeMask = mask;
  return true;
}

static void brakeService(uint32_t nowMs) {
  if (nowMs - lastBrakeMs < PERIOD_BRAKE_MS) return;
  lastBrakeMs = nowMs;
  readBrakeSwitches();
  writeBrakeServos(false);
}

// =====================================================================================
// 7. Motors
// =====================================================================================
// The interlock. Note what is *not* here: our own brake command. The wheels may turn only
// when the four confirm switches say the clutches are open, so a stuck, unplugged or
// lying fork cannot be driven through.
static bool motorsAllowed() {
  return mode == Mode::DRIVE && !pending.active && !faultLatched && !forceBrakes && brakeMask == 0;
}

static int16_t mmpsToDuty(float mmps) {
  const float lim = MAX_SPEED_MMPS * maxSpeedScale;
  mmps = clampf(mmps, -lim, lim);
  const float sign = (mmps < 0.0f) ? -1.0f : 1.0f;
  const float rpm = fabsf(mmps) * 60.0f / (2.0f * PI * WHEEL_RADIUS_MM);
  float duty = rpm / MOTOR_MAX_RPM * (float)MOTOR_MAX_DUTY;
  if (duty > 0.0f && duty < (float)MOTOR_MIN_DUTY) duty = (float)MOTOR_MIN_DUTY;
  return (int16_t)(sign * clampf(duty, 0.0f, (float)MOTOR_MAX_DUTY));
}

// `immediate` skips the ramp: every stop path uses it, because a current spike is worth
// less than a millisecond of extra travel.
static void writeMotors(bool immediate) {
  const bool allowed = motorsAllowed();
  for (uint8_t leg = 0; leg < LEG_COUNT; leg++) {
    if (!allowed) {
      motorDuty[leg] = 0;  // brake engaged, wrong mode or faulted
    } else if (immediate) {
      motorDuty[leg] = motorTarget[leg];
    } else {
      motorDuty[leg] = slewi16(motorDuty[leg], motorTarget[leg], MOTOR_SLEW_DUTY);
    }
    const MotorPins& p = MOTOR_PINS[leg];
    const int16_t d = motorDuty[leg];
    digitalWrite(p.in1, d > 0 ? HIGH : LOW);
    digitalWrite(p.in2, d < 0 ? HIGH : LOW);
    pwmWrite(p.pwm, LEDC_CH_MOTOR[leg], (uint32_t)(d < 0 ? -d : d));
  }
}

static void stopMotorsNow() {
  for (uint8_t leg = 0; leg < LEG_COUNT; leg++) {
    motorTarget[leg] = 0;
    wheelCmdMmps[leg] = 0.0f;
  }
  writeMotors(true);
}

// Skid steer. speed mm/s, steer 0..255 with 128 straight.
// Moving: the outer wheel speeds up and the inner one slows, both clamped to the design
// speed. Stopped with the stick off centre: a spin in place, which the phone app uses to
// aim while standing on the spot.
static void applyDriveCommand(int8_t speedLsb, uint8_t steer) {
  if (mode != Mode::DRIVE || pending.active || faultLatched || forceBrakes) return;

  float v = (float)speedLsb * DRIVE_SPEED_LSB_MMPS;
  if (fabsf(v) < SPEED_DEADBAND_MMPS) v = 0.0f;

  float t = clampf(((float)steer - 128.0f) / 127.0f, -1.0f, 1.0f);
  if (fabsf(t) < 0.02f) t = 0.0f;

  float left, right;
  if (v == 0.0f) {
    left = t * SPIN_RATE_MMPS;
    right = -t * SPIN_RATE_MMPS;
  } else {
    left = v + fabsf(v) * t;
    right = v - fabsf(v) * t;
  }
  const float lim = MAX_SPEED_MMPS * maxSpeedScale;
  left = clampf(left, -lim, lim);
  right = clampf(right, -lim, lim);

  wheelCmdMmps[LEG_FL] = wheelCmdMmps[LEG_RL] = left;
  wheelCmdMmps[LEG_FR] = wheelCmdMmps[LEG_RR] = right;
  for (uint8_t leg = 0; leg < LEG_COUNT; leg++) motorTarget[leg] = mmpsToDuty(wheelCmdMmps[leg]);
}

// =====================================================================================
// 8. Hip servos and levelling
// =====================================================================================
static uint16_t hipPulseFor(uint8_t leg, float deg) {
  const float d = clampf(deg, 0.0f, 180.0f) / 180.0f;
  const float us = (float)cal.hipUs[leg][0] + d * ((float)cal.hipUs[leg][1] - (float)cal.hipUs[leg][0]);
  return (uint16_t)(us + 0.5f);
}

static bool levelingActive() {
  return levelingEnabled && imuOk && mode == Mode::STAND && !pending.active;
}

// Millimetres of body height per degree of hip angle at angle theta: dH/dtheta =
// -L sin(theta), so a needed rise of dz costs -dz/(L sin theta) degrees.
static float degPerMmAt(float thetaDeg) {
  float s = sinf(thetaDeg * DEG_TO_RAD);
  if (s < 0.05f) s = 0.05f;
  return 1.0f / (HIP_ARM_MM * s * DEG_TO_RAD);
}

// Attitude -> four hip angles. The IMU is the only feedback in the machine and its output
// is a *position command*: these are position servos that already close their own loop,
// and a second loop around them would only hunt.
static void computeHipTargets() {
  const bool stow = (effectiveMode() == Mode::STOW);
  const float base = stow ? THETA_STOW_DEG : THETA_STANCE_DEG;
  float dh[LEG_COUNT] = {0.0f, 0.0f, 0.0f, 0.0f};  // + = raise this corner, mm

  if (levelingActive()) {
    const float p = (fabsf(pitchDeg) < LEVEL_DEADBAND_DEG) ? 0.0f : pitchDeg;
    const float r = (fabsf(rollDeg) < LEVEL_DEADBAND_DEG) ? 0.0f : rollDeg;
    // Nose up by p: the front hips are already high, so they come down by 60 tan p and
    // the rear ones rise by the same. Roll is the same argument across the 61 mm plane.
    const float pMm = tanf(p * DEG_TO_RAD) * HIP_X_MM;
    const float rMm = tanf(r * DEG_TO_RAD) * HIP_Y_MM;
    dh[LEG_FL] = -pMm - rMm;
    dh[LEG_FR] = -pMm + rMm;
    dh[LEG_RL] = pMm - rMm;
    dh[LEG_RR] = pMm + rMm;
    for (uint8_t leg = 0; leg < LEG_COUNT; leg++) dh[leg] = clampf(dh[leg] * LEVEL_GAIN, -LEVEL_MAX_MM, LEVEL_MAX_MM);
  }

  // Stow sits outside the ride-height window on purpose.
  const float lo = stow ? THETA_STOW_DEG : THETA_MIN_DEG;
  const float hi = stow ? THETA_STOW_DEG : THETA_MAX_DEG;
  for (uint8_t leg = 0; leg < LEG_COUNT; leg++) {
    const float theta = clampf(base - dh[leg] * degPerMmAt(base), lo, hi);
    hipTargetDeg[leg] = clampf(theta + (float)cal.hipTrimDeg[leg], 0.0f, 180.0f);
  }
}

static void servoService(uint32_t nowMs) {
  const uint32_t dtMs = nowMs - lastServoMs;
  if (dtMs < PERIOD_SERVO_MS) return;
  lastServoMs = nowMs;

  computeHipTargets();
  const float maxStep = HIP_SLEW_DEG_S * ((float)dtMs / 1000.0f);
  for (uint8_t leg = 0; leg < LEG_COUNT; leg++) {
    hipCurDeg[leg] += clampf(hipTargetDeg[leg] - hipCurDeg[leg], -maxStep, maxStep);
    const uint16_t us = hipPulseFor(leg, hipCurDeg[leg]);
    if (pcaOk && (servoRewriteAll || us != hipPulseUs[leg])) {
      pca.writeMicroseconds((uint8_t)(PCA_CH_HIP_FL + leg), us);
      hipPulseUs[leg] = us;
    }
  }
  servoRewriteAll = false;
}

static float meanHipHeightMm() {
  float h = 0.0f;
  for (uint8_t leg = 0; leg < LEG_COUNT; leg++) h += AXLE_Z_MM + HIP_ARM_MM * cosf(hipCurDeg[leg] * DEG_TO_RAD);
  return h / (float)LEG_COUNT;
}

// =====================================================================================
// 9. IMU: complementary filter
// =====================================================================================
// Body frame X right, Y forward, Z up (the MPU sits flat on the upper deck, Y along the
// robot). A static accelerometer then reads ax = -sin(roll), ay = sin(pitch), az =
// cos(pitch) — exactly the sign convention the levelling maths above expects.
static void imuService(uint32_t nowMs) {
  if (!imuOk || nowMs - imuLastMs < PERIOD_SENSOR_MS) return;

  const float dt = clampf((float)(nowMs - imuLastMs) / 1000.0f, 0.005f, 0.05f);
  imuLastMs = nowMs;

  sensors_event_t a, g, temp;
  if (!mpu.getEvent(&a, &g, &temp)) {
    i2cFailed(DEV_MPU);
    return;
  }
  i2cOk(DEV_MPU);

  const float pitchAcc = atan2f(a.acceleration.y, a.acceleration.z) * RAD_TO_DEG;
  const float rollAcc = atan2f(-a.acceleration.x, a.acceleration.z) * RAD_TO_DEG;
  const float pitchRate = g.gyro.x * RAD_TO_DEG;
  const float rollRate = g.gyro.y * RAD_TO_DEG;

  pitchDeg = clampf(COMP_ALPHA * (pitchDeg + pitchRate * dt) + (1.0f - COMP_ALPHA) * pitchAcc, -90.0f, 90.0f);
  rollDeg = clampf(COMP_ALPHA * (rollDeg + rollRate * dt) + (1.0f - COMP_ALPHA) * rollAcc, -90.0f, 90.0f);
}

// =====================================================================================
// 10. Battery
// =====================================================================================
static void batteryService(uint32_t nowMs) {
  if (nowMs - battLastMs < PERIOD_BATT_MS) return;
  battLastMs = nowMs;

  uint32_t sum = 0;
  for (uint8_t i = 0; i < BATT_ADC_SAMPLES; i++) sum += analogReadMilliVolts(PIN_BATT_ADC);
  packMv = (uint16_t)clampf((float)sum / (float)BATT_ADC_SAMPLES * cal.adcMult + cal.adcOffsetMv, 0.0f, 65535.0f);
  packOk = true;

  if (packMv < PACK_MIN_PLAUSIBLE_MV || packMv > PACK_MAX_PLAUSIBLE_MV) {
    // Divider not fitted or sense wire off: a sensor fault, and just as good a reason not
    // to move as a flat pack.
    if (!(faults & WB_FAULT_ADC)) {
      Serial.printf("[batt] implausible %u mV\n", (unsigned)packMv);
      safeStop(WB_FAULT_ADC, "battery sense fault");
    }
  } else if (packMv < PACK_MIN_MV && !(faults & WB_FAULT_BATTERY)) {
    Serial.printf("[batt] pack %u mV below %u\n", (unsigned)packMv, (unsigned)PACK_MIN_MV);
    safeStop(WB_FAULT_BATTERY, "pack low");
  }
}

// =====================================================================================
// 11. Fail-safe and the mode machine
// =====================================================================================
// The one emergency path, in the one order that matters. The flag goes last because the
// phone reads it and the phone is the slowest part of the system.
static void safeStop(uint16_t faultBit, const char* why) {
  stopMotorsNow();         // 1. wheels stop
  brakeCommandAll(true);   // 2. springs take the clutch
  writeBrakeServos(true);  //    (the SG90 only stops pulling)
  faults |= faultBit;      // 3. tell the world
  faultLatched = true;
  mode = Mode::FAULT;
  pending.active = false;
  forceBrakes = (faultBit == WB_FAULT_ESTOP);
  calibrateBuzzer();
  Serial.printf("[fault] 0x%04X %s\n", (unsigned)faultBit, why ? why : "");
}

static void calibrateBuzzer() {
  if (faultLatched) {
    beepAlarm = BEEP_FAULT;
  } else if (packOk && packMv > 0 && packMv < PACK_MIN_MV + 200) {
    beepAlarm = BEEP_LOWBAT;
  } else {
    beepAlarm = BEEP_NONE;
  }
}

// Ask for a mode. Moves nothing itself: parks the wheels, records the destination, and
// lets modeService() wait for the switches to agree.
static void requestMode(Mode m, const char* why) {
  if (m == Mode::FAULT) return;
  if (m == Mode::DRIVE) {
    if (faultLatched) { Serial.println(F("[mode] refused: fault latched, `clear` first")); return; }
    if (!packOk || packMv < PACK_MIN_MV) { Serial.println(F("[mode] refused: pack low")); return; }
    if (!pcaOk || !pcfOk) { Serial.println(F("[mode] refused: brake hardware down")); return; }
  }
  if (mode == m && !pending.active) return;
  if (pending.active && pending.target == m) return;

  stopMotorsNow();  // nothing rolls while a clutch is moving
  // forceBrakes is deliberately *not* cleared here: it belongs to whoever sent the last
  // frame. The serial console and the button clear it themselves, because a human in
  // front of the robot outranks a phone that may already be out of range.
  pending.target = m;
  pending.sinceMs = millis();
  pending.active = true;
  Serial.printf("[mode] %s -> %s (%s)\n", modeName(mode), modeName(m), why ? why : "");
}

static void modeService(uint32_t nowMs) {
  if (!pending.active) return;

  const bool wantDrive = (pending.target == Mode::DRIVE);
  if (wantDrive ? (brakeMask == 0) : (brakeMask == 0x0F)) {
    mode = pending.target;
    pending.active = false;
    Serial.println(wantDrive ? "[mode] DRIVE, four clutches open" : "[mode] brakes confirmed 4/4");
    return;
  }
  if (nowMs - pending.sinceMs > (wantDrive ? BRAKE_RELEASE_TIMEOUT_MS : BRAKE_ENGAGE_TIMEOUT_MS)) {
    safeStop(wantDrive ? WB_FAULT_BRAKE_RELEASE : WB_FAULT_BRAKE_ENGAGE,
             wantDrive ? "brake did not release" : "brake did not engage");
  }
}

static void safetyService(uint32_t nowMs) {
  // A disconnect reported by the BLE task: no frame can arrive, so treat it as a loss.
  if (linkDropEvent) {
    linkDropEvent = false;
    if (mode == Mode::DRIVE) safeStop(WB_FAULT_LINK, "BLE disconnected");
  }

  // 1. link watchdog, only while the wheels may turn
  if (mode == Mode::DRIVE && !faultLatched && (nowMs - lastFrameMs) > LINK_TIMEOUT_MS) {
    safeStop(WB_FAULT_LINK, "no valid frame in 1000 ms");
  }

  // 2. every confirm switch must agree with the command
  if (mismatchMonitorOn) {
    for (uint8_t leg = 0; leg < LEG_COUNT; leg++) {
      const bool cmd = brakeCmdEngaged[leg];
      const bool sw = ((brakeMask >> leg) & 0x01u) != 0;
      if (cmd == sw) { brakeMismatchActive[leg] = false; continue; }
      if (!brakeMismatchActive[leg]) { brakeMismatchActive[leg] = true; brakeMismatchMs[leg] = nowMs; continue; }
      if (nowMs - brakeMismatchMs[leg] > BRAKE_DISAGREE_MS) {
        Serial.printf("[brake] leg %u: commanded %u, switch %u\n", (unsigned)leg, (unsigned)cmd, (unsigned)sw);
        safeStop(WB_FAULT_BRAKE_MISMATCH, "brake switch disagrees");
        return;
      }
    }
  }

  // 3. a robot on its side must not keep driving
  if (mode == Mode::DRIVE && imuOk && !faultLatched) {
    if (fabsf(pitchDeg) > TILT_LIMIT_DEG || fabsf(rollDeg) > TILT_LIMIT_DEG) {
      if (!tiltActive) { tiltActive = true; tiltMs = nowMs; }
      else if (nowMs - tiltMs > TILT_HOLD_MS) safeStop(WB_FAULT_TILT, "tilt beyond 40 deg");
    } else {
      tiltActive = false;
    }
  }
}

static void clearFaults(const char* why) {
  if (packOk && packMv < PACK_OK_MV) {
    Serial.printf("[clear] refused: %u mV < %u\n", (unsigned)packMv, (unsigned)PACK_OK_MV);
    return;
  }
  if (brakeMask != 0x0F) { Serial.println(F("[clear] refused: brakes not 4/4")); return; }
  if (!pcaOk || !pcfOk) { Serial.println(F("[clear] refused: brake hardware down")); return; }

  faults = WB_FAULT_NONE;
  faultLatched = false;
  forceBrakes = false;
  tiltActive = false;
  mode = Mode::STAND;
  pending.active = false;
  Serial.printf("[clear] cleared (%s)\n", why ? why : "");
}

static void controlService(uint32_t nowMs) {
  if (nowMs - lastControlMs < PERIOD_CONTROL_MS) return;
  lastControlMs = nowMs;

  updateBrakeCommand();
  writeMotors(false);
  if (!motorsAllowed()) {
    for (uint8_t leg = 0; leg < LEG_COUNT; leg++) wheelCmdMmps[leg] = 0.0f;
  }
}

// =====================================================================================
// 12. BLE
// =====================================================================================
static void pushFrame(const uint8_t* buf, size_t len) {
  if (len != WB_FRAME_LEN) { framesBad++; return; }
  WbFrame f;
  memcpy(&f, buf, sizeof(f));  // copy first: the stack's buffer may not be aligned
  if (wbCrc16(reinterpret_cast<const uint8_t*>(&f), 8) != f.crc || f.reserved != 0) {
    framesBad++;
    return;
  }
  framesOk++;

  portENTER_CRITICAL(&rxqMux);
  const uint8_t next = (uint8_t)((rxqHead + 1u) % RXQ_LEN);
  if (next == rxqTail) rxqTail = (uint8_t)((rxqTail + 1u) % RXQ_LEN);  // full: drop oldest
  rxq[rxqHead] = f;                                                    // newest command wins
  rxqHead = next;
  portEXIT_CRITICAL(&rxqMux);
}

static bool popFrame(WbFrame& out) {
  bool got = false;
  portENTER_CRITICAL(&rxqMux);
  if (rxqTail != rxqHead) {
    out = rxq[rxqTail];
    rxqTail = (uint8_t)((rxqTail + 1u) % RXQ_LEN);
    got = true;
  }
  portEXIT_CRITICAL(&rxqMux);
  return got;
}

static void sendAck(uint32_t nonce) {
  if (!txChar || !bleConnected) return;
  uint8_t ack[WB_ACK_LEN] = {(uint8_t)(nonce), (uint8_t)(nonce >> 8), (uint8_t)(nonce >> 16),
                             (uint8_t)(nonce >> 24)};
  txChar->setValue(ack, WB_ACK_LEN);
  txChar->notify();
}

class WbServerCallbacks : public BLEServerCallbacks {
 public:
  void onConnect(BLEServer* srv) override {
    (void)srv;
    bleConnected = true;
    Serial.println(F("[ble] phone connected"));
  }
  void onDisconnect(BLEServer* srv) override {
    (void)srv;
    bleConnected = false;
    linkDropEvent = true;  // acted on in safetyService(), never from the BLE task
    Serial.println(F("[ble] phone disconnected"));
    BLEDevice::startAdvertising();
  }
};

class WbRxCallbacks : public BLECharacteristicCallbacks {
 public:
  void onWrite(BLECharacteristic* ch) override {
    if (ch) pushFrame(ch->getData(), ch->getLength());
  }
};

static void bleInit() {
  BLEDevice::init(WB_DEVICE_NAME);
  BLEServer* server = BLEDevice::createServer();
  server->setCallbacks(new WbServerCallbacks());
  BLEService* svc = server->createService(BLEUUID(WB_SERVICE_UUID), 40, 0);

  rxChar = svc->createCharacteristic(WB_RX_UUID, BLECharacteristic::PROPERTY_WRITE |
                                                        BLECharacteristic::PROPERTY_WRITE_NR);
  rxChar->setCallbacks(new WbRxCallbacks());
  txChar = svc->createCharacteristic(WB_TX_UUID, BLECharacteristic::PROPERTY_NOTIFY);
  svc->start();

  BLEAdvertising* adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(WB_SERVICE_UUID);
  adv->setScanResponse(true);
  BLEDevice::startAdvertising();
  Serial.printf("[ble] advertising as %s\n", WB_DEVICE_NAME);
}

// =====================================================================================
// 13. Command handling and telemetry
// =====================================================================================
static void handleTrim(const WbFrame& f) {
  if (f.arg0 >= LEG_COUNT) return;
  int v = (int8_t)f.arg1;
  v = v > 45 ? 45 : (v < -45 ? -45 : v);
  cal.hipTrimDeg[f.arg0] = (int8_t)v;
  saveCalib();
  Serial.printf("[trim] leg %u = %d deg\n", (unsigned)f.arg0, v);
}

static void handleConfig(const WbFrame& f) {
  if (f.arg0 == WB_CFG_LEVEL_DEFAULT) {
    levelingEnabled = (f.arg1 != 0);
    cal.flags = levelingEnabled ? (uint8_t)(cal.flags | 0x01) : (uint8_t)(cal.flags & ~0x01);
    saveCalib();
  } else if (f.arg0 == WB_CFG_MAX_SPEED) {
    const uint8_t pct = (f.arg1 < 50) ? 50 : f.arg1;
    maxSpeedScale = (float)pct / 100.0f;
    Serial.printf("[cfg] max speed %u%%\n", (unsigned)pct);
  } else {
    Serial.printf("[cfg] unknown key %u\n", (unsigned)f.arg0);
  }
}

static void handleFrame(const WbFrame& f) {
  lastFrameMs = millis();
  sendAck(f.nonce);

  // The flag bits apply to every frame type: they are the master's hand on the dead-man
  // switch and must not be skipped because of an unexpected type byte.
  forceBrakes = (f.flags & WB_FLAG_FORCE_BRAKES) != 0;
  levelingEnabled = (f.flags & WB_FLAG_LEVEL) != 0;
  if (f.flags & WB_FLAG_BUZZER) beepEvent = BEEP_KEY;
  if (forceBrakes && mode == Mode::DRIVE) stopMotorsNow();

  switch (f.type) {
    case WB_FRAME_DRIVE: applyDriveCommand((int8_t)f.arg0, f.arg1); break;
    case WB_FRAME_MODE: if (f.arg0 <= 2) requestMode(static_cast<Mode>(f.arg0), "ble"); break;
    case WB_FRAME_TRIM: handleTrim(f); break;
    case WB_FRAME_CONFIG: handleConfig(f); break;
    default: framesBad++; break;
  }
}

static void bleService(uint32_t nowMs) {
  WbFrame f;
  for (uint8_t drained = 0; drained < RXQ_LEN && popFrame(f); drained++) handleFrame(f);

  if (nowMs - lastTelemMs < PERIOD_TELEM_MS) return;
  lastTelemMs = nowMs;

  WbTelemetry t;
  memset(&t, 0, sizeof(t));
  t.mode = (uint8_t)mode;
  t.brakeMask = brakeMask;
  t.rideHeightMm = (uint16_t)clampf(meanHipHeightMm(), 0.0f, 65535.0f);
  t.pitchCdeg = (int16_t)(pitchDeg * 100.0f);
  t.rollCdeg = (int16_t)(rollDeg * 100.0f);
  t.packMv = packMv;

  // No shunt in the BOM (bom.mjs has no current sensor) and no encoders, so current is
  // estimated from the duty against the 6.6 A four-motor stall figure in SPEC.md and rpm
  // is the commanded value. Both are honest estimates, not measurements.
  uint32_t mA = 0;
  for (uint8_t leg = 0; leg < LEG_COUNT; leg++) {
    const uint16_t d = (uint16_t)(motorDuty[leg] < 0 ? -motorDuty[leg] : motorDuty[leg]);
    mA += (uint32_t)d * 1650u / (uint32_t)MOTOR_MAX_DUTY;
    int rpmHalf = (int)(wheelCmdMmps[leg] * 60.0f / (2.0f * PI * WHEEL_RADIUS_MM) / 2.0f);
    rpmHalf = rpmHalf > 127 ? 127 : (rpmHalf < -127 ? -127 : rpmHalf);
    t.wheelRpmDiv2[leg] = (int8_t)rpmHalf;
  }
  t.currentMa = (uint16_t)(mA > 65535u ? 65535u : mA);
  t.faults = (uint16_t)(faults | (forceBrakes ? WB_FAULT_ESTOP : 0));

  uint8_t fl = 0;
  if (levelingActive()) fl |= WB_TF_LEVELING;
  if (packOk && packMv < PACK_MIN_MV + 200) fl |= WB_TF_LOW_BATTERY;
  if (motorsAllowed()) fl |= WB_TF_MOTORS_ENABLED;
  if (forceBrakes) fl |= WB_TF_BRAKES_FORCED;
  if (bleConnected) fl |= WB_TF_BLE_CONNECTED;
  if (calSavedDirty) fl |= WB_TF_CAL_SAVED;
  t.flags = fl;
  wbSealTelemetry(t);

  if (txChar && bleConnected) {
    txChar->setValue(reinterpret_cast<uint8_t*>(&t), WB_TELEM_LEN);
    txChar->notify();
  }
}

// =====================================================================================
// 14. Buzzer and the mode button
// =====================================================================================
static const uint16_t PAT_KEY[] = {1800, 0};
static const uint16_t PAT_MODE[] = {1300, 0, 1700};
static const uint16_t PAT_LOWBAT[] = {900, 0, 900, 0, 900, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0};
static const uint16_t PAT_FAULT[] = {2300, 0, 2300, 0, 2300};

static const BeepDef BEEPS[BEEP_COUNT] = {
    {nullptr, 0, 0, 0, 0},
    {PAT_KEY, 2, 60, 0, 0},
    {PAT_MODE, 3, 70, 0, 1},
    {PAT_LOWBAT, 20, 120, 4000, 2},
    {PAT_FAULT, 5, 90, 1400, 3},
};

static void beepStart(BeepId id, uint32_t nowMs) {
  beepPlaying = id;
  beepStep = 0;
  beepStartMs = nowMs;
  beepNextMs = nowMs;
}

static void buzzerService(uint32_t nowMs) {
  const BeepId want = (beepAlarm != BEEP_NONE) ? beepAlarm : beepEvent;
  if (want != beepPlaying) {
    if (want == BEEP_NONE) { beepPlaying = BEEP_NONE; buzzerTone(0); return; }
    beepStart(want, nowMs);
  }
  if (beepPlaying == BEEP_NONE) return;

  const BeepDef& def = BEEPS[beepPlaying];
  if (def.notes == nullptr || def.len == 0 || nowMs < beepNextMs) return;

  if (beepStep >= def.len) {
    if (def.periodMs == 0) {  // one-shot finished
      if (beepPlaying == beepEvent) beepEvent = BEEP_NONE;
      beepPlaying = BEEP_NONE;
      buzzerTone(0);
      return;
    }
    const uint32_t restartAt = beepStartMs + def.periodMs;
    if (nowMs < restartAt) { beepNextMs = restartAt; return; }
    beepStart(beepPlaying, nowMs);
  }
  buzzerTone(def.notes[beepStep]);
  beepStep++;
  beepNextMs = nowMs + def.stepMs;
}

// Short press toggles STAND <-> DRIVE, long press stows. The long press fires while the
// button is still held so the user gets feedback without waiting for the release.
static void buttonService(uint32_t nowMs) {
  const bool raw = (digitalRead(PIN_MODE_BUTTON) == LOW);
  if (raw != btnRaw) { btnRaw = raw; btnChangeMs = nowMs; }
  if (nowMs - btnChangeMs < BTN_DEBOUNCE_MS) return;

  if (btnStable != raw) {
    btnStable = raw;
    if (raw) {
      btnPressMs = nowMs;
      btnLongFired = false;
    } else if (!btnLongFired) {
      beepEvent = BEEP_KEY;
      forceBrakes = false;  // a hand on the robot outranks a phone that may be gone
      requestMode(mode == Mode::STAND ? Mode::DRIVE : Mode::STAND, "button");
    }
  }
  if (btnStable && !btnLongFired && (nowMs - btnPressMs) >= BTN_LONG_MS) {
    btnLongFired = true;
    beepEvent = BEEP_MODE;
    forceBrakes = false;
    requestMode(Mode::STOW, "button long press");
  }
}

// =====================================================================================
// 15. Serial console
// =====================================================================================
static const char* modeName(Mode m) {
  switch (m) {
    case Mode::STAND: return "STAND";
    case Mode::DRIVE: return "DRIVE";
    case Mode::STOW: return "STOW";
    default: return "FAULT";
  }
}

static void printStatus() {
  Serial.printf("mode=%s latched=%u faults=0x%04X pack=%umV adc=%s\n", modeName(mode), (unsigned)faultLatched,
                (unsigned)faults, (unsigned)packMv, packOk ? "ok" : "none");
  Serial.printf("brakes cmd=%u%u%u%u sw=%u%u%u%u raw=0x%02X | pca=%s pcf=%s imu=%s\n",
                (unsigned)brakeCmdEngaged[0], (unsigned)brakeCmdEngaged[1], (unsigned)brakeCmdEngaged[2],
                (unsigned)brakeCmdEngaged[3], (unsigned)(brakeMask & 1), (unsigned)((brakeMask >> 1) & 1),
                (unsigned)((brakeMask >> 2) & 1), (unsigned)((brakeMask >> 3) & 1), (unsigned)pcfRaw,
                pcaOk ? "ok" : "down", pcfOk ? "ok" : "down", imuOk ? "ok" : "down");
  Serial.print("hips cmd/act:");
  for (uint8_t leg = 0; leg < LEG_COUNT; leg++) Serial.printf(" %.1f/%.1f", hipTargetDeg[leg], hipCurDeg[leg]);
  Serial.printf("\nheight=%.1fmm pitch=%.2f roll=%.2f level=%u\n", meanHipHeightMm(), pitchDeg, rollDeg,
                (unsigned)levelingActive());
  Serial.printf("duty %d %d %d %d | ble=%u ok=%u bad=%u | i2c rec=%u err=%u/%u/%u\n", motorDuty[0], motorDuty[1],
                motorDuty[2], motorDuty[3], (unsigned)bleConnected, (unsigned)framesOk, (unsigned)framesBad,
                (unsigned)i2cRecoveries, (unsigned)i2cErrors[DEV_PCA], (unsigned)i2cErrors[DEV_MPU],
                (unsigned)i2cErrors[DEV_PCF]);
}

static void printCalTable() {
  Serial.println(F("ch   us0 (0 deg / engaged)   us1 (180 deg / released)"));
  for (uint8_t leg = 0; leg < LEG_COUNT; leg++)
    Serial.printf("hip%u  %6u  %6u\n", (unsigned)leg, (unsigned)cal.hipUs[leg][0], (unsigned)cal.hipUs[leg][1]);
  for (uint8_t leg = 0; leg < LEG_COUNT; leg++)
    Serial.printf("brk%u  %6u  %6u\n", (unsigned)(leg + 4), (unsigned)cal.brakeUs[leg][0],
                  (unsigned)cal.brakeUs[leg][1]);
  Serial.printf("trim %d %d %d %d | adc mult=%.4f offset=%.1f mV cal=%s\n", cal.hipTrimDeg[0],
                cal.hipTrimDeg[1], cal.hipTrimDeg[2], cal.hipTrimDeg[3], cal.adcMult, cal.adcOffsetMv,
                calSavedDirty ? "saved" : "defaults");
}

static void printHelp() {
  Serial.println(F("WHEELBOT W1 console"));
  Serial.println(F("  help                    this text"));
  Serial.println(F("  status / mon <0|1>      state dump / repeat it every 500 ms"));
  Serial.println(F("  cal                     show the pulse table"));
  Serial.println(F("  cal <ch> <us0> <us1>    hip 0-3: pulses at 0/180 deg; brake 4-7: engage/release"));
  Serial.println(F("  cal default             factory pulses"));
  Serial.println(F("  trim <leg> <-45..45>    per-hip zero offset, saved"));
  Serial.println(F("  hip <leg> <deg>         same offset expressed as an absolute stance angle"));
  Serial.println(F("  adc <mult> <offset_mv>  pack = pin * mult + offset, saved"));
  Serial.println(F("  save                    write calibration to NVS"));
  Serial.println(F("  mode <0|1|2>            STAND / DRIVE / STOW"));
  Serial.println(F("  brake <0|1>             bench: release / engage all four"));
  Serial.println(F("  level <0|1>             levelling on/off"));
  Serial.println(F("  clear                   clear latched faults (brakes must be 4/4)"));
  Serial.println(F("  estop                   stop now, brakes on"));
}

static void execLine(char* line) {
  if (line[0] == '\0') return;

  if (!strcmp(line, "help")) {
    printHelp();
  } else if (!strcmp(line, "status")) {
    printStatus();
  } else if (!strncmp(line, "mon", 3)) {
    int v = 0;
    if (sscanf(line + 3, "%d", &v) == 1) monOn = (v != 0);
    Serial.printf("monitor %s\n", monOn ? "on" : "off");
  } else if (!strcmp(line, "cal")) {
    printCalTable();
  } else if (!strcmp(line, "cal default")) {
    const uint8_t keep = cal.flags;
    cal = CAL_DEFAULTS;
    cal.flags = keep;
    saveCalib();
    Serial.println(F("[cal] defaults restored"));
  } else if (!strncmp(line, "cal ", 4)) {
    int ch = -1, a = 0, b = 0;
    if (sscanf(line + 4, "%d %d %d", &ch, &a, &b) != 3) { Serial.println(F("usage: cal <ch> <us0> <us1>")); return; }
    if (ch < 0 || ch > 7) { Serial.println(F("[cal] channel 0-3 hips, 4-7 brakes")); return; }
    if (a < 300 || a > 2700 || b < 300 || b > 2700) { Serial.println(F("[cal] pulses 300..2700 us")); return; }
    if (ch < 4) {
      cal.hipUs[ch][0] = (uint16_t)a;
      cal.hipUs[ch][1] = (uint16_t)b;
      servoRewriteAll = true;
    } else {
      cal.brakeUs[ch - 4][0] = (uint16_t)a;  // engaged
      cal.brakeUs[ch - 4][1] = (uint16_t)b;  // released
      writeBrakeServos(true);
    }
    saveCalib();
    Serial.printf("[cal] ch %d = %d..%d us\n", ch, a, b);
  } else if (!strncmp(line, "trim", 4)) {
    int leg = -1, deg = 0;
    if (sscanf(line + 4, "%d %d", &leg, &deg) != 2) {
      Serial.printf("trim %d %d %d %d\n", cal.hipTrimDeg[0], cal.hipTrimDeg[1], cal.hipTrimDeg[2],
                    cal.hipTrimDeg[3]);
      return;
    }
    if (leg < 0 || leg >= (int)LEG_COUNT) { Serial.println(F("[trim] leg 0..3")); return; }
    deg = deg > 45 ? 45 : (deg < -45 ? -45 : deg);
    cal.hipTrimDeg[leg] = (int8_t)deg;
    saveCalib();
    Serial.printf("[trim] leg %d = %d deg\n", leg, deg);
  } else if (!strncmp(line, "hip", 3)) {
    int leg = -1;
    float deg = 0.0f;
    if (sscanf(line + 3, "%d %f", &leg, &deg) != 2 || leg < 0 || leg >= (int)LEG_COUNT) {
      Serial.println(F("usage: hip <leg 0..3> <deg>"));
      return;
    }
    if (mode == Mode::DRIVE) { Serial.println(F("[hip] refused while driving")); return; }
    // Expressed as trim, not as a position: the servo loop recomputes the stance pose 50
    // times a second, so any other kind of jog would be overwritten on the next tick.
    int delta = (int)lroundf(clampf(deg, 0.0f, 180.0f) - THETA_STANCE_DEG);
    delta = delta > 45 ? 45 : (delta < -45 ? -45 : delta);
    cal.hipTrimDeg[leg] = (int8_t)delta;
    saveCalib();
    Serial.printf("[hip] leg %d trim %d deg, parks at %.1f\n", leg, delta, THETA_STANCE_DEG + (float)delta);
  } else if (!strncmp(line, "adc", 3)) {
    float m = 0.0f, o = 0.0f;
    if (sscanf(line + 3, "%f %f", &m, &o) != 2 || m < 0.5f || m > 8.0f) {
      Serial.printf("[adc] mult=%.4f offset=%.1f pack=%u mV\n", cal.adcMult, cal.adcOffsetMv,
                    (unsigned)packMv);
      return;
    }
    cal.adcMult = m;
    cal.adcOffsetMv = o;
    saveCalib();
    Serial.printf("[adc] mult=%.4f offset=%.1f\n", m, o);
  } else if (!strcmp(line, "save")) {
    saveCalib();
  } else if (!strncmp(line, "mode", 4)) {
    int v = -1;
    if (sscanf(line + 4, "%d", &v) == 1 && v >= 0 && v <= 2) {
      forceBrakes = false;
      requestMode(static_cast<Mode>(v), "serial");
    } else {
      Serial.println(F("usage: mode <0|1|2>"));
    }
  } else if (!strncmp(line, "brake", 5)) {
    int v = -1;
    if (sscanf(line + 5, "%d", &v) != 1 || (v != 0 && v != 1)) { Serial.println(F("usage: brake <0|1>")); return; }
    if (mode == Mode::DRIVE || pending.active) { Serial.println(F("[brake] refused: wheels are live")); return; }
    brakeCommandAll(v == 1);
    writeBrakeServos(true);
    Serial.printf("[brake] all %s commanded\n", v ? "ENGAGED" : "RELEASED");
  } else if (!strncmp(line, "level", 5)) {
    int v = -1;
    if (sscanf(line + 5, "%d", &v) == 1) {
      levelingEnabled = (v != 0);
      Serial.printf("[level] %s\n", levelingEnabled ? "on" : "off");
    }
  } else if (!strcmp(line, "clear")) {
    clearFaults("serial");
  } else if (!strcmp(line, "estop")) {
    safeStop(WB_FAULT_ESTOP, "estop command");
  } else {
    Serial.printf("unknown: '%s' (try `help`)\n", line);
  }
}

static void serialService() {
  uint8_t budget = 48;  // never chew the whole loop on a burst of input
  while (Serial.available() > 0 && budget-- > 0) {
    const int c = Serial.read();
    if (c < 0) break;
    if (c == '\r') continue;
    if (c == '\n') {
      serLine[serLen] = '\0';
      execLine(serLine);
      serLen = 0;
    } else if (serLen < (uint8_t)(sizeof(serLine) - 1)) {
      serLine[serLen++] = (char)c;
    } else {
      serLen = 0;  // overflow: drop the line rather than act on a truncated one
    }
  }
}

// =====================================================================================
// 16. Boot
// =====================================================================================
// Before anything else: put the engage pulse out and wait for the four switches. The
// springs have held the clutches closed since power arrived, but the firmware must not
// admit to STAND until the hardware says so.
static bool bootEngageBrakes() {
  brakeCommandAll(true);
  writeBrakeServos(true);

  const uint32_t t0 = millis();
  while (millis() - t0 < BRAKE_ENGAGE_TIMEOUT_MS) {
    if (readBrakeSwitches() && brakeMask == 0x0F) {
      Serial.printf("[boot] brakes 4/4 after %lu ms\n", (unsigned long)(millis() - t0));
      return true;
    }
    delay(5);  // yields to the idle task; the main loop has not started yet
  }
  Serial.printf("[boot] only 0x%X of 0x0F switches closed\n", (unsigned)brakeMask);
  return false;
}

static void boardInit() {
  // A 2 kB TX buffer keeps the console from stalling the loop: a full 80-byte line at
  // 115200 takes 7 ms to shift out, which is longer than the loop period.
  Serial.setTxBufferSize(2048);
  Serial.begin(115200);
  delay(30);
  Serial.println(F("\nWHEELBOT W1 — ESP32 firmware"));

  // 1. Motors off before any library touches a pin. GPIO12 and GPIO15 are strapping pins,
  //    so they get driven low at once rather than floating until the PWM setup below.
  for (uint8_t leg = 0; leg < LEG_COUNT; leg++) {
    pinMode(MOTOR_PINS[leg].in1, OUTPUT);
    pinMode(MOTOR_PINS[leg].in2, OUTPUT);
    digitalWrite(MOTOR_PINS[leg].in1, LOW);
    digitalWrite(MOTOR_PINS[leg].in2, LOW);
    pinMode(MOTOR_PINS[leg].pwm, OUTPUT);
    digitalWrite(MOTOR_PINS[leg].pwm, LOW);
    pwmSetup(MOTOR_PINS[leg].pwm, LEDC_CH_MOTOR[leg], MOTOR_PWM_FREQ_HZ, MOTOR_PWM_BITS);
  }
#if PIN_TB_STBY >= 0
  pinMode(PIN_TB_STBY, OUTPUT);
  digitalWrite(PIN_TB_STBY, HIGH);
#endif

  // 2. Buzzer and button.
  pwmSetup(PIN_BUZZER, LEDC_CH_BUZZER, 2000, 10);
  buzzerTone(0);
  pinMode(PIN_MODE_BUTTON, INPUT_PULLUP);

  // 3. Battery sense.
  analogSetPinAttenuation(PIN_BATT_ADC, ADC_11db);

  // 4. I2C and its three devices.
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL, I2C_CLOCK_HZ);
  Wire.setTimeOut(I2C_TIMEOUT_MS);
  pcaOk = pcaInit();
  pcfOk = pcfInit();
  if (!pcaOk) { Serial.println(F("[boot] PCA9685 silent, springs still hold the brakes")); faults |= WB_FAULT_I2C_PCA; }
  if (!pcfOk) { Serial.println(F("[boot] PCF8574 silent, brake state unknown")); faults |= WB_FAULT_I2C_PCF; }

  // 5. Brakes: the first thing this firmware ever commands.
  if (!bootEngageBrakes()) {
    faultLatched = true;
    faults |= WB_FAULT_BRAKE_ENGAGE;
    mode = Mode::FAULT;
  }
  mismatchMonitorOn = true;

  // 6. IMU last: least critical, slowest to initialise.
  imuOk = mpuInit();
  if (!imuOk) {
    faults |= WB_FAULT_IMU;  // warning: the robot stands, it just cannot level
    Serial.println(F("[boot] MPU6050 silent, levelling disabled"));
  }

  // 7. First pack reading, so the mode machine has a real number to judge.
  batteryService(millis());

  for (uint8_t leg = 0; leg < LEG_COUNT; leg++) {
    hipCurDeg[leg] = THETA_STANCE_DEG;
    hipTargetDeg[leg] = THETA_STANCE_DEG + (float)cal.hipTrimDeg[leg];
  }

  // 8. Reset cause: a brown-out is exactly the event this design exists to survive.
  const esp_reset_reason_t rr = esp_reset_reason();
  if (rr == ESP_RST_BROWNOUT) Serial.println(F("[boot] last reset: brown-out"));
  else if (rr == ESP_RST_PANIC) Serial.println(F("[boot] last reset: panic"));
  else Serial.printf("[boot] last reset: code %d\n", (int)rr);

  if (faultLatched) {
    beepAlarm = BEEP_FAULT;
    Serial.println(F("[boot] FAULT: brakes unconfirmed, motors stay off"));
  } else {
    mode = Mode::STAND;
    beepEvent = BEEP_MODE;
    Serial.println(F("[boot] STAND, brakes locked"));
  }
  printCalTable();
  printHelp();
}

// =====================================================================================
// 17. setup / loop
// =====================================================================================
void setup() {
  loadCalib();  // before any servo write: the engage pulse comes from here
  levelingEnabled = (cal.flags & 0x01) != 0;
  boardInit();
  bleInit();

  lastFrameMs = lastControlMs = lastServoMs = lastTelemMs = millis();
  lastBrakeMs = battLastMs = healthLastMs = imuLastMs = millis();
}

void loop() {
  now = millis();

  serialService();
  bleService(now);
  buttonService(now);
  brakeService(now);
  batteryService(now);
  healthService(now);
  imuService(now);
  safetyService(now);  // may latch a fault and stop everything
  modeService(now);
  controlService(now);
  servoService(now);
  buzzerService(now);
  calibrateBuzzer();

  if (monOn && (now - lastMonMs) > 500) {
    lastMonMs = now;
    printStatus();
  }
  delay(LOOP_IDLE_MS);
}
