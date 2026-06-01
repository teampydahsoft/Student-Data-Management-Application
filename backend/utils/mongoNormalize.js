const { ObjectId, Long, Int32, Double, Decimal128 } = require('mongodb');
const { parseVersantDateValue } = require('./versantDateUtils');

/**
 * Safely convert MongoDB / JS date values to ISO string (or null).
 */
function toIsoDate(value) {
  return parseVersantDateValue(value);
}

function normalizeNumber(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'number') return value;
  if (typeof value === 'object') {
    if (Object.prototype.hasOwnProperty.call(value, '$numberInt')) {
      return parseInt(value.$numberInt, 10);
    }
    if (Object.prototype.hasOwnProperty.call(value, '$numberDouble')) {
      return parseFloat(value.$numberDouble);
    }
    if (Object.prototype.hasOwnProperty.call(value, '$numberLong')) {
      return parseInt(value.$numberLong, 10);
    }
  }
  if (Long && value instanceof Long) return value.toNumber();
  if (Int32 && value instanceof Int32) return value.valueOf();
  if (Double && value instanceof Double) return value.valueOf();
  if (Decimal128 && value instanceof Decimal128) return parseFloat(value.toString());
  return value;
}

/**
 * Recursively normalize MongoDB / extended JSON values to plain JSON.
 */
function normalizeValue(value) {
  if (value === null || value === undefined) return value;

  if (value instanceof ObjectId) {
    return value.toString();
  }

  if (value instanceof Date) {
    return toIsoDate(value);
  }

  if (Long && value instanceof Long) return value.toString();
  if (Decimal128 && value instanceof Decimal128) return parseFloat(value.toString());

  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }

  if (typeof value === 'object') {
    if (Object.prototype.hasOwnProperty.call(value, '$oid')) {
      return value.$oid;
    }
    if (Object.prototype.hasOwnProperty.call(value, '$date')) {
      return toIsoDate(value);
    }
    if (
      Object.prototype.hasOwnProperty.call(value, '$numberInt') ||
      Object.prototype.hasOwnProperty.call(value, '$numberDouble') ||
      Object.prototype.hasOwnProperty.call(value, '$numberLong')
    ) {
      return normalizeNumber(value);
    }

    const out = {};
    for (const [key, val] of Object.entries(value)) {
      try {
        out[key] = normalizeValue(val);
      } catch {
        out[key] = val instanceof Date ? null : String(val);
      }
    }
    return out;
  }

  return value;
}

function normalizeDocument(doc) {
  if (!doc) return doc;
  try {
    return normalizeValue(doc);
  } catch {
    return doc;
  }
}

module.exports = { normalizeValue, normalizeDocument, toIsoDate, normalizeNumber };
