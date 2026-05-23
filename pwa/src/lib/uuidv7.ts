// Simple UUIDv7 generator per T-12.
//
// UUIDv7 is time-sortable and designed for distributed systems.
// This implementation follows the UUIDv7 spec draft:
// - 48 bits timestamp (milliseconds since Unix epoch)
// - 12 bits random (for monotonicity within the same millisecond)
// - 62 bits random (for uniqueness)
//
// Reference: https://datatracker.ietf.org/doc/html/draft-ietf-uuidrev-rfc4122bis

let lastTimestamp = 0n;
let lastRandom = 0n;

function randomBytes(): bigint {
  // Generate 16 random bytes as a bigint
  let value = 0n;
  for (let i = 0; i < 16; i++) {
    value = (value << 8n) | BigInt(Math.floor(Math.random() * 256));
  }
  return value;
}

export function uuidv7(): string {
  const now = BigInt(Date.now());

  // Ensure monotonicity: if timestamp hasn't advanced, increment random bits
  let timestamp = now;
  let random = randomBytes() & 0xffffffffffffffffn; // 64 bits of randomness

  if (timestamp === lastTimestamp) {
    // Increment the random part to maintain ordering within the same millisecond
    random = (lastRandom + 1n) & 0xffffffffffffffffn;
  }

  lastTimestamp = timestamp;
  lastRandom = random;

  // UUIDv7 layout:
  // - 48 bits: timestamp (ms since Unix epoch)
  // - 12 bits: random (for monotonicity)
  // - 62 bits: random (for uniqueness)
  // - 6 bits: version + variant

  const timestampAndSeq = (timestamp << 16n) | (random & 0xfffn);
  const randAndVersion = (random & 0x3ffffffffffffffn) | (0x7n << 12n); // version 7

  // Combine parts
  const timeLow = (timestampAndSeq >> 32n) & 0xffffffffn;
  const timeMid = (timestampAndSeq >> 16n) & 0xffffn;
  const timeHiAndVersion = (timestampAndSeq & 0xfffn) | (0x7n << 12n);
  const clockSeqAndReserved = (randAndVersion >> 48n) & 0x3fffn | 0x8000n; // variant
  const node = randAndVersion & 0xffffffffffffn;

  // Format as UUID string
  const hex = (n: bigint, pad: number) => n.toString(16).padStart(pad, "0");

  return (
    hex(timeLow, 8) +
    "-" +
    hex(timeMid, 4) +
    "-" +
    hex(timeHiAndVersion, 4) +
    "-" +
    hex(clockSeqAndReserved, 4) +
    "-" +
    hex(node, 12)
  );
}