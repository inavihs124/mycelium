/**
 * codec.js - Solution code encoder/decoder
 * 
 * Format: M1.{levelId}.{base64url(data)}.{crc8}
 * 
 * Data layout (binary, packed into bytes):
 *   - numEpochs (4 bits)
 *   - For each epoch:
 *     - isMacroLinked (1 bit)
 *     - if linked: sourceEpochIndex (4 bits)
 *     - if not linked:
 *       - numLayers (6 bits, max 63)
 *       - For each layer:
 *         - numSlices (3 bits, max 7)
 *         - For each slice:
 *           - bondIndex (3 bits, 0-5)
 *           - fractionIndex (2 bits, 0-3 → 1, 1/2, 1/4, 1/8)
 * 
 * Base64url encoding (RFC 4648 §5): A-Z a-z 0-9 - _
 * CRC-8 for typo detection.
 */

const FRACTION_VALUES = [1, 0.5, 0.25, 0.125];
const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * Bit writer for packing data.
 */
class BitWriter {
  constructor() {
    this.bits = [];
  }
  
  write(value, numBits) {
    for (let i = numBits - 1; i >= 0; i--) {
      this.bits.push((value >> i) & 1);
    }
  }
  
  toBytes() {
    // Pad to multiple of 8
    while (this.bits.length % 8 !== 0) {
      this.bits.push(0);
    }
    const bytes = [];
    for (let i = 0; i < this.bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j++) {
        byte = (byte << 1) | this.bits[i + j];
      }
      bytes.push(byte);
    }
    return new Uint8Array(bytes);
  }
}

/**
 * Bit reader for unpacking data.
 */
class BitReader {
  constructor(bytes) {
    this.bits = [];
    for (const byte of bytes) {
      for (let i = 7; i >= 0; i--) {
        this.bits.push((byte >> i) & 1);
      }
    }
    this.pos = 0;
  }
  
  read(numBits) {
    let value = 0;
    for (let i = 0; i < numBits; i++) {
      value = (value << 1) | (this.bits[this.pos++] || 0);
    }
    return value;
  }
  
  hasMore() {
    return this.pos < this.bits.length;
  }
}

/**
 * Base64url encode bytes.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function base64urlEncode(bytes) {
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    
    result += BASE64URL[(b0 >> 2) & 0x3F];
    result += BASE64URL[((b0 & 3) << 4) | ((b1 >> 4) & 0xF)];
    if (i + 1 < bytes.length) {
      result += BASE64URL[((b1 & 0xF) << 2) | ((b2 >> 6) & 3)];
    }
    if (i + 2 < bytes.length) {
      result += BASE64URL[b2 & 0x3F];
    }
  }
  return result;
}

/**
 * Base64url decode string to bytes.
 * @param {string} str
 * @returns {Uint8Array}
 */
function base64urlDecode(str) {
  const lookup = {};
  for (let i = 0; i < BASE64URL.length; i++) {
    lookup[BASE64URL[i]] = i;
  }
  
  const bytes = [];
  for (let i = 0; i < str.length; i += 4) {
    const c0 = lookup[str[i]] || 0;
    const c1 = lookup[str[i + 1]] || 0;
    const c2 = i + 2 < str.length ? lookup[str[i + 2]] : 0;
    const c3 = i + 3 < str.length ? lookup[str[i + 3]] : 0;
    
    bytes.push((c0 << 2) | (c1 >> 4));
    if (i + 2 < str.length) {
      bytes.push(((c1 & 0xF) << 4) | (c2 >> 2));
    }
    if (i + 3 < str.length) {
      bytes.push(((c2 & 3) << 6) | c3);
    }
  }
  return new Uint8Array(bytes);
}

/**
 * CRC-8 checksum (polynomial 0x07).
 * @param {Uint8Array} bytes
 * @returns {number} 0-255
 */
function crc8(bytes) {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      if (crc & 0x80) {
        crc = ((crc << 1) ^ 0x07) & 0xFF;
      } else {
        crc = (crc << 1) & 0xFF;
      }
    }
  }
  return crc;
}

