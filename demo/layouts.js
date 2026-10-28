export const WSOL = 'So11111111111111111111111111111111111111112';
export const ZERO_KEY = '11111111111111111111111111111111';

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function b58encode(bytes) {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = '';
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b === 0) out = '1' + out;
    else break;
  }
  return out;
}

export function b58decode(text) {
  let n = 0n;
  for (const ch of text) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error('invalid base58 character');
    n = n * 58n + BigInt(i);
  }
  const bytes = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 255n));
    n >>= 8n;
  }
  let zeros = 0;
  for (const ch of text) {
    if (ch === '1') zeros++;
    else break;
  }
  return Uint8Array.from([...new Array(zeros).fill(0), ...bytes]);
}

// Pump bonding curve account (Borsh): discriminator 8, five u64 at 8..48, complete bool at 48,
// creator 49..81, is_mayhem_mode 81, is_cashback_coin 82, quote_mint 83..115 (all zeros means SOL).
export function decodeBondingCurve(d) {
  if (!d || d.length < 49) return null;
  const quoteBytes = d.length >= 115 ? d.subarray(83, 115) : null;
  const allZero = !quoteBytes || quoteBytes.every((b) => b === 0);
  const quoteMint = allZero ? null : b58encode(quoteBytes);
  const quoteIsSol = allZero || quoteMint === WSOL;
  return {
    vToken: Number(d.readBigUInt64LE(8)),
    vSol: Number(d.readBigUInt64LE(16)),
    realToken: Number(d.readBigUInt64LE(24)),
    realSol: Number(d.readBigUInt64LE(32)),
    supply: Number(d.readBigUInt64LE(40)),
    complete: d[48] === 1,
    quoteIsSol,
    quoteMint: quoteIsSol ? null : quoteMint,
    length: d.length,
  };
}

// PumpSwap pool account: discriminator 8, pool_bump 8, index u16 9, creator 11, base_mint 43, quote_mint 75,
// lp_mint 107, pool_base_token_account 139, pool_quote_token_account 171, lp_supply 203, coin_creator 211,
// is_mayhem_mode 243, is_cashback_coin 244, virtual_quote_reserves i128 245..261 (missing on older pools: 0).
export function decodePool(d) {
  if (!d || d.length < 203) return null;
  const key = (o) => b58encode(d.subarray(o, o + 32));
  let virtualQuote = 0n;
  if (d.length >= 261) {
    const lo = d.readBigUInt64LE(245);
    const hi = d.readBigInt64LE(253);
    virtualQuote = (hi << 64n) + lo;
  }
  return {
    baseMint: key(43),
    quoteMint: key(75),
    baseVault: key(139),
    quoteVault: key(171),
    virtualQuote,
    length: d.length,
  };
}
