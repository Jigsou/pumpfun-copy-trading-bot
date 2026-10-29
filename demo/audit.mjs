import { createHash } from 'node:crypto';
export const SOL = 'So11111111111111111111111111111111111111112';
const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function base58(bytes) {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let s = '';
  while (n) { s = alphabet[Number(n % 58n)] + s; n /= 58n; }
  for (const b of bytes) { if (b) break; s = '1' + s; }
  return s;
}
export function decodeAccount(idl, name, bytes) {
  const account = idl.accounts.find((a) => a.name === name);
  const type = idl.types.find((t) => t.name === name);
  if (!account || !type || type.type.kind !== 'struct') throw new Error('Account definition missing');
  const d = Buffer.from(bytes);
  if (!d.subarray(0, 8).equals(Buffer.from(account.discriminator))) throw new Error('Wrong account discriminator');
  let offset = 8;
  const read = (type) => {
    const sizes = { bool: 1, u8: 1, u16: 2, u32: 4, u64: 8, i64: 8, u128: 16, i128: 16, pubkey: 32 };
    if (!(type in sizes)) throw new Error('Unsupported field type: ' + JSON.stringify(type));
    const size = sizes[type];
    if (offset + size > d.length) throw new Error('Truncated account field');
    const start = offset; offset += size;
    if (type === 'pubkey') return base58(d.subarray(start, offset));
    if (type === 'bool') {
      if (d[start] > 1) throw new Error('Invalid boolean');
      return d[start] === 1;
    }
    let value = 0n;
    for (let i = size - 1; i >= 0; i--) value = (value << 8n) | BigInt(d[start + i]);
    if (type.startsWith('i') && (d[offset - 1] & 128)) value -= 1n << BigInt(size * 8);
    return value.toString();
  };
  const fields = {}; const offsets = {}; const absent = [];
  for (const field of type.type.fields) {
    if (offset === d.length) { absent.push(field.name); continue; }
    offsets[field.name] = offset;
    fields[field.name] = read(field.type);
  }
  return { fields, offsets, absent, length: d.length, decodedBytes: offset };
}
export function marginalMetrics({ tokenRaw, quoteRaw, decimals, supplyRaw, walletSol }) {
  const valid = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
  if (!valid(tokenRaw) || !valid(quoteRaw) || !Number.isInteger(decimals)) return null;
  const reserveSol = quoteRaw / 1e9;
  const spotPriceSol = reserveSol / (tokenRaw / 10 ** decimals);
  return {
    spotPriceSol,
    marketCapSol: valid(supplyRaw) ? spotPriceSol * (supplyRaw / 10 ** decimals) : null,
    observedBuyReserveRatioPct: valid(walletSol) ? walletSol / reserveSol * 100 : null,
    reserveSol,
    basis: 'current confirmed account read; not pre-trader state or historical entry',
    actualTraderPriceImpactPct: null,
  };
}
export const digest = (text) => createHash('sha256').update(text).digest('hex');
