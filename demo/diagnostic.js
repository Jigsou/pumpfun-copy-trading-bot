import { RobustDemoEngine } from './robust.js';
import { decodeBondingCurve } from './layouts.js';
import { installStep1 } from './step1.js';

const MAX_SHOWN = 6;
const MAX_TRACKED = 300;

// Same engine as RobustDemoEngine. Nothing is relaxed: every rejection still happens.
// Added: when a Pump curve buy is refused because the quote is not SOL, keep the evidence.
// Added (step 1): price path sampling (MFE / MAE) and one copied buy per wallet and token, see step1.js.
export class DiagnosticDemoEngine extends RobustDemoEngine {
  constructor(deps, opts = {}) {
    super(deps, opts);
    installStep1(this);
  }

  _acceptEntry(pos, trade, detectedAt, delayMs) {
    const ok = super._acceptEntry(pos, trade, detectedAt, delayMs);
    if (!ok && (pos.venue ?? 'pump') === 'pump' && this.lastCurve.get(pos.mint)?.quoteIsSol === false) {
      const signature = typeof pos.opId === 'string' ? pos.opId.split('|')[0] : null;
      this._dumpCurveAccount(pos.mint, { signature, wallet: pos.wallet, label: pos.label, delayMs }).catch((e) =>
        this._setError('Quote diagnostic: ' + e.message),
      );
    }
    return ok;
  }

  async _dumpCurveAccount(mint, ctx = {}) {
    if (this.dumpedMints.has(mint) || this.dumpedMints.size >= MAX_TRACKED) return;
    this.dumpedMints.add(mint);
    const addr = this.deps.curveAddress(mint);
    const r = await this.rpc('getAccountInfo', [addr, { encoding: 'base64', commitment: 'confirmed' }]);
    const v = r?.value;
    if (!v) {
      this.rawDumps.unshift({ mint, addr, missing: true, readAt: Date.now() });
      if (this.rawDumps.length > MAX_SHOWN) this.rawDumps.length = MAX_SHOWN;
      this.deps.appendLog?.('quote-rejects', { time: new Date().toISOString(), mint, curve: addr, missing: true, ...ctx });
      this._changed();
      return;
    }
    const d = Buffer.from(v.data[0], 'base64');
    const dec = decodeBondingCurve(d);
    const quoteBytes = d.length >= 115 ? d.subarray(83, 115) : null;
    this.rawDumps.unshift({
      mint,
      addr,
      owner: v.owner,
      lamports: v.lamports,
      length: d.length,
      quoteMint: dec ? dec.quoteMint : null,
      quoteIsSol: dec ? dec.quoteIsSol : null,
      hexHead: d.subarray(0, 220).toString('hex'),
      readAt: Date.now(),
    });
    if (this.rawDumps.length > MAX_SHOWN) this.rawDumps.length = MAX_SHOWN;
    this.deps.appendLog?.('quote-rejects', {
      time: new Date().toISOString(),
      mint,
      curve: addr,
      owner: v.owner,
      length: d.length,
      decodedQuoteMint: dec ? dec.quoteMint : null,
      quoteBytesHex: quoteBytes ? quoteBytes.toString('hex') : null,
      accountHex: d.toString('hex'),
      ...ctx,
    });
    this._changed();
  }
}
