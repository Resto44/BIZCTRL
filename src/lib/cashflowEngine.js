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
export function computeRunningCashflow({ movements = [], sales = [], settlements = [], branches = [], fromStr, toStr }) {
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
  return {rows,categories:[...categories.values()].map(row=>({...row,inflow:row.inflow/100,outflow:row.outflow/100})),summary:{
    openingCash:completeOpening?opening/100:null, closingCash:completeOpening?(opening+running)/100:null,
    totalCashIn:rows.reduce((s,r)=>s+cents(r.inflow),0)/100,totalCashOut:rows.reduce((s,r)=>s+cents(r.outflow),0)/100,
    netCash:running/100, networkSales:rows.reduce((s,r)=>s+cents(r.network),0)/100,creditSales:rows.reduce((s,r)=>s+cents(r.credit),0)/100,
    latestCount:completeCount?latestCount/100:null,latestCountAt,movementCount:rows.reduce((s,r)=>s+r.count,0),
    closingCount:closings.filter(row=>row.date>=fromStr).length,
  }};
}
