// Cash movements are the sole receipt/payment source. Invoices, expenses and
// closing snapshots must never be added to these posted movements a second time.
const cents = value => Math.round(Number(value) * 100);
const valid = value => value !== null && value !== '' && Number.isFinite(Number(value));
const stamp = row => row.session_closed_at || row.updated_date || row.finalized_at || row.created_date || '';
const unique = rows => [...new Map(rows.map(row => [row.id, row])).values()];
export function cashflowDateRange(type, now = new Date()) {
  const to = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const date = new Date(`${to}T12:00:00Z`);
  if (type === 'week') date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 1) % 7);
  if (type === 'month') date.setUTCDate(1);
  if (type === 'year') { date.setUTCMonth(0); date.setUTCDate(1); }
  return { from: date.toISOString().slice(0, 10), to };
}
// Cash Flow audit records are derived from persisted, RLS-scoped records.
// They are snapshots/discrepancies, NOT receipts or payments. Never append
// them to cash_movements and never change the running cash balance with them.
export function buildCashflowAuditEvents({sales=[],shortages=[],openingVerifications=[],fromStr,toStr}) {
  const inRange=row=>row?.date>=fromStr && row?.date<=toStr;
  const money=value=>valid(value) && Number(value)>=0 ? Math.round(Number(value)*100)/100 : null;
  const isDrawerClose=row=>['finalized','locked'].includes(row.closing_state) &&
    ['morning','evening'].includes(String(row.shift||'').trim().toLowerCase());
  const closings=unique(sales).filter(row=>inRange(row)&&isDrawerClose(row));
  const events=[];
  for (const row of closings) {
    const common={date:row.date,branch_id:row.branch_id,branch:row.branch,shift:row.shift,
      cashier_id:row.cashier_id,closing_id:row.id,session_no:row.closing_session_no,
      recordedAt:stamp(row),source:'daily_sales'};
    const opening=money(row.opening_cash);
    if(opening!==null)events.push({...common,id:'opening:'+row.id,type:'opening_cash',amount:opening,status:'recorded'});
    const counted=money(row.actual_cash);
    const booked=money(row.closing_cash);
    if(counted!==null)events.push({...common,id:'closing:'+row.id,type:'closing_cash',amount:counted,status:'verified'});
    else if(booked!==null)events.push({...common,id:'closing:'+row.id,type:'closing_cash',amount:booked,status:'unverified'});
  }
  const sameScope=(a,b)=>a.date===b.date
    && String(a.branch_id||a.branch||'')===String(b.branch_id||b.branch||'')
    && String(a.shift||'').toLowerCase()===String(b.shift||'').toLowerCase()
    && String(a.cashier_id||'')===String(b.cashier_id||'');
  for(const row of unique(openingVerifications).filter(inRange)) {
    // An opening is visible immediately after physical verification even
    // before the first closing. Once closed, the closing snapshot owns it.
    if(closings.some(closing=>sameScope(closing,row)))continue;
    const amount=money(row.counted_cash);
    if(amount===null)continue;
    events.push({id:'verified-opening:'+row.id,type:'opening_cash',amount,date:row.date,
      branch_id:row.branch_id,branch:row.branch,shift:row.shift,cashier_id:row.cashier_id,
      recordedAt:row.verified_at||'',status:'verified',source:'sales_closing_opening_verifications'});
  }
  const linkedShortages=new Set();
  for(const row of unique(shortages).filter(inRange)) {
    const amount=money(row.shortage_amount);
    if(amount===null||amount===0)continue;
    if(row.closing_id)linkedShortages.add(String(row.closing_id));
    events.push({id:'shortage:'+row.id,type:'cash_shortage',date:row.date,
      branch_id:row.branch_id,branch:row.branch,shift:row.shift,cashier_id:row.cashier_id,
      closing_id:row.closing_id,amount,status:row.status||'Pending',
      ownerPayment:money(row.owner_payment_amount)||0,walletPayment:money(row.wallet_payment_amount)||0,
      recordedAt:row.created_date||'',source:'cash_shortages'});
  }
  // Older finalized closings can have a negative cash difference but no
  // linked shortage record. Show an unresolved discrepancy, never book cash out.
  for(const row of closings){
    const difference=valid(row.cash_difference)?Number(row.cash_difference):null;
    if(difference===null||difference>=0||linkedShortages.has(String(row.id)))continue;
    events.push({id:'shortage-unlinked:'+row.id,type:'cash_shortage',date:row.date,
      branch_id:row.branch_id,branch:row.branch,shift:row.shift,cashier_id:row.cashier_id,
      closing_id:row.id,amount:Math.round(Math.abs(difference)*100)/100,
      status:'Needs review',recordedAt:stamp(row),source:'daily_sales'});
  }
  const priority={cash_shortage:0,closing_cash:1,opening_cash:2};
  events.sort((a,b)=>b.date.localeCompare(a.date)
    || String(b.recordedAt).localeCompare(String(a.recordedAt))
    || (priority[a.type]-priority[b.type]) || String(a.id).localeCompare(String(b.id)));
  return events;
}

