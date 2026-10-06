import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import pg from 'pg';
import {createClient} from 'redis';
import {WebSocketServer,WebSocket} from 'ws';
import {randomBytes,createHmac} from 'node:crypto';
const required=['DATABASE_URL','REDIS_URL','OIDC_JWKS_URL','OIDC_ISSUER','OIDC_AUDIENCE','PUBLIC_ORIGIN','TURN_SECRET','TURN_URLS'];
for(const k of required)if(!process.env[k])throw new Error(`Missing ${k}`);
const app=Fastify({logger:{redact:['req.headers.authorization','req.headers.cookie','res.headers.set-cookie']},bodyLimit:65536,trustProxy:false});
await app.register(rateLimit,{max:120,timeWindow:'1 minute'});
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:20,connectionTimeoutMillis:3000,statement_timeout:5000});
const redis=createClient({url:process.env.REDIS_URL});redis.on('error',()=>app.log.error('Redis unavailable'));await redis.connect();
const sub=redis.duplicate();sub.on('error',()=>app.log.error('Redis subscriber unavailable'));await sub.connect();
const jwks=createRemoteJWKSet(new URL(process.env.OIDC_JWKS_URL));
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function tx(tenant,fn){const c=await pool.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('app.tenant_id',$1,true)",[tenant]);const value=await fn(c);await c.query('COMMIT');return value;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
async function auth(req,reply){
 try{
  const token=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];if(!token)throw Error();
  const {payload}=await jwtVerify(token,jwks,{issuer:process.env.OIDC_ISSUER,audience:process.env.OIDC_AUDIENCE,algorithms:['RS256','ES256']});
  if(!uuid.test(payload.tenant_id)||!payload.sub||!payload.exp)throw Error();
  const u=await tx(payload.tenant_id,async c=>(await c.query('SELECT id,"tenantId",role,disabled FROM "User" WHERE "tenantId"=$1 AND "oidcSubject"=$2',[payload.tenant_id,payload.sub])).rows[0]);
  if(!u||u.disabled)throw Error();req.actor={...u,exp:payload.exp};
 }catch{return reply.code(401).send({error:'unauthorized'});}
}
const restricted=(roles)=>async(req,reply)=>{await auth(req,reply);if(reply.sent)return;if(!roles.includes(req.actor.role))return reply.code(403).send({error:'forbidden'});};
const ops=['SUPER_ADMIN','TENANT_ADMIN','QUEUE_MANAGER','AGENT'];
app.get('/healthz',async()=>({status:'up'}));
app.get('/readyz',async(req,reply)=>{try{await pool.query('SELECT 1');await redis.ping();return {status:'ready'};}catch{return reply.code(503).send({status:'unavailable'});}});
app.get('/v1/me',{preHandler:auth},async req=>({id:req.actor.id,tenantId:req.actor.tenantId,role:req.actor.role}));
app.get('/v1/wallets/:id',{preHandler:restricted(['SUPER_ADMIN','TENANT_ADMIN','BILLING_AUDITOR'])},async(req,reply)=>{
 if(!uuid.test(req.params.id))return reply.code(400).send({error:'invalid id'});
 const result=await tx(req.actor.tenantId,async c=>(await c.query('SELECT id,currency,balance,reserved,"creditLimit",(balance+"creditLimit"-reserved)::text AS available,version FROM "PrepaidWallet" WHERE "tenantId"=$1 AND id=$2',[req.actor.tenantId,req.params.id])).rows[0]);
 return result??reply.code(404).send({error:'not found'});
});
app.patch('/v1/me/presence',{preHandler:restricted(ops),schema:{body:{type:'object',additionalProperties:false,required:['status','version'],properties:{status:{enum:['AVAILABLE','BREAK','WRAP_UP','OFFLINE']},version:{type:'integer',minimum:0}}}}},async(req,reply)=>{
 // BUSY is set by authoritative call worker, never a browser. Presence is not queue eligibility.
 const r=await tx(req.actor.tenantId,async c=>{
  const result=await c.query(`UPDATE "User" SET presence=$3,version=version+1,"updatedAt"=now() WHERE "tenantId"=$1 AND id=$2 AND version=$4 AND presence<>'BUSY' RETURNING id,presence,version`,[req.actor.tenantId,req.actor.id,req.body.status,req.body.version]);
  return result.rows[0];
 });
 if(!r)return reply.code(409).send({error:'stale version or active call; refresh presence'});
 await redis.publish(`omni:tenant:${req.actor.tenantId}:user:${req.actor.id}`,JSON.stringify({type:'presence.changed',data:r})).catch(()=>{});
 return r;
});
app.post('/v1/quotes',{preHandler:restricted(ops.concat('BILLING_AUDITOR')),schema:{body:{type:'object',additionalProperties:false,required:['cardId','destination','durationMs'],properties:{cardId:{type:'string',pattern:uuid.source},destination:{type:'string',pattern:'^\\+[1-9][0-9]{1,14}$'},durationMs:{type:'integer',minimum:0,maximum:604800000}}}}},async(req,reply)=>{
 const {cardId,destination,durationMs}=req.body;
 const rate=await tx(req.actor.tenantId,async c=>(await c.query(`SELECT r.*,c.currency,c.version FROM "Rate" r JOIN "RateCard" c ON c.id=r."cardId" AND c."tenantId"=r."tenantId"
   WHERE r."tenantId"=$1 AND c.id=$2 AND c.kind='SELL' AND c."publishedAt" IS NOT NULL
   AND c."effectiveFrom"<=now() AND (c."effectiveTo" IS NULL OR c."effectiveTo">now())
   AND starts_with($3,r.prefix) ORDER BY length(r.prefix) DESC LIMIT 1`,[req.actor.tenantId,cardId,destination.slice(1)])).rows[0]);
 if(!rate)return reply.code(422).send({error:'no active sell rate'});
 const {quote}=await import('./rating.mjs');return {...quote(rate,durationMs),rateId:rate.id,version:rate.version,currency:rate.currency,estimate:true};
});
app.post('/v1/turn-credentials',{preHandler:restricted(ops)},async req=>{
 const ttl=Math.min(600,req.actor.exp-Math.floor(Date.now()/1000));const expires=Math.floor(Date.now()/1000)+ttl;
 const username=`${expires}:${req.actor.tenantId}:${req.actor.id}`;
 return {expiresAt:expires,iceServers:[{urls:JSON.parse(process.env.TURN_URLS),username,credential:createHmac('sha1',process.env.TURN_SECRET).update(username).digest('base64')}]};
});
app.post('/v1/ws-ticket',{preHandler:auth},async req=>{
 const ticket=randomBytes(32).toString('base64url');await redis.set(`omni:ticket:${ticket}`,JSON.stringify(req.actor),{EX:30,NX:true});return {ticket,expiresIn:30};
});
const wss=new WebSocketServer({noServer:true,maxPayload:1024});
app.server.on('upgrade',async(req,socket,head)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname!=='/events'||req.headers.origin!==process.env.PUBLIC_ORIGIN)throw Error();
  // Ticket carried as WebSocket subprotocol, not URL/query/access logs.
  const ticket=req.headers['sec-websocket-protocol']?.split(',').map(s=>s.trim()).find(s=>s.startsWith('ticket.'))?.slice(7);
  if(!ticket||!/^[A-Za-z0-9_-]{43}$/.test(ticket))throw Error();
  const value=await redis.getDel(`omni:ticket:${ticket}`);if(!value)throw Error();const actor=JSON.parse(value);
  if(actor.exp*1000<=Date.now())throw Error();
  wss.handleUpgrade(req,socket,head,ws=>{ws.actor=actor;ws.alive=true;ws.on('pong',()=>{ws.alive=true;});ws.on('error',()=>{});ws.on('message',()=>ws.close(1008,'Use REST for commands'));});
 }catch{socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');socket.destroy();}
});
await sub.pSubscribe('omni:tenant:*:user:*',(message,channel)=>{
 for(const ws of wss.clients){if(ws.readyState!==WebSocket.OPEN)continue;const a=ws.actor;
  if(channel!==`omni:tenant:${a.tenantId}:user:${a.id}`)continue;
  if(ws.bufferedAmount>262144){ws.close(1013,'Refresh state');continue;}ws.send(message);
 }
});
const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(!ws.alive||ws.actor.exp*1000<=Date.now()){ws.terminate();continue;}ws.alive=false;ws.ping();}},25000);
app.setErrorHandler((err,req,reply)=>{app.log.error({code:err.code},'Request failed');reply.code(err.validation?400:500).send({error:err.validation?'invalid request':'internal error'});});
await app.listen({host:'0.0.0.0',port:8080});
const stop=async()=>{clearInterval(heartbeat);for(const ws of wss.clients)ws.close(1001,'Restart');wss.close();await app.close();await sub.quit();await redis.quit();await pool.end();process.exit(0);};
process.on('SIGTERM',stop);process.on('SIGINT',stop);
