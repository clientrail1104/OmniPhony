"""Exact-decimal tariff import, longest-prefix matching, rating and LCR.
No network dependencies. Input duration is answered duration in integer milliseconds.
CLI: python3 billing/rating.py examples/rates.csv +60123456789 31001 --kind SELL
"""
from __future__ import annotations
import argparse, csv, io, json, re
from dataclasses import dataclass, asdict, replace
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP, localcontext
from pathlib import Path
D=Decimal
UNIT=D('0.000001')
HEADERS=['card','version','kind','carrier','country','prefix','currency','connect_fee',
         'per_minute','initial_seconds','increment_seconds','effective_from','effective_to']
@dataclass(frozen=True)
class Rate:
    card: str
    version: int
    kind: str
    carrier: str
    country: str
    prefix: str
    currency: str
    connect_fee: Decimal
    per_minute: Decimal
    initial_seconds: int
    increment_seconds: int
    effective_from: datetime
    effective_to: datetime | None

def instant(value):
    t=datetime.fromisoformat(value.replace('Z','+00:00'))
    if t.tzinfo is None: raise ValueError('UTC offset required')
    return t.astimezone(timezone.utc)

def money(value):
    if not re.fullmatch(r'\d{1,12}(?:\.\d{1,6})?', str(value)):
        raise ValueError('Money must be nonnegative decimal with at most 6 places')
    return D(value)

def phone(value):
    # No guessed national prefix or country. Normalize in a separate validated UI.
    if not re.fullmatch(r'\+[1-9]\d{1,14}',value):
        raise ValueError('Destination must be canonical E.164, e.g. +60123456789')
    return value[1:]

def read_rates(source):
    if isinstance(source,Path):
        with source.open(encoding='utf-8-sig',newline='') as f: return read_rates(f)
    reader=csv.DictReader(source)
    if reader.fieldnames != HEADERS: raise ValueError('CSV header/order mismatch')
    rates=[]
    for n,row in enumerate(reader,2):
        try:
            if None in row or None in row.values(): raise ValueError('Wrong column count')
            if len(rates)>=100000: raise ValueError('Maximum 100000 rate rows')
            row={k:v.strip() for k,v in row.items()}
            if not re.fullmatch(r'[1-9]\d{0,14}',row['prefix']): raise ValueError('Invalid prefix')
            if row['kind'] not in ('COST','SELL'): raise ValueError('Invalid kind')
            if row['kind']=='COST' and not row['carrier']: raise ValueError('Cost needs carrier')
            if not re.fullmatch(r'[A-Z]{3}',row['currency']): raise ValueError('Invalid currency')
            if not row['card'] or len(row['card'])>100: raise ValueError('Invalid card')
            start=instant(row['effective_from']);end=instant(row['effective_to']) if row['effective_to'] else None
            if end and end<=start: raise ValueError('Invalid effective interval')
            ver=int(row['version']);initial=int(row['initial_seconds']);increment=int(row['increment_seconds'])
            if ver<1 or not 1<=initial<=3600 or not 1<=increment<=3600: raise ValueError('Invalid increment/version')
            rate=Rate(row['card'],ver,row['kind'],row['carrier'],row['country'],row['prefix'],row['currency'],
                      money(row['connect_fee']),money(row['per_minute']),initial,increment,start,end)
            rates.append(rate)
        except (ValueError,ArithmeticError) as e: raise ValueError(f'CSV line {n}: {e}') from e
    if not rates: raise ValueError('Empty rate card')
    # Reject overlapping windows, including across versions of a card. A publish operation
    # must close the old version's interval atomically before activating a replacement.
    groups={}
    for r in rates:
        key=(r.card,r.kind,r.carrier,r.prefix,r.currency)
        groups.setdefault(key,[]).append(r)
    for group in groups.values():
        group.sort(key=lambda r:r.effective_from)
        for a,b in zip(group,group[1:]):
            if a.effective_to is None or a.effective_to>b.effective_from:
                raise ValueError('Overlapping rate windows')
    return rates

