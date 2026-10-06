import json,random,subprocess,unittest
from dataclasses import replace
from pathlib import Path
from decimal import Decimal as D
from billing.rating import read_rates,charge,billable_ms
class ParityTests(unittest.TestCase):
 def test_node_python_rating_parity(self):
  rng=random.Random(500);base=read_rates(Path('examples/rates.csv'))[0];cases=[];expected=[]
  for _ in range(200):
   r=replace(base,connect_fee=D(rng.randint(0,1000000))/1000000,per_minute=D(rng.randint(0,5000000))/1000000,initial_seconds=rng.choice([1,30,60]),increment_seconds=rng.choice([1,6,60]))
   duration=rng.randint(0,14400000);answered=rng.choice([True,True,False])
   cases.append({'rate':{'connectFee':str(r.connect_fee),'perMinute':str(r.per_minute),'initialSeconds':r.initial_seconds,'incrementSeconds':r.increment_seconds},'duration':duration,'answered':answered})
   expected.append({'durationMs':duration,'billableMs':billable_ms(duration,r,answered),'amount':str(charge(r,duration,answered))})
  code="import {quote} from './apps/api/src/rating.mjs'; let s=''; for await(const c of process.stdin)s+=c; console.log(JSON.stringify(JSON.parse(s).map(x=>quote(x.rate,x.duration,x.answered))));"
  result=subprocess.run(['node','--input-type=module','-e',code],input=json.dumps(cases),text=True,capture_output=True,check=True)
  self.assertEqual(json.loads(result.stdout),expected)
