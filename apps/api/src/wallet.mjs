// PostgreSQL is the balance authority. Call only from a trusted billing session worker.
// All money arguments are six-place decimal STRINGS. Never use JS floating point.
import { randomUUID } from 'node:crypto';
const decimal=/^\d{1,12}(\.\d{1,6})?$/;
export async function reserve(client,{tenantId,walletId,callId,amount,authorizedUntil}) {
  if(!decimal.test(amount)) throw new Error('invalid amount');
  // Caller starts transaction and SET LOCAL app.tenant_id. Lock wallet before reservation.
  const wallet=await client.query('SELECT id FROM "PrepaidWallet" WHERE "tenantId"=$1 AND id=$2 FOR UPDATE',[tenantId,walletId]);
  if(!wallet.rowCount) throw new Error('wallet not found');
  const existing=await client.query('SELECT * FROM "Reservation" WHERE "tenantId"=$1 AND "callId"=$2 FOR UPDATE',[tenantId,callId]);
  if(existing.rowCount && (existing.rows[0].walletId!==walletId || existing.rows[0].state!=='ACTIVE')) throw new Error('reservation conflict');
  const old=existing.rows[0]?.amount??'0';
  // amount is a monotonic TOTAL reservation, not a per-tick delta; retries are safe.
  const updated=await client.query(`UPDATE "PrepaidWallet" SET reserved=reserved+$3::numeric-$4::numeric,version=version+1
    WHERE "tenantId"=$1 AND id=$2 AND $3::numeric >= $4::numeric
    AND balance+"creditLimit"-reserved >= $3::numeric-$4::numeric RETURNING *`,[tenantId,walletId,amount,old]);
  if(!updated.rowCount) throw new Error('insufficient funds or stale reservation');
  await client.query(`INSERT INTO "Reservation" (id,"tenantId","walletId","callId",amount,"authorizedUntil",state)
    VALUES ($1,$2,$3,$4,$5,$6,'ACTIVE') ON CONFLICT ("tenantId","callId")
    DO UPDATE SET amount=EXCLUDED.amount,"authorizedUntil"=GREATEST("Reservation"."authorizedUntil",EXCLUDED."authorizedUntil")`,
    [randomUUID(),tenantId,walletId,callId,amount,authorizedUntil]);
  return updated.rows[0];
}
export async function settle(client,{tenantId,walletId,callId,actual}) {
  if(!decimal.test(actual)) throw new Error('invalid amount');
  await client.query('SELECT id FROM "PrepaidWallet" WHERE "tenantId"=$1 AND id=$2 FOR UPDATE',[tenantId,walletId]);
  const rows=await client.query('SELECT * FROM "Reservation" WHERE "tenantId"=$1 AND "callId"=$2 FOR UPDATE',[tenantId,callId]);
  const r=rows.rows[0];if(!r || r.walletId!==walletId) throw new Error('reservation not found');
  if(r.state==='SETTLED') {
    const same=await client.query('SELECT $1::numeric=$2::numeric AS same',[actual,r.settledAmount]);
    if(!same.rows[0].same) throw new Error('conflicting duplicate settlement');
    return {duplicate:true};
  }
  const updated=await client.query(`UPDATE "PrepaidWallet" SET balance=balance-$3::numeric,reserved=reserved-$4::numeric,version=version+1
    WHERE "tenantId"=$1 AND id=$2 AND $3::numeric <= $4::numeric RETURNING id`,[tenantId,walletId,actual,r.amount]);
  if(!updated.rowCount) throw new Error('cost exceeds authorized reservation; quarantine CDR');
  await client.query(`INSERT INTO "LedgerEntry" (id,"tenantId","walletId","idempotencyKey",amount,type,reference,"createdAt")
    VALUES ($1,$2,$3,$4,-$5::numeric,'CALL_DEBIT',$6,now())`,[randomUUID(),tenantId,walletId,`settle:${callId}`,actual,callId]);
  await client.query(`UPDATE "Reservation" SET state='SETTLED',"settledAmount"=$3 WHERE "tenantId"=$1 AND "callId"=$2`,[tenantId,callId,actual]);
  await client.query(`INSERT INTO "Outbox" (id,"tenantId","aggregateId","eventType",payload,"createdAt")
    VALUES ($1,$2,$3,'wallet.settled',$4,now())`,[randomUUID(),tenantId,walletId,JSON.stringify({callId,actual})]);
  return {duplicate:false};
}
