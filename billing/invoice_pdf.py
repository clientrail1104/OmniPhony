"""Render an already authorized invoice snapshot, not a billing scheduler.
Input: invoice number, currency, periodStart/End, customer, taxPercent, minorPlaces,
lines [{callId,destination,durationMs,amount}]. Decimal money strings only.
python -m billing.invoice_pdf snapshot.json invoice.pdf
"""
import argparse,hashlib,json
from decimal import Decimal as D
from pathlib import Path
from xml.sax.saxutils import escape
from billing.rating import invoice_totals,money

def render(snapshot,path):
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.pagesizes import A4
    from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,LongTable,TableStyle
    lines=snapshot['lines']
    if not lines or len(lines)>100000:raise ValueError('Invoice line count out of range')
    if len({l['callId'] for l in lines})!=len(lines):raise ValueError('Duplicate call lines')
    for l in lines:
        money(l['amount'])
        if not isinstance(l['durationMs'],int) or l['durationMs']<0:raise ValueError('Invalid duration')
    totals=invoice_totals([l['amount'] for l in lines],snapshot['taxPercent'],snapshot.get('minorPlaces',2))
    styles=getSampleStyleSheet();story=[]
    def text(value,style='Normal'):return Paragraph(escape(str(value)),styles[style])
    story += [text(f"Invoice {snapshot['number']}",'Title'),text(snapshot['customer']),
              text(f"{snapshot['periodStart']} to {snapshot['periodEnd']}"),Spacer(1,16)]
    data=[['Call ID','Destination','Seconds',snapshot['currency']]]
    for l in lines:data.append([text(l['callId']),text(l['destination']),str(D(l['durationMs'])/1000),l['amount']])
    table=LongTable(data,repeatRows=1,colWidths=[185,125,65,100])
    table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#102f41')),
      ('TEXTCOLOR',(0,0),(-1,0),colors.white),('VALIGN',(0,0),(-1,-1),'TOP'),
      ('FONTSIZE',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),7),
      ('LINEBELOW',(0,0),(-1,-1),0.2,colors.lightgrey)]))
    story += [table,Spacer(1,16),text(f"Subtotal: {totals['subtotal']} {snapshot['currency']}"),
      text(f"Tax ({snapshot['taxPercent']}%): {totals['tax']} {snapshot['currency']}"),
      text(f"Total: {totals['total']} {snapshot['currency']}",'Heading2')]
    SimpleDocTemplate(str(path),pagesize=A4,rightMargin=36,leftMargin=36).build(story)
    return {**totals,'sha256':hashlib.sha256(Path(path).read_bytes()).hexdigest()}
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('snapshot',type=Path);p.add_argument('output',type=Path);a=p.parse_args()
    print(json.dumps(render(json.loads(a.snapshot.read_text()),a.output)))
