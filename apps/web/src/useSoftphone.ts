import {useCallback,useEffect,useRef,useState} from 'react';
import {Invitation,Inviter,Registerer,RegistererState,Session,SessionState,UserAgent,Web} from 'sip.js';
export type SipConfig={uri:string;username:string;password:string;wss:string;iceServers:RTCIceServer[]};
export type Line={id:string;remote:string;incoming:boolean;state:SessionState;held:boolean;muted:boolean;busy:boolean;transfer?:string};
export function useSoftphone(){
 const ua=useRef<UserAgent|undefined>(undefined); const reg=useRef<Registerer|undefined>(undefined);
 const sessions=useRef(new Map<string,Session>()); const audio=useRef(new Map<string,HTMLAudioElement>());
 const models=useRef(new Map<string,Line>()); const pending=useRef(new Set<string>());
 const [lines,setLines]=useState<Line[]>([]); const [registration,setRegistration]=useState('Disconnected');
 const [error,setError]=useState('');const connecting=useRef(false);
 const sync=()=>setLines([...models.current.values()]);
 const patch=(id:string,p:Partial<Line>)=>{const old=models.current.get(id);if(old){models.current.set(id,{...old,...p});sync();}};
 const media=(s:Session)=>{
   const h=s.sessionDescriptionHandler as Web.SessionDescriptionHandler|undefined;
   const el=audio.current.get(s.id);if(!h||!el)return;
   el.srcObject=h.remoteMediaStream;
   el.play().catch(()=>setError('Audio playback was blocked. Click Enable audio.'));
 };
 const bindAudio=useCallback((id:string,el:HTMLAudioElement|null)=>{
   if(el){audio.current.set(id,el);const s=sessions.current.get(id);if(s)media(s);}
   else audio.current.delete(id);
 },[]);
 const attach=(s:Session,incoming:boolean)=>{
   sessions.current.set(s.id,s);
   models.current.set(s.id,{id:s.id,remote:s.remoteIdentity.uri.toString(),incoming,state:s.state,held:false,muted:false,busy:false});sync();
   s.delegate={
     onRefer:referral=>{void referral.reject();}, // Server-authorized transfer only; no unsolicited redirects.
     onSessionDescriptionHandler:()=>{setTimeout(()=>media(s),0);}
   };
   s.stateChange.addListener(state=>{
     patch(s.id,{state});if(state===SessionState.Established)media(s);
     if(state===SessionState.Terminated){
       const el=audio.current.get(s.id);if(el){el.pause();el.srcObject=null;}
       sessions.current.delete(s.id);models.current.delete(s.id);pending.current.delete(s.id);sync();
     }
   });
 };
 const run=async(id:string,fn:(s:Session)=>Promise<unknown>)=>{
   const s=sessions.current.get(id);if(!s)throw new Error('Line ended');
   if(pending.current.has(id))throw new Error('Action already in progress');
   pending.current.add(id);patch(id,{busy:true});
   try{return await fn(s);}finally{pending.current.delete(id);patch(id,{busy:false});}
 };
 const setHold=async(id:string,held:boolean)=>run(id,async s=>{
   if(s.state!==SessionState.Established)throw new Error('Call is not established');
   await new Promise<void>((resolve,reject)=>{
     const timeout=setTimeout(()=>reject(new Error('Hold negotiation timed out')),12000);
     s.invite({sessionDescriptionHandlerOptions:({hold:held} as Web.SessionDescriptionHandlerOptions),requestDelegate:{
       onAccept:()=>{clearTimeout(timeout);patch(id,{held});const h=s.sessionDescriptionHandler as Web.SessionDescriptionHandler;h.peerConnection?.getSenders().forEach(sender=>{if(sender.track?.kind==='audio')sender.track.enabled=!held&&!models.current.get(id)?.muted;});resolve();},
       onReject:()=>{clearTimeout(timeout);reject(new Error('Hold rejected by remote endpoint'));}
     }}).catch(e=>{clearTimeout(timeout);reject(e);});
   });
 });
 const parkOtherLines=async(except?:string)=>{
   for(const line of models.current.values())if(line.id!==except&&line.state===SessionState.Established&&!line.held)await setHold(line.id,true);
 };
 const disconnect=async()=>{
   // ua.stop disposes sessions and registration transport. No silent forced reconnect.
   await reg.current?.unregister().catch(()=>{});await ua.current?.stop();
   reg.current=undefined;ua.current=undefined;setRegistration('Disconnected');
   for(const el of audio.current.values()){el.pause();el.srcObject=null;}
   sessions.current.clear();models.current.clear();sync();
 };
 const connect=async(c:SipConfig)=>{
   if(connecting.current||ua.current)throw new Error('Already connected or connecting');
   connecting.current=true;setError('');
   try{
     if(!c.wss.startsWith('wss://'))throw new Error('A trusted WSS endpoint is required');
     const uri=UserAgent.makeURI(c.uri);if(!uri)throw new Error('Invalid SIP URI');
     const agent=new UserAgent({uri,authorizationUsername:c.username,authorizationPassword:c.password,
       transportOptions:{server:c.wss},logLevel:'error',
       sessionDescriptionHandlerFactoryOptions:{constraints:{audio:true,video:false},peerConnectionConfiguration:{iceServers:c.iceServers}},
       delegate:{onInvite:inv=>{if(sessions.current.size>=2){void inv.reject({statusCode:486});return;}attach(inv,true);},
         onDisconnect:()=>{setRegistration('Transport disconnected');setError('Signalling lost. Reconnect after checking active call state.');}}
     });
     ua.current=agent;reg.current=new Registerer(agent);
     reg.current.stateChange.addListener(state=>setRegistration(state===RegistererState.Registered?'Registered':state));
     await agent.start();await reg.current.register();
   }catch(e){await disconnect();throw e;}finally{connecting.current=false;}
 };
 const dial=async(destination:string)=>{
   const agent=ua.current;if(!agent||reg.current?.state!==RegistererState.Registered)throw new Error('Register first');
   if(sessions.current.size>=2)throw new Error('Two-line limit reached');
   if(!/^\+?[0-9]{2,15}$/.test(destination))throw new Error('Use an extension or E.164 number');
   await parkOtherLines();
   const target=UserAgent.makeURI(`sip:${destination}@${agent.configuration.uri.host}`);if(!target)throw new Error('Invalid destination');
   const s=new Inviter(agent,target);attach(s,false);
   try{await s.invite();}catch(e){await s.dispose();sessions.current.delete(s.id);models.current.delete(s.id);sync();throw e;}
   return s.id;
 };
 const answer=async(id:string)=>{
   await parkOtherLines(id);await run(id,s=>{if(!(s instanceof Invitation))throw new Error('Not inbound');return s.accept();});
 };
 const end=async(id:string)=>run(id,s=>{
   if(s.state===SessionState.Established)return s.bye();
   if(s instanceof Invitation)return s.reject();
   if(s instanceof Inviter)return s.cancel();return s.dispose();
 });
 const mute=(id:string)=>{
   const s=sessions.current.get(id);if(!s||s.state!==SessionState.Established)throw new Error('Call is not established');
   const h=s.sessionDescriptionHandler as Web.SessionDescriptionHandler;const muted=!models.current.get(id)?.muted;
   h.peerConnection?.getSenders().forEach(sender=>{if(sender.track?.kind==='audio')sender.track.enabled=!muted&&!models.current.get(id)?.held;});patch(id,{muted});
 };
 const transfer=async(id:string,target:string|Session)=>run(id,async s=>{
   if(s.state!==SessionState.Established)throw new Error('Call is not established');
   const uri=typeof target==='string'?UserAgent.makeURI(`sip:${target}@${ua.current!.configuration.uri.host}`):target;
   if(!uri)throw new Error('Invalid transfer target');
   await s.refer(uri,{requestDelegate:{onAccept:()=>patch(id,{transfer:'REFER accepted; waiting for NOTIFY'}),
     onReject:()=>patch(id,{transfer:'Transfer rejected'})},onNotify:notification=>{
       const body=notification.request.body;patch(id,{transfer:body.trim()||'Transfer progress'});
       void notification.accept(); // Do not hang up on 202; final NOTIFY/remote BYE determines completion.
     }});
 });
 const blindTransfer=(id:string,target:string)=>{
   if(!/^\+?[0-9]{2,15}$/.test(target))throw new Error('Invalid transfer number');return transfer(id,target);
 };
 const warmTransfer=async(original:string,consult:string)=>{
   const other=sessions.current.get(consult);
   if(!other||other.id===original||other.state!==SessionState.Established)throw new Error('Answer the consultation call first');
   await transfer(original,other);
 };
 const dtmf=(id:string,digit:string)=>run(id,s=>{
   if(s.state!==SessionState.Established||! /^[0-9*#]$/.test(digit))throw new Error('Invalid DTMF action');
   return s.info({requestOptions:{body:{contentDisposition:'render',contentType:'application/dtmf-relay',content:`Signal=${digit}\r\nDuration=160`}}});
 });
 useEffect(()=>()=>{void ua.current?.stop();for(const el of audio.current.values()){el.pause();el.srcObject=null;}},[]);
 return {lines,registration,error,setError,connect,disconnect,dial,answer,end,mute,blindTransfer,warmTransfer,dtmf,bindAudio,
   hold:async(id:string,held:boolean)=>{if(!held)await parkOtherLines(id);await setHold(id,held);},
   enableAudio:async()=>{for(const el of audio.current.values())await el.play();}};
}