/**
 * Encode a schedule into a solution code string.
 * @param {string} levelId
 * @param {object} schedule
 * @returns {string}
 */
export function encodeSchedule(levelId, schedule) {
  const writer = new BitWriter();
  const numEpochs = schedule.epochs.length;
  writer.write(numEpochs, 4);
  
  for (let e = 0; e < numEpochs; e++) {
    const isLinked = schedule.macroLinks && schedule.macroLinks[e] !== undefined;
    writer.write(isLinked ? 1 : 0, 1);
    
    if (isLinked) {
      writer.write(schedule.macroLinks[e], 4);
    } else {
      const epoch = schedule.epochs[e];
      writer.write(epoch.layers.length, 6);
      
      for (const layer of epoch.layers) {
        writer.write(layer.slices.length, 3);
        for (const slice of layer.slices) {
          writer.write(slice.bondIndex, 3);
          const fracIdx = FRACTION_VALUES.indexOf(slice.fraction);
          writer.write(fracIdx >= 0 ? fracIdx : 0, 2);
        }
      }
    }
  }
  
  const bytes = writer.toBytes();
  const b64 = base64urlEncode(bytes);
  const checksum = crc8(bytes).toString(16).padStart(2, '0');
  
  return `M1.${levelId}.${b64}.${checksum}`;
}

/**
 * Decode a solution code string into a schedule.
 * @param {string} code
 * @returns {{levelId: string, schedule: object} | {error: string}}
 */
export function decodeSchedule(code) {
  try {
    const parts = code.split('.');
    if (parts.length !== 4 || parts[0] !== 'M1') {
      return { error: 'Invalid code format' };
    }
    
    const [, levelId, b64, checksumHex] = parts;
    const bytes = base64urlDecode(b64);
    
    // Verify checksum
    const expectedChecksum = crc8(bytes).toString(16).padStart(2, '0');
    if (expectedChecksum !== checksumHex) {
      return { error: `Checksum mismatch (expected ${expectedChecksum}, got ${checksumHex})` };
    }
    
    const reader = new BitReader(bytes);
    const numEpochs = reader.read(4);
    
    const epochs = [];
    const macroLinks = {};
    
    for (let e = 0; e < numEpochs; e++) {
      const isLinked = reader.read(1);
      
      if (isLinked) {
        const sourceIdx = reader.read(4);
        macroLinks[e] = sourceIdx;
        epochs.push({ layers: [] }); // placeholder
      } else {
        const numLayers = reader.read(6);
        const layers = [];
        
        for (let l = 0; l < numLayers; l++) {
          const numSlices = reader.read(3);
          const slices = [];
          
          for (let s = 0; s < numSlices; s++) {
            const bondIndex = reader.read(3);
            const fracIdx = reader.read(2);
            slices.push({
              bondIndex,
              fraction: FRACTION_VALUES[fracIdx],
            });
          }
          
          layers.push({ slices });
        }
        
        epochs.push({ layers });
      }
    }
    
    const schedule = { epochs };
    if (Object.keys(macroLinks).length > 0) {
      schedule.macroLinks = macroLinks;
    }
    
    return { levelId, schedule };
    
  } catch (e) {
    return { error: `Decode error: ${e.message}` };
  }
}

/**
 * Verify that encoding and decoding round-trips correctly.
 * @param {string} levelId
 * @param {object} schedule
 * @returns {boolean}
 */
export function verifyRoundTrip(levelId, schedule) {
  const code = encodeSchedule(levelId, schedule);
  const decoded = decodeSchedule(code);
  if (decoded.error) return false;
  if (decoded.levelId !== levelId) return false;
  
  // Deep compare schedules
  const a = JSON.stringify(expandForCompare(schedule));
  const b = JSON.stringify(expandForCompare(decoded.schedule));
  return a === b;
}

function expandForCompare(schedule) {
  return {
    epochs: schedule.epochs.map(e => ({
      layers: e.layers.map(l => ({
        slices: l.slices.map(s => ({
          bondIndex: s.bondIndex,
          fraction: s.fraction,
        })),
      })),
    })),
    macroLinks: schedule.macroLinks || {},
  };
}
