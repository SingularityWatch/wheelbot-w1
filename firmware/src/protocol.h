// =====================================================================================
// WHEELBOT W1 — wire protocol
// =====================================================================================
// The phone is the GATT central and the master. Everything here is fixed-size, little
// endian, and checksummed, because a single flipped bit must never be able to spin a
// wheel.
//
// GATT (SPEC.md "BLE protocol"):
//   Service 6e400001-b5a3-f393-e0a9-e50e24dcca9e
//   RX      ...0002  write  (phone -> robot, 12-byte frames)
//   TX      ...0003  notify (robot -> phone, 4-byte nonce acks + 20-byte telemetry)
//
// Command frame, 12 bytes:
//   0     type    0x01 drive, 0x02 mode, 0x03 trim, 0x04 config
//   1     arg0    drive: speed   | mode: 0 stand 1 drive 2 stow | trim: hip 0..3
//   2     arg1    drive: steer   | trim: signed offset, deg     | config: value
//   3     flags   bit0 force brakes, bit1 levelling on, bit2 buzzer
//   4..7  nonce   u32, echoed back in the 4-byte ack
//   8..9  crc     u16 CRC16-CCITT (poly 0x1021, init 0xFFFF) over bytes 0..7
//   10..11        reserved, must be 0
//
// Telemetry, 20 bytes (see WbTelemetry).
// =====================================================================================

#pragma once
#include <stdint.h>
#include <stddef.h>

// -------------------------------------------------------------------------------------
// GATT identifiers
// -------------------------------------------------------------------------------------
#define WB_SERVICE_UUID "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define WB_RX_UUID "6e400002-b5a3-f393-e0a9-e50e24dcca9e"
#define WB_TX_UUID "6e400003-b5a3-f393-e0a9-e50e24dcca9e"
#define WB_DEVICE_NAME "WHEELBOT-W1"

static const uint8_t WB_FRAME_LEN = 12;
static const uint8_t WB_TELEM_LEN = 20;
static const uint8_t WB_ACK_LEN = 4;

static const uint16_t WB_CRC_INIT = 0xFFFF;
static const uint16_t WB_CRC_POLY = 0x1021;

// -------------------------------------------------------------------------------------
// Frame types and flag bits (byte 0 and byte 3)
// -------------------------------------------------------------------------------------
enum WbFrameType : uint8_t {
  WB_FRAME_DRIVE = 0x01,
  WB_FRAME_MODE = 0x02,
  WB_FRAME_TRIM = 0x03,
  WB_FRAME_CONFIG = 0x04
};

enum WbFlagBit : uint8_t {
  WB_FLAG_FORCE_BRAKES = 1u << 0,  // e-stop: engage all four, motors inhibited
  WB_FLAG_LEVEL = 1u << 1,         // levelling enabled for this session
  WB_FLAG_BUZZER = 1u << 2         // chirp, for pairing feedback
};

// config frame keys (byte 1), value in byte 2
enum WbConfigKey : uint8_t {
  WB_CFG_LEVEL_DEFAULT = 0,  // 0/1: value of the levelling flag at boot, saved to NVS
  WB_CFG_MAX_SPEED = 1,      // 50..255: percent of the 500 mm/s design speed
};

// mode byte values, shared by the mode command and telemetry
enum WbModeCode : uint8_t {
  WB_MODE_STAND = 0,
  WB_MODE_DRIVE = 1,
  WB_MODE_STOW = 2,
  WB_MODE_FAULT = 3
};

// fault bits, telemetry bytes 16..17
enum WbFault : uint16_t {
  WB_FAULT_NONE = 0x0000,
  WB_FAULT_LINK = 0x0001,           // no valid frame for 1000 ms while driving
  WB_FAULT_BATTERY = 0x0002,        // pack below 6.0 V
  WB_FAULT_BRAKE_ENGAGE = 0x0004,   // brakes did not confirm engaged in time
  WB_FAULT_BRAKE_RELEASE = 0x0008,  // brakes did not confirm released in time
  WB_FAULT_BRAKE_MISMATCH = 0x0010, // switch disagrees with command for 400 ms
  WB_FAULT_I2C_PCA = 0x0020,        // PCA9685 lost / not answering
  WB_FAULT_I2C_MPU = 0x0040,        // MPU6050 lost / not answering (warning)
  WB_FAULT_I2C_PCF = 0x0080,        // PCF8574 lost: brake state unknown
  WB_FAULT_IMU = 0x0100,            // MPU6050 missing at boot (warning, no levelling)
  WB_FAULT_ADC = 0x0200,            // pack voltage implausible: sensor fault
  WB_FAULT_TILT = 0x0400,           // body beyond 40 deg while driving
  WB_FAULT_ESTOP = 0x0800           // brake force requested by the master
};

