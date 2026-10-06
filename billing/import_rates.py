"""Atomic privileged CSV-to-PostgreSQL import. Draft by default; RLS tenant context.
Install requirements first. DATABASE_URL must be a narrow tariff-import role.
python -m billing.import_rates --tenant UUID examples/rates.csv [--publish]
"""
import argparse,hashlib,json,os,uuid
from collections import defaultdict
from pathlib import Path
from billing.rating import read_rates

def main():
    import psycopg
    p=argparse.ArgumentParser();p.add_argument('--tenant',required=True);p.add_argument('csv',type=Path)
    p.add_argument('--publish',action='store_true');a=p.parse_args();tenant=str(uuid.UUID(a.tenant))
    raw=a.csv.read_bytes()
    if len(raw)>25*1024*1024:raise ValueError('Maximum CSV size 25 MiB')
    rates=read_rates(a.csv);groups=defaultdict(list)
    for r in rates:groups[(r.card,r.version)].append(r)
    digest=hashlib.sha256(raw).hexdigest();created=[]
    with psycopg.connect(os.environ['DATABASE_URL']) as con:
      with con.cursor() as c:
        c.execute("SELECT set_config('app.tenant_id',%s,true)",(tenant,))
        for (name,version),rows in groups.items():
          first=rows[0]
          metadata={(r.kind,r.currency,r.carrier,r.effective_from,r.effective_to) for r in rows}
          if len(metadata)!=1:raise ValueError(f'Inconsistent metadata within card {name} version {version}')
          c.execute('SELECT id,sha256 FROM "RateCard" WHERE "tenantId"=%s AND name=%s AND version=%s',(tenant,name,version))
          existing=c.fetchone()
          if existing:
            if existing[1]!=digest:raise ValueError('Version already exists with different source file')
            created.append({'card':name,'id':str(existing[0]),'duplicate':True});continue
          card=str(uuid.uuid4())
          c.execute("""INSERT INTO "RateCard" (id,"tenantId",name,version,kind,currency,"effectiveFrom","effectiveTo","publishedAt",sha256)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,CASE WHEN %s THEN now() ELSE NULL END,%s)""",
            (card,tenant,name,version,first.kind,first.currency,first.effective_from,first.effective_to,a.publish,digest))
          c.executemany("""INSERT INTO "Rate" (id,"tenantId","cardId",prefix,country,"connectFee","perMinute","initialSeconds","incrementSeconds")
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
            [(str(uuid.uuid4()),tenant,card,r.prefix,r.country,r.connect_fee,r.per_minute,r.initial_seconds,r.increment_seconds) for r in rows])
          created.append({'card':name,'id':card,'duplicate':False})
    print(json.dumps({'cards':created,'sourceSha256':digest}))
if __name__=='__main__':main()
