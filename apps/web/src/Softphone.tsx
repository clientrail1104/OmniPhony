import {useState} from 'react';
import {SessionState} from 'sip.js';
import {useSoftphone} from './useSoftphone';
// Production host supplies a scoped account balance fetched from /v1/wallets/:id.
// Null is intentionally "Unavailable", never a fabricated balance.
export function Softphone({balance=null,currency='MYR'}:{balance?:string|null;currency?:string}){
 const phone=useSoftphone();const [number,setNumber]=useState('');const [target,setTarget]=useState('');
 const [uri,setUri]=useState('');const [wss,setWss]=useState('');const [username,setUsername]=useState('');const [password,setPassword]=useState('');
 const [ice,setIce]=useState('[]');const [active,setActive]=useState<string>();const [loading,setLoading]=useState(false);
 const selected=phone.lines.find(x=>x.id===active)??phone.lines[0];
 const execute=async(fn:()=>unknown)=>{try{phone.setError('');await fn();}catch(e){phone.setError(e instanceof Error?e.message:String(e));}};
 const ready=selected?.state===SessionState.Established&&!selected.busy;
 return <main className="mx-auto max-w-6xl px-6 py-10">
  <header className="mb-10 flex flex-wrap items-center justify-between gap-5"><div><div className="text-xs font-semibold uppercase tracking-[.3em] text-teal-400">Omni500 / Voice</div><h1 className="mt-3 text-3xl font-semibold">Agent workspace</h1><p className="mt-2 text-sm text-slate-400">SIP softphone • two lines • secure browser audio</p></div><div className="rounded-2xl border border-slate-800 px-5 py-3"><div className="text-xs text-slate-400">Available account balance</div><div className="mt-1 text-xl font-semibold">{balance===null?'Unavailable':`${currency} ${balance}`}</div></div></header>
  <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
   <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6"><h2 className="text-lg font-medium">Connection</h2><p className="my-3 text-sm text-teal-300" role="status">{phone.registration}</p>
    <form className="space-y-4" onSubmit={e=>{e.preventDefault();setLoading(true);void execute(async()=>{const servers=JSON.parse(ice);if(!Array.isArray(servers))throw new Error('ICE must be an array');await phone.connect({uri,wss,username,password,iceServers:servers});setPassword('');}).finally(()=>setLoading(false));}}>
     <label className="block">SIP URI<input required value={uri} onChange={e=>setUri(e.target.value)} placeholder="sip:agent@voice.example.org"/></label>
     <label className="block">WSS endpoint<input required value={wss} onChange={e=>setWss(e.target.value)} placeholder="wss://voice.example.org/ws"/></label>
     <div className="grid grid-cols-2 gap-3"><label>Username<input required value={username} onChange={e=>setUsername(e.target.value)}/></label><label>Password<input required type="password" autoComplete="off" value={password} onChange={e=>setPassword(e.target.value)}/></label></div>
     <label className="block">ICE servers JSON<input value={ice} onChange={e=>setIce(e.target.value)} aria-label="Temporary STUN TURN credentials JSON"/></label>
     <p className="text-xs leading-5 text-slate-500">Use temporary credentials from your authenticated provisioning service. Credentials are held in memory only. A trusted HTTPS origin is required.</p>
     <div className="flex gap-3"><button disabled={loading||phone.registration==='Registered'} type="submit">{loading?'Connecting…':'Register'}</button><button type="button" onClick={()=>void execute(phone.disconnect)}>Disconnect</button></div>
    </form>
   </section>
   <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
    <div className="flex items-center justify-between"><h2 className="text-lg font-medium">Your lines</h2><span className="text-xs text-slate-400">{phone.lines.length} / 2</span></div>
    <div className="my-5 grid grid-cols-2 gap-3">{phone.lines.map((line,i)=><button key={line.id} onClick={()=>setActive(line.id)} className={line.id===selected?.id?'border-teal-400 bg-teal-950':''}><span className="block text-left text-xs text-slate-400">LINE {i+1} · {line.incoming?'INBOUND':'OUTBOUND'}</span><span className="mt-2 block truncate text-left">{line.remote}</span><span className="mt-2 block text-left text-xs text-teal-300">{line.state}{line.held?' · On hold':''}{line.muted?' · Muted':''}</span></button>)}</div>
    {!selected&&<div className="my-5 rounded-2xl border border-dashed border-slate-700 p-8 text-center text-slate-500">No active calls</div>}
    <form className="flex gap-3" onSubmit={e=>{e.preventDefault();void execute(async()=>setActive(await phone.dial(number)));}}><input aria-label="Destination" placeholder="+60… or extension" value={number} onChange={e=>setNumber(e.target.value)}/><button type="submit" className="bg-teal-400 text-slate-950" disabled={phone.registration!=='Registered'||phone.lines.length>=2}>Call</button></form>
    {selected&&<><div className="mt-5 flex flex-wrap gap-2">
     {selected.incoming&&selected.state===SessionState.Initial&&<button onClick={()=>void execute(()=>phone.answer(selected.id))}>Answer</button>}
     <button disabled={!ready} onClick={()=>void execute(()=>phone.mute(selected.id))}>{selected.muted?'Unmute':'Mute'}</button>
     <button disabled={!ready} onClick={()=>void execute(()=>phone.hold(selected.id,!selected.held))}>{selected.held?'Resume':'Hold'}</button>
     <button disabled={selected.busy} className="border-rose-800 bg-rose-950 text-rose-200" onClick={()=>void execute(()=>phone.end(selected.id))}>End / reject</button>
    </div><div className="mx-auto my-6 grid max-w-xs grid-cols-3 gap-2">{'123456789*0#'.split('').map(d=><button disabled={!ready} key={d} onClick={()=>void execute(()=>phone.dtmf(selected.id,d))}>{d}</button>)}</div>
    <label>Transfer destination<input value={target} onChange={e=>setTarget(e.target.value)} placeholder="Extension or +E.164"/></label>
    <div className="mt-3 flex flex-wrap gap-2"><button disabled={!ready} onClick={()=>void execute(()=>phone.blindTransfer(selected.id,target))}>Blind transfer</button><button disabled={!ready||phone.lines.length>=2} onClick={()=>void execute(()=>phone.dial(target))}>Start consultation</button><button disabled={!ready||phone.lines.length!==2} onClick={()=>void execute(()=>phone.warmTransfer(selected.id,phone.lines.find(x=>x.id!==selected.id)!.id))}>Complete warm transfer</button></div><p className="mt-3 text-xs text-slate-400">For warm transfer: select the original line after the consultation answers. To cancel consultation, end its line then resume the original.</p>{selected.transfer&&<p className="mt-3 text-sm" role="status">{selected.transfer}</p>}</>}
   </section>
  </div>
  {phone.lines.map(line=><audio key={line.id} ref={el=>phone.bindAudio(line.id,el)} autoPlay playsInline/>)}
  <div className="mt-6 flex items-center gap-4"><button onClick={()=>void execute(phone.enableAudio)}>Enable audio</button><p className="text-xs text-slate-500">Microphone permission is requested when a call starts.</p></div>
  {phone.error&&<div role="alert" className="mt-5 rounded-xl border border-amber-800 bg-amber-950 p-4 text-sm text-amber-200">{phone.error}</div>}
 </main>;
}