def select(rates,destination,*,card,kind,currency,at,carrier=None):
    digits=phone(destination)
    choices=[r for r in rates if r.card==card and r.kind==kind and r.currency==currency
             and (carrier is None or r.carrier==carrier) and digits.startswith(r.prefix)
             and r.effective_from<=at and (r.effective_to is None or at<r.effective_to)]
    if not choices: raise ValueError('No matching active rate: fail closed')
    best=max(len(r.prefix) for r in choices)
    choices=[r for r in choices if len(r.prefix)==best]
    if len(choices)!=1: raise ValueError('Ambiguous rate selection: specify carrier/card')
    return choices[0]

def billable_ms(duration_ms,rate,answered=True):
    if isinstance(duration_ms,bool) or not isinstance(duration_ms,int) or not 0<=duration_ms<=604800000:
        raise ValueError('Duration must be integer milliseconds, max 7 days')
    if not answered: return 0
    # An answered zero-duration call incurs setup and its first billing block.
    initial=rate.initial_seconds*1000;step=rate.increment_seconds*1000
    return initial+max(0,(duration_ms-initial+step-1)//step)*step

def charge(rate,duration_ms,answered=True):
    units=billable_ms(duration_ms,rate,answered)
    with localcontext() as ctx:
        ctx.prec=40
        total=rate.connect_fee+rate.per_minute*D(units)/D(60000) if answered else D(0)
        return total.quantize(UNIT,rounding=ROUND_HALF_UP)

def markup(rate,*,flat_per_minute='0',percent='0',margin_percent=None):
    flat=money(flat_per_minute);pct=money(percent)
    if margin_percent is not None:
        margin=money(margin_percent)
        if margin>=100 or pct: raise ValueError('Margin must be <100 and cannot combine with markup')
        multiplier=D(1)/(D(1)-margin/D(100))
    else: multiplier=D(1)+pct/D(100)
    return replace(rate,kind='SELL',per_minute=(rate.per_minute*multiplier+flat).quantize(UNIT),
                   connect_fee=(rate.connect_fee*multiplier).quantize(UNIT))

def lcr(rates,destination,*,currency,at,expected_ms,carriers):
    # First longest-prefix match PER carrier, then total expected cost comparison.
    # Cross-carrier prefix specificity must not eliminate an otherwise valid route.
    routes=[]
    for carrier,card in carriers.items():
        try: r=select(rates,destination,card=card,kind='COST',currency=currency,at=at,carrier=carrier)
        except ValueError as e:
            if str(e).startswith('No matching'): continue
            raise
        routes.append((charge(r,expected_ms),carrier,r))
    if not routes: raise ValueError('No healthy eligible route')
    return sorted(routes,key=lambda x:(x[0],x[1]))

def max_duration(rate,budget,cap_ms=14400000):
    budget=money(str(budget))
    if charge(rate,0)>budget: return None
    lo,hi=0,cap_ms
    while lo<hi:
        mid=(lo+hi+1)//2
        if charge(rate,mid)<=budget: lo=mid
        else: hi=mid-1
    return lo

def invoice_totals(amounts,tax_percent,minor_places=2):
    if not 0<=minor_places<=3: raise ValueError('Unsupported minor unit exponent')
    quantum=D(1).scaleb(-minor_places)
    subtotal=sum((money(str(a)) for a in amounts),D(0)).quantize(quantum,ROUND_HALF_UP)
    tax=(subtotal*money(str(tax_percent))/100).quantize(quantum,ROUND_HALF_UP)
    return {'subtotal':str(subtotal),'tax':str(tax),'total':str(subtotal+tax)}

def main():
    p=argparse.ArgumentParser();p.add_argument('csv');p.add_argument('destination');p.add_argument('duration_ms',type=int)
    p.add_argument('--card',default='retail');p.add_argument('--kind',choices=['COST','SELL'],default='SELL')
    p.add_argument('--currency',default='MYR');p.add_argument('--at',default=None);p.add_argument('--unanswered',action='store_true')
    a=p.parse_args();rates=read_rates(Path(a.csv));at=instant(a.at) if a.at else datetime.now(timezone.utc)
    r=select(rates,a.destination,card=a.card,kind=a.kind,currency=a.currency,at=at)
    print(json.dumps({'currency':r.currency,'card':r.card,'version':r.version,'prefix':r.prefix,
          'durationMs':a.duration_ms,'billableMs':billable_ms(a.duration_ms,r,not a.unanswered),
          'amount':str(charge(r,a.duration_ms,not a.unanswered))}))
if __name__=='__main__': main()