export function computeRunningCashflow({ movements = [], sales = [], settlements = [], shortages = [], openingVerifications = [], branches = [], fromStr, toStr }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromStr || '') || !/^\d{4}-\d{2}-\d{2}$/.test(toStr || '') || fromStr > toStr) throw new Error('Invalid report period');
  const keys = new Map(branches.flatMap(b => [[b.id, b.id], [b.key || b.branch_key, b.id]]).filter(([key, id]) => key && id));
  const scope = row => keys.get(row.branch_id) || row.branch_id || keys.get(row.branch) || row.branch || 'unassigned';
  const active = unique(movements).filter(row => !row.is_reversed);
  if (active.some(row => !['in', 'out'].includes(row.direction) || !valid(row.amount) || Number(row.amount) < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(row.date || ''))) throw new Error('Invalid cash ledger row');
  const posted = active.filter(row => row.date <= toStr);
  const closings = unique(sales).filter(row => ['finalized', 'locked'].includes(row.closing_state) && row.date <= toStr);
  const scopes = new Set([...branches.map(b => b.id || b.key), ...posted.map(scope), ...closings.map(scope), ...settlements.map(scope)].filter(Boolean));
  let opening = 0, completeOpening = scopes.size > 0, latestCount = 0, completeCount = scopes.size > 0;
  let latestCountAt = '';
  for (const key of scopes) {
    const history = closings.filter(row => scope(row) === key).sort((a, b) => a.date.localeCompare(b.date) || stamp(a).localeCompare(stamp(b)) || a.id.localeCompare(b.id));
    const latest = history.at(-1);
    const latestDrawers = new Set(history.filter(row => row.date === latest?.date).map(row => row.cashier_id || row.cashier_name || 'unknown'));
    if (latest && valid(latest.actual_cash) && latestDrawers.size === 1) {
      latestCount += cents(latest.actual_cash); latestCountAt = [latestCountAt, latest.date].sort().at(-1);
    } else completeCount = false;
    const prior = history.filter(row => row.date < fromStr).at(-1);
    const priorDrawers = new Set(history.filter(row => row.date === prior?.date).map(row => row.cashier_id || row.cashier_name || 'unknown'));
    if (prior && valid(prior.actual_cash) && priorDrawers.size === 1) {
      opening += cents(prior.actual_cash);
      for (const row of posted.filter(row => scope(row) === key && row.date < fromStr && row.date >= prior.date)) {
        if (row.date === prior.date && (row.posted_at || row.created_date || '') <= stamp(prior)) continue;
        if (row.source_record_id === prior.id) continue;
        opening += cents(row.amount) * (row.direction === 'in' ? 1 : -1);
      }
    } else {
      const anchor = settlements.find(row => scope(row) === key && row.date === fromStr && String(row.status).toLowerCase() === 'approved' && valid(row.opening_cash));
      if (anchor) opening += cents(anchor.opening_cash); else completeOpening = false;
    }
  }
  const daily = new Map();
  for (let d = new Date(`${fromStr}T12:00:00Z`); d.toISOString().slice(0,10) <= toStr; d.setUTCDate(d.getUTCDate()+1)) {
    const date=d.toISOString().slice(0,10); daily.set(date,{date,inflow:0,outflow:0,network:0,credit:0,count:0});
  }
  const categories = new Map();
  for (const row of posted.filter(row => row.date >= fromStr)) {
    const day=daily.get(row.date), amount=cents(row.amount); day[row.direction==='in'?'inflow':'outflow']+=amount; day.count++;
    const key = row.movement_type || 'other';
    if (!categories.has(key)) categories.set(key,{key,inflow:0,outflow:0,count:0});
    const category=categories.get(key); category[row.direction==='in'?'inflow':'outflow']+=amount; category.count++;
  }
  for (const row of closings.filter(row => row.date >= fromStr)) {
    const day=daily.get(row.date); day.network+=cents(row.restaurant_network ?? row.network ?? 0); day.credit+=cents(row.credit ?? 0);
  }
  let running=0;
  const rows=[...daily.values()].map(row=>{
    const open=completeOpening?(opening+running)/100:null;
    running+=row.inflow-row.outflow;
    return {...row,inflow:row.inflow/100,outflow:row.outflow/100,network:row.network/100,credit:row.credit/100,openCash:open,closeCash:completeOpening?(opening+running)/100:null,net:(row.inflow-row.outflow)/100,runningNet:running/100};
  });
  const events=buildCashflowAuditEvents({sales,shortages,openingVerifications,fromStr,toStr});
  const shortageEvents=events.filter(row=>row.type==='cash_shortage');
  const latest=(type)=>events.find(row=>row.type===type)||null;
  return {rows,events,categories:[...categories.values()].map(row=>({...row,inflow:row.inflow/100,outflow:row.outflow/100})),summary:{
    openingCash:completeOpening?opening/100:null, closingCash:completeOpening?(opening+running)/100:null,
    totalCashIn:rows.reduce((s,r)=>s+cents(r.inflow),0)/100,totalCashOut:rows.reduce((s,r)=>s+cents(r.outflow),0)/100,
    netCash:running/100, networkSales:rows.reduce((s,r)=>s+cents(r.network),0)/100,creditSales:rows.reduce((s,r)=>s+cents(r.credit),0)/100,
    latestCount:completeCount?latestCount/100:null,latestCountAt,movementCount:rows.reduce((s,r)=>s+r.count,0),
    closingCount:closings.filter(row=>row.date>=fromStr).length,
    auditEventCount:events.length,
    latestOpeningEvent:latest('opening_cash'),
    latestClosingEvent:latest('closing_cash'),
    shortageCount:shortageEvents.length,
    shortageTotal:shortageEvents.reduce((sum,row)=>sum+cents(row.amount),0)/100,
    shortagePending:shortageEvents.filter(row=>!['resolved','settled','paid','closed'].includes(String(row.status).toLowerCase()))
      .reduce((sum,row)=>sum+Math.max(0,cents(row.amount)-cents(row.ownerPayment||0)-cents(row.walletPayment||0)),0)/100,
  }};
}
