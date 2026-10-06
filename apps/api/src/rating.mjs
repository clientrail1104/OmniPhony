// Mirrors billing/rating.py for HTTP previews; money is integer millionths.
function units(value){if(!/^\d+(\.\d{1,6})?$/.test(String(value)))throw Error('Invalid money');const [w,f='']=String(value).split('.');return BigInt(w)*1000000n+BigInt(f.padEnd(6,'0'));}
function format(value){return `${value/1000000n}.${String(value%1000000n).padStart(6,'0')}`;}
export function quote(rate,durationMs,answered=true){
 if(!Number.isSafeInteger(durationMs)||durationMs<0||durationMs>604800000)throw Error('Invalid duration');
 const initial=rate.initialSeconds*1000,step=rate.incrementSeconds*1000;
 if(!Number.isSafeInteger(initial)||initial<1000||initial>3600000||!Number.isSafeInteger(step)||step<1000||step>3600000)throw Error('Invalid increment');
 const billableMs=answered?initial+Math.max(0,Math.ceil((durationMs-initial)/step))*step:0;
 const amount=answered?units(rate.connectFee)+(units(rate.perMinute)*BigInt(billableMs)+30000n)/60000n:0n;
 return {durationMs,billableMs,amount:format(amount)};
}
