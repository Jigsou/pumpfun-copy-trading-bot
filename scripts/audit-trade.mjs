import fs from 'node:fs';
import path from 'node:path';
import { decodeAccount, digest, marginalMetrics, SOL } from '../demo/audit.mjs';
import { b58decode } from '../demo/layouts.js';

async function main() {
  const key = process.env.HELIUS_API_KEY;
  if (!key) throw new Error('Set HELIUS_API_KEY in this terminal; never paste it into chat.');
  const { PublicKey } = await import('@solana/web3.js');
  const argv = process.argv.slice(2);
  let signature = argv[0];
  if (!signature) {
    const lines = fs.readFileSync('demo/logs/events.jsonl','utf8').trim().split(/\r?\n/);
    for (let i=lines.length-1;i>=0;i--) {
      try { const e=JSON.parse(lines[i]); if(e.side==='buy' && e.signature) {signature=e.signature;break;} } catch {}
    }
  }
  if (!signature || !/^[1-9A-HJ-NP-Za-km-z]{64,100}$/.test(signature)) throw new Error('Supply a transaction signature or record a wallet buy first.');
  const rpc = async (method, params) => {
    const response = await fetch('https://mainnet.helius-rpc.com/?api-key='+encodeURIComponent(key),{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error(method+': HTTP '+response.status);
    const data=await response.json(); if(data.error) throw new Error(method+': RPC code '+data.error.code);
    return data.result;
  };
  const program='6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
  const idlUrl='https://raw.githubusercontent.com/pump-fun/pump-public-docs/main/idl/pump.json';
  const res=await fetch(idlUrl,{signal:AbortSignal.timeout(20000)});
  if(!res.ok) throw new Error('Official IDL download failed: HTTP '+res.status);
  const text=await res.text(); const idl=JSON.parse(text);
  if(idl.address!==program) throw new Error('Official IDL program mismatch');
  const tx=await rpc('getTransaction',[signature,{encoding:'jsonParsed',commitment:'confirmed',maxSupportedTransactionVersion:1}]);
  if(!tx || tx.meta?.err) throw new Error('Transaction missing or failed');
  const outer=tx.transaction.message.instructions ?? [];
  const inner=(tx.meta.innerInstructions ?? []).flatMap((g)=>g.instructions ?? []);
  const instructions=[];const curves=[];
  const normalize=(a)=>typeof a==='string'?a:a?.pubkey;
  for(const ix of [...outer,...inner]) {
    if(normalize(ix.programId)!==program || typeof ix.data!=='string' || !Array.isArray(ix.accounts)) continue;
    const bytes=Buffer.from(b58decode(ix.data));
    const def=idl.instructions.find((x)=>bytes.subarray(0,8).equals(Buffer.from(x.discriminator)));
    if(!def) {instructions.push({status:'unknown_discriminator',discriminator:bytes.subarray(0,8).toString('hex')});continue;}
    const flat=[];
    const walk=(accounts)=>{for(const a of accounts) {if(a.accounts) walk(a.accounts);else flat.push(a.name);}};
    walk(def.accounts);
    const accounts=Object.fromEntries(flat.map((name,i)=>[name,normalize(ix.accounts[i])]));
    instructions.push({name:def.name,accounts});
    const mint=accounts.base_mint ?? accounts.mint;
    if(!mint || !accounts.bonding_curve) continue;
    const derived=PublicKey.findProgramAddressSync([Buffer.from('bonding-curve'),new PublicKey(mint).toBuffer()],new PublicKey(program))[0].toBase58();
    if(derived!==accounts.bonding_curve) {curves.push({mint,status:'curve_pda_mismatch'});continue;}
    const read=await rpc('getAccountInfo',[derived,{encoding:'base64',commitment:'confirmed',minContextSlot:tx.slot}]);
    const raw=read?.value;
    if(!raw || raw.owner!==program) {curves.push({mint,status:'missing_or_wrong_owner',owner:raw?.owner ?? null});continue;}
    let decoded;
    try {decoded=decodeAccount(idl,'BondingCurve',Buffer.from(raw.data[0],'base64'));}
    catch(error) {curves.push({mint,status:'decode_failed',message:error.message,raw,context:read.context});continue;}
    const quote=decoded.fields.quote_mint;
    const instructionQuote=accounts.quote_mint ?? null;
    const native=(q)=>q==='11111111111111111111111111111111'||q===SOL;
    const mismatch=quote!==undefined && instructionQuote!==null && !(native(quote)&&native(instructionQuote)) && quote!==instructionQuote;
    const classification=mismatch?'quote_mismatch':quote===undefined?'quote_field_absent':native(quote)?'SOL_confirmed':'non_SOL_confirmed';
    let supply=null;
    if(classification==='SOL_confirmed') supply=await rpc('getTokenSupply',[mint,{commitment:'confirmed'}]).catch(()=>null);
    const decimals=supply?.value?.decimals;
    const metrics=classification==='SOL_confirmed' && Number.isInteger(decimals)?marginalMetrics({
      tokenRaw:Number(decoded.fields.virtual_token_reserves),
      quoteRaw:Number(decoded.fields.virtual_quote_reserves ?? decoded.fields.virtual_sol_reserves),
      decimals,supplyRaw:Number(supply.value.amount),walletSol:null
    }):null;
    curves.push({mint,curve:derived,instruction:def.name,status:classification,quoteMint:quote ?? null,instructionQuote,
      readAt:new Date().toISOString(),context:read.context,decoded,raw,metrics,
      ageSec:null,ageStatus:'not verified from a creation event',
      note:'Raw u64 values are preserved as strings. Derived floating-point metrics are estimates. Current state is not transaction-time state.'});
  }
  const report={schemaVersion:1,signature,transactionSlot:tx.slot,generatedAt:new Date().toISOString(),
    idlSource:idlUrl,idlSha256:digest(text),instructions,curves,transaction:tx};
  fs.mkdirSync('demo/logs',{recursive:true});
  const filename=path.join('demo/logs','audit-'+signature+'.json');
  fs.writeFileSync(filename,JSON.stringify(report,null,2));
  console.log(JSON.stringify({signature,transactionSlot:tx.slot,curves:curves.map((c)=>({mint:c.mint,status:c.status,quoteMint:c.quoteMint,offset:c.decoded?.offsets?.quote_mint})),report:filename},null,2));
  if(!curves.length) console.log('No supported Pump curve instruction found; transaction is saved for inspection.');
}
main().catch((error)=>{console.error(error.message);process.exitCode=1;});
