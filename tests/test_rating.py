import io, unittest
from pathlib import Path
from dataclasses import replace
from decimal import Decimal as D
from billing.rating import *
class RatingTests(unittest.TestCase):
    def setUp(self):
        self.rates=read_rates(Path('examples/rates.csv'));self.at=instant('2026-10-05T00:00:00Z')
        self.rate=select(self.rates,'+60123456789',card='retail',kind='SELL',currency='MYR',at=self.at)
    def test_longest_prefix(self): self.assertEqual(self.rate.prefix,'601')
    def test_boundaries(self):
        for duration,billed in [(0,30000),(1,30000),(30000,30000),(30001,36000),(36000,36000),(36001,42000)]:
            self.assertEqual(billable_ms(duration,self.rate),billed)
        self.assertEqual(charge(self.rate,31001),D('0.128000'))
    def test_unanswered(self): self.assertEqual(charge(self.rate,10000,False),D('0.000000'))
    def test_1_1_60_60(self):
        for initial,step,ms,result in [(1,1,1001,2000),(60,60,60001,120000),(60,60,1,60000)]:
            self.assertEqual(billable_ms(ms,replace(self.rate,initial_seconds=initial,increment_seconds=step)),result)
    def test_invalid_duration(self):
        for bad in [-1,1.5,True,604800001]:
            with self.assertRaises(ValueError):charge(self.rate,bad)
    def test_no_route(self):
        with self.assertRaises(ValueError):select(self.rates,'+4412345678',card='retail',kind='SELL',currency='MYR',at=self.at)
    def test_e164(self):
        for bad in ['0123','6012345','+0001','+1;api','+601 123']: 
            with self.assertRaises(ValueError):phone(bad)
    def test_csv_quoting(self):
        s=Path('examples/rates.csv').read_text().replace('Malaysia Mobile','"Malaysia, Mobile"')
        self.assertEqual(read_rates(io.StringIO(s))[1].country,'Malaysia, Mobile')
    def test_overlap(self):
        s=Path('examples/rates.csv').read_text();s+=s.splitlines()[1]+'\n'
        with self.assertRaises(ValueError):read_rates(io.StringIO(s))
    def test_malformed(self):
        for value in ['NaN','-1','1e2','0.0000001']:
            with self.assertRaises(ValueError):money(value)
    def test_effective_boundary(self):
        r=replace(self.rate,effective_to=self.at)
        with self.assertRaises(ValueError):select([r],'+6012345',card='retail',kind='SELL',currency='MYR',at=self.at)
    def test_currency_isolation(self):
        with self.assertRaises(ValueError):select(self.rates,'+6012345',card='retail',kind='SELL',currency='USD',at=self.at)
    def test_lcr(self):
        routes=lcr(self.rates,'+6012345',currency='MYR',at=self.at,expected_ms=1000,carriers={'a':'carrier-a','b':'carrier-b'})
        self.assertEqual(routes[0][1],'b')
        routes=lcr(self.rates,'+6012345',currency='MYR',at=self.at,expected_ms=60000,carriers={'a':'carrier-a','b':'carrier-b'})
        self.assertEqual(routes[0][1],'a') # deterministic tie
    def test_markup_vs_margin(self):
        self.assertEqual(markup(self.rate,percent='25').per_minute,D('.225000'))
        self.assertEqual(markup(self.rate,margin_percent='25').per_minute,D('.240000'))
        with self.assertRaises(ValueError):markup(self.rate,margin_percent='100')
    def test_budget(self):
        self.assertIsNone(max_duration(self.rate,'0.10'))
        self.assertEqual(max_duration(self.rate,'0.11'),30000)
        self.assertEqual(max_duration(self.rate,'0.128'),36000)
    def test_tax(self): self.assertEqual(invoice_totals(['0.128','1.00'],'6'),{'subtotal':'1.13','tax':'0.07','total':'1.20'})
    def test_monotonic(self):
        previous=D(0)
        for ms in range(0,200000,137):
            current=charge(self.rate,ms);self.assertGreaterEqual(current,previous);previous=current
if __name__=='__main__':unittest.main()