// telemetry flag byte (byte 18)
enum WbTelemFlag : uint8_t {
  WB_TF_LEVELING = 1u << 0,
  WB_TF_LOW_BATTERY = 1u << 1,
  WB_TF_MOTORS_ENABLED = 1u << 2,
  WB_TF_BRAKES_FORCED = 1u << 3,
  WB_TF_BLE_CONNECTED = 1u << 4,
  WB_TF_CAL_SAVED = 1u << 5
};

// -------------------------------------------------------------------------------------
// Checksums
// -------------------------------------------------------------------------------------
// CRC16-CCITT, polynomial 0x1021, initial value 0xFFFF, no final XOR, no reflection.
inline uint16_t wbCrc16(const uint8_t* data, size_t len, uint16_t crc = WB_CRC_INIT) {
  for (size_t i = 0; i < len; i++) {
    crc ^= (uint16_t)((uint16_t)data[i] << 8);
    for (uint8_t bit = 0; bit < 8; bit++) {
      crc = (crc & 0x8000u) ? (uint16_t)((crc << 1) ^ WB_CRC_POLY) : (uint16_t)(crc << 1);
    }
  }
  return crc;
}

// CRC8, polynomial 0x07, init 0x00 — cheap integrity check on the telemetry.
inline uint8_t wbCrc8(const uint8_t* data, size_t len) {
  uint8_t crc = 0;
  for (size_t i = 0; i < len; i++) {
    crc ^= data[i];
    for (uint8_t bit = 0; bit < 8; bit++) {
      crc = (crc & 0x80u) ? (uint8_t)((crc << 1) ^ 0x07) : (uint8_t)(crc << 1);
    }
  }
  return crc;
}

// -------------------------------------------------------------------------------------
// Frames on the wire. Packed so that the struct *is* the byte layout — no serialisation
// code that can drift from the documentation.
// -------------------------------------------------------------------------------------
struct __attribute__((packed)) WbFrame {
  uint8_t type;
  uint8_t arg0;
  uint8_t arg1;
  uint8_t flags;
  uint32_t nonce;  // little endian
  uint16_t crc;    // over bytes 0..7
  uint16_t reserved;
};
static_assert(sizeof(WbFrame) == WB_FRAME_LEN, "command frame must be 12 bytes");

struct __attribute__((packed)) WbTelemetry {
  uint8_t mode;           // 0 mode code (WbModeCode)
  uint8_t brakeMask;      // 1 bit0..3 = clutch ENGAGED, from the confirm switches
  uint16_t rideHeightMm;  // 2  mean hip height above the axle plane, mm
  int16_t pitchCdeg;      // 4  nose up positive, 0.01 deg
  int16_t rollCdeg;       // 6  right side down positive, 0.01 deg
  uint16_t packMv;        // 8  pack voltage, millivolts
  uint16_t currentMa;     // 10 estimated motor current, milliamps
  int8_t wheelRpmDiv2[4]; // 12 commanded wheel speed, rpm/2, int8
  uint16_t faults;        // 16 WbFault bitfield
  uint8_t flags;          // 18 WbTelemFlag bitfield
  uint8_t crc;            // 19 CRC8 over bytes 0..18
};
static_assert(sizeof(WbTelemetry) == WB_TELEM_LEN, "telemetry must be 20 bytes");

// Fill in the telemetry checksum. Always call this last.
inline void wbSealTelemetry(WbTelemetry& t) {
  t.crc = wbCrc8(reinterpret_cast<const uint8_t*>(&t), WB_TELEM_LEN - 1);
}

// True if the frame length, reserved bytes and CRC are all good.
inline bool wbFrameValid(const uint8_t* raw, size_t len) {
  if (len != WB_FRAME_LEN) return false;
  const WbFrame* f = reinterpret_cast<const WbFrame*>(raw);
  if (f->reserved != 0) return false;
  return wbCrc16(raw, 8) == f->crc;
}
