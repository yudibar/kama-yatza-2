const TX='kama-yatza.transactions.v3';
const PREF='kama-yatza.preferences.v3';
const LEGACY_TX_V2='kama-yatza.transactions.v2';
const LEGACY_TX_V1='kama-yatza.transactions.v1';
const LEGACY_PREF_V2='kama-yatza.preferences.v2';

const SpendingGroup=Object.freeze({
  ESSENTIAL:'essential',
  DISCRETIONARY:'discretionary',
  UNKNOWN:'unknown'
});

const OptimizationStatus=Object.freeze({
  NONE:'none',
  REVIEW:'review',
  OPPORTUNITY:'opportunity',
  DONE:'done'
});

const BudgetMode=Object.freeze({
  MONTHLY:'monthly',
  ROLLOVER:'rollover'
});

const CATEGORY_CATALOG=Object.freeze([
  {id:'groceries',label:'מזון וסופר'},
  {id:'restaurants',label:'מסעדות ומשלוחים'},
  {id:'housing',label:'דיור ובית'},
  {id:'utilities',label:'חשבונות ושירותי בית'},
  {id:'health',label:'בריאות'},
  {id:'insurance',label:'ביטוחים'},
  {id:'transport',label:'תחבורה'},
  {id:'children',label:'ילדים וחינוך'},
  {id:'communications',label:'תקשורת ואינטרנט'},
  {id:'technology',label:'טכנולוגיה'},
  {id:'subscriptions',label:'מנויים ושירותים דיגיטליים'},
  {id:'clothing',label:'ביגוד והנעלה'},
  {id:'leisure',label:'פנאי ובילויים'},
  {id:'travel',label:'חופשות ונסיעות'},
  {id:'gifts',label:'מתנות ואירועים'},
  {id:'finance',label:'עמלות ופיננסים'},
  {id:'personal',label:'טיפוח ואישי'},
  {id:'large_purchases',label:'רכישות גדולות'},
  {id:'other',label:'שונות'}
]);

const DEFAULTS={
  schemaVersion:3,
  merchantRules:{},
  budgets:{
    restaurants:{amount:600,mode:BudgetMode.MONTHLY},
    clothing:{amount:400,mode:BudgetMode.MONTHLY},
    leisure:{amount:300,mode:BudgetMode.MONTHLY},
    technology:{amount:500,mode:BudgetMode.ROLLOVER},
    large_purchases:{amount:600,mode:BudgetMode.ROLLOVER}
  },
  openingMonth:null
};

function cloneDefaults(){
  return JSON.parse(JSON.stringify(DEFAULTS));
}

function categoryById(id){
  return CATEGORY_CATALOG.find(c=>c.id===id)||CATEGORY_CATALOG.at(-1);
}

function categoryExists(id){
  return CATEGORY_CATALOG.some(c=>c.id===id);
}

function normalizeMerchantName(value){
  return String(value??'').trim().replace(/\s+/g,' ').toLowerCase();
}

function ensureGroup(group){
  return Object.values(SpendingGroup).includes(group)
    ? group
    : SpendingGroup.UNKNOWN;
}

function ensureOptimization(status){
  return Object.values(OptimizationStatus).includes(status)
    ? status
    : OptimizationStatus.NONE;
}

function suggestClassification(tx){
  const s=`${tx.merchant||''} ${tx.rawCategory||tx.category||''}`.toLowerCase();

  let categoryId='other';

  if(/wolt|וולט|מסעד|restaurant|cafe|coffee|קפה|פיצה/.test(s)) categoryId='restaurants';
  else if(/שופרסל|רמי לוי|ויקטורי|סופר|super|market|מכולת/.test(s)) categoryId='groceries';
  else if(/ביטוח|insurance/.test(s)) categoryId='insurance';
  else if(/מכבי|כללית|מאוחדת|לאומית|pharm|פארם|בית מרקחת|רופא|דנט/.test(s)) categoryId='health';
  else if(/רב.?קו|רב.?פס|bus|train|רכבת|דלק|fuel|parking|חניה/.test(s)) categoryId='transport';
  else if(/גן |בית ספר|חינוך|צהרון|חוג|קראטה|פסנתר|כינור/.test(s)) categoryId='children';
  else if(/בזק|bezeq|partner|פרטנר|cellcom|סלקום|hot|אינטרנט|internet|סלולר/.test(s)) categoryId='communications';
  else if(/apple|אפל|amazon|אמזון|ksp|ivory|אייבורי|github|microsoft|google|openai|chatgpt/.test(s)) categoryId='technology';
  else if(/netflix|tidal|spotify|disney|medium|claude|perplexity/.test(s)) categoryId='subscriptions';
  else if(/urbanica|אורבניקה|ביגוד|אופנה|fashion|shoe|נעל/.test(s)) categoryId='clothing';
  else if(/מלון|hotel|flight|טיסה|booking|airbnb/.test(s)) categoryId='travel';
  else if(/ארנונה|חשמל|מים|electric|water/.test(s)) categoryId='utilities';
  else if(/איקאה|ikea|home|בית/.test(s)) categoryId='housing';

  let group=SpendingGroup.UNKNOWN;

  if(['restaurants','clothing','leisure','technology','subscriptions','travel','gifts','personal','large_purchases'].includes(categoryId)){
    group=SpendingGroup.DISCRETIONARY;
  }

  if(['groceries','health','insurance','transport','children','utilities','housing','finance','communications'].includes(categoryId)){
    group=SpendingGroup.ESSENTIAL;
  }

  let optimizationStatus=OptimizationStatus.NONE;
  let optimizationNote='';

  if(['communications','insurance','subscriptions'].includes(categoryId)){
    optimizationStatus=OptimizationStatus.REVIEW;
    optimizationNote='ייתכן שכדאי להשוות מחיר או לבדוק מסלול חלופי.';
  }

  return {
    group,
    categoryId,
    optimizationStatus,
    optimizationNote,
    confidence:group===SpendingGroup.UNKNOWN?0.45:0.75
  };
}

function migratePreferencesV2ToV3(v2){
  const next=cloneDefaults();
  if(!v2||typeof v2!=='object') return next;

  for(const [merchant,oldRule] of Object.entries(v2.merchantRules||{})){
    let group=SpendingGroup.UNKNOWN;
    let optimizationStatus=OptimizationStatus.NONE;

    if(oldRule.control==='essential') group=SpendingGroup.ESSENTIAL;
    else if(oldRule.control==='discretionary') group=SpendingGroup.DISCRETIONARY;
    else if(oldRule.control==='optimizable'){
      group=SpendingGroup.ESSENTIAL;
      optimizationStatus=OptimizationStatus.REVIEW;
    }

    next.merchantRules[normalizeMerchantName(merchant)]={
      group,
      categoryId:'other',
      optimizationStatus,
      optimizationNote:optimizationStatus===OptimizationStatus.REVIEW
        ? 'הועבר אוטומטית מהסיווג הקודם ״אפשר לייעל״.'
        : ''
    };
  }

  return next;
}

function loadTransactions(){
  try{
    const v3=localStorage.getItem(TX);
    if(v3) return JSON.parse(v3);

    const legacy=
      localStorage.getItem(LEGACY_TX_V2)||
      localStorage.getItem(LEGACY_TX_V1);

    if(legacy){
      const items=JSON.parse(legacy).map(t=>({
        ...t,
        schemaVersion:3,
        override:t.override||{}
      }));
      saveTransactions(items);
      return items;
    }

    return [];
  }catch{
    return [];
  }
}

function saveTransactions(items){
  localStorage.setItem(
    TX,
    JSON.stringify(items.map(t=>({...t,schemaVersion:3})))
  );
}

function loadPreferences(){
  try{
    const v3=localStorage.getItem(PREF);
    if(v3){
      return {
        ...cloneDefaults(),
        ...JSON.parse(v3)
      };
    }

    const legacy=localStorage.getItem(LEGACY_PREF_V2);
    if(legacy){
      const migrated=migratePreferencesV2ToV3(JSON.parse(legacy));
      savePreferences(migrated);
      return migrated;
    }

    return cloneDefaults();
  }catch{
    return cloneDefaults();
  }
}

function savePreferences(p){
  localStorage.setItem(PREF,JSON.stringify({...p,schemaVersion:3}));
}

function clearAll(){
  localStorage.removeItem(TX);
  localStorage.removeItem(PREF);
  localStorage.removeItem(LEGACY_TX_V2);
  localStorage.removeItem(LEGACY_TX_V1);
  localStorage.removeItem(LEGACY_PREF_V2);
}

function mergeTransactions(existing,incoming){
  const map=new Map(existing.map(t=>[t.id,t]));
  incoming.forEach(t=>map.set(t.id,{...map.get(t.id),...t}));
  return [...map.values()].sort((a,b)=>b.date.localeCompare(a.date));
}

function classifyTransaction(tx,prefs){
  const merchantKey=normalizeMerchantName(tx.merchant);
  const rule=prefs.merchantRules?.[merchantKey]||{};
  const suggestion=suggestClassification(tx);
  const override=tx.override||{};

  const group=ensureGroup(
    override.group??
    rule.group??
    suggestion.group
  );

  const candidateCategory=
    override.categoryId??
    rule.categoryId??
    suggestion.categoryId??
    'other';

  const categoryId=categoryExists(candidateCategory)
    ? candidateCategory
    : 'other';

  const optimizationStatus=ensureOptimization(
    override.optimizationStatus??
    rule.optimizationStatus??
    suggestion.optimizationStatus
  );

  const optimizationNote=
    override.optimizationNote??
    rule.optimizationNote??
    suggestion.optimizationNote??
    '';

  return {
    ...tx,
    group,
    categoryId,
    categoryLabel:categoryById(categoryId).label,
    optimizationStatus,
    optimizationNote
  };
}

function monthKey(d){
  return String(d||'').slice(0,7);
}

function analyze(items,prefs){
  const decorated=items.map(t=>classifyTransaction(t,prefs));
  const months=[...new Set(decorated.map(t=>monthKey(t.date)).filter(Boolean))].sort();
  const current=months.at(-1)||'';
  const cur=decorated.filter(t=>monthKey(t.date)===current);
  const sum=x=>x.reduce((s,t)=>s+Math.max(0,Number(t.amount)||0),0);

  const byGroup={
    essential:sum(cur.filter(t=>t.group===SpendingGroup.ESSENTIAL)),
    discretionary:sum(cur.filter(t=>t.group===SpendingGroup.DISCRETIONARY)),
    unknown:sum(cur.filter(t=>t.group===SpendingGroup.UNKNOWN))
  };

  const byCategory=CATEGORY_CATALOG
    .map(cat=>{
      const rows=cur.filter(t=>t.categoryId===cat.id);
      return {
        ...cat,
        count:rows.length,
        amount:sum(rows),
        essential:sum(rows.filter(t=>t.group===SpendingGroup.ESSENTIAL)),
        discretionary:sum(rows.filter(t=>t.group===SpendingGroup.DISCRETIONARY)),
        unknown:sum(rows.filter(t=>t.group===SpendingGroup.UNKNOWN))
      };
    })
    .filter(x=>x.count>0);

  const budgetRows=Object.entries(prefs.budgets||{}).map(([categoryId,b])=>{
    const category=categoryById(categoryId);

    const currentSpent=sum(
      cur.filter(t=>
        t.group===SpendingGroup.DISCRETIONARY&&
        t.categoryId===categoryId
      )
    );

    const eligibleMonths=months.filter(m=>m<=current);

    const historicalSpent=sum(
      decorated.filter(t=>
        eligibleMonths.includes(monthKey(t.date))&&
        t.group===SpendingGroup.DISCRETIONARY&&
        t.categoryId===categoryId
      )
    );

    const allowance=b.mode===BudgetMode.ROLLOVER
      ? b.amount*Math.max(1,eligibleMonths.length)
      : b.amount;

    const used=b.mode===BudgetMode.ROLLOVER
      ? historicalSpent
      : currentSpent;

    const six=months.slice(-6);

    const sixSpent=sum(
      decorated.filter(t=>
        six.includes(monthKey(t.date))&&
        t.group===SpendingGroup.DISCRETIONARY&&
        t.categoryId===categoryId
      )
    );

    return {
      categoryId,
      name:category.label,
      amount:b.amount,
      mode:b.mode,
      spent:currentSpent,
      allowance,
      used,
      remaining:allowance-used,
      pct:allowance?used/allowance*100:0,
      sixAvg:six.length?sixSpent/six.length:0
    };
  });

  const optimizationCandidates=cur.filter(t=>
    t.optimizationStatus===OptimizationStatus.REVIEW||
    t.optimizationStatus===OptimizationStatus.OPPORTUNITY
  );

  const unknown=cur.filter(t=>t.group===SpendingGroup.UNKNOWN);

  const trend=months.slice(-6).map(m=>({
    month:m,
    discretionary:sum(
      decorated.filter(t=>
        monthKey(t.date)===m&&
        t.group===SpendingGroup.DISCRETIONARY
      )
    ),
    total:sum(decorated.filter(t=>monthKey(t.date)===m))
  }));

  const insights=[];

  if(unknown.length){
    insights.push(`${unknown.length} עסקאות עדיין לא מסווגות. אפשר להשאיר אותן כך או לטפל בהן כשנוח.`);
  }

  const over=budgetRows.filter(x=>x.remaining<0);
  if(over.length){
    const largest=[...over].sort((a,b)=>a.remaining-b.remaining)[0];
    insights.push(`יש ${over.length} תקציבים בחריגה. החריגה הגדולה ביותר כרגע היא ב-${largest.name}.`);
  }

  if(optimizationCandidates.length){
    insights.push(`${optimizationCandidates.length} הוצאות סומנו בעדינות ככאלה שאולי שווה לבדוק אם ניתן להוזיל.`);
  }

  return {
    decorated,
    months,
    current,
    cur,
    total:sum(cur),
    byGroup,
    byCategory,
    budgetRows,
    optimizationCandidates,
    unknown,
    trend,
    insights
  };
}

/* =========================
   CAL EXCEL IMPORT
========================= */

const SheetJS=window.XLSX;

const text=v=>String(v??'').trim();
const normalizedText=v=>text(v).replace(/\s+/g,' ').trim();
const number=v=>Number(String(v??0).replace(/[,₪]/g,''))||0;

function isCalHeaderRow(row){
  const c0=normalizedText(row?.[0]);
  const c1=normalizedText(row?.[1]);
  const c2=normalizedText(row?.[2]);
  const c3=normalizedText(row?.[3]);

  return (
    c0.includes('תאריך')&&
    c0.includes('עסקה')&&
    c1.includes('שם בית עסק')&&
    c2.includes('סכום')&&
    c2.includes('עסקה')&&
    c3.includes('סכום')&&
    c3.includes('חיוב')
  );
}

function excelDate(value){
  if(value instanceof Date) return value;

  if(typeof value==='number'){
    const p=SheetJS.SSF.parse_date_code(value);
    return p?new Date(p.y,p.m-1,p.d):null;
  }

  const m=text(value).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if(!m) return null;

  let y=Number(m[3]);
  if(y<100) y+=2000;

  return new Date(y,Number(m[2])-1,Number(m[1]));
}

function idFor(t){
  return [t.date,t.merchant,t.amount,t.type,t.notes]
    .join('|')
    .toLowerCase();
}

async function importCalWorkbook(file){
  const buffer=await file.arrayBuffer();

  const workbook=SheetJS.read(buffer,{
    type:'array',
    cellDates:true
  });

  const sheet=workbook.Sheets[workbook.SheetNames[0]];

  const rows=SheetJS.utils.sheet_to_json(sheet,{
    header:1,
    defval:null,
    raw:true
  });

  const headerIndex=rows.findIndex(isCalHeaderRow);

  if(headerIndex<0){
    throw new Error('הקובץ לא נראה כמו פירוט עסקאות של כאל הנתמך כרגע.');
  }

  return rows
    .slice(headerIndex+1)
    .filter(r=>r.some(v=>v!=null))
    .map(r=>{
      const d=excelDate(r[0]);

      const transaction={
        source:'CAL',
        date:d?d.toISOString().slice(0,10):'',
        merchant:text(r[1]),
        originalAmount:number(r[2]),
        amount:number(r[3]),
        type:text(r[4]),
        rawCategory:text(r[5]),
        notes:text(r[6]),
        override:{}
      };

      return {
        ...transaction,
        id:idFor(transaction)
      };
    })
    .filter(t=>t.date&&t.merchant&&t.amount!==0);
}

/* =========================
   UI
========================= */

const app=document.querySelector('#app');

let transactions=loadTransactions();
let prefs=loadPreferences();

const money=n=>new Intl.NumberFormat('he-IL',{
  style:'currency',
  currency:'ILS',
  maximumFractionDigits:0
}).format(n||0);

const groupLabels={
  essential:'הכרחי',
  discretionary:'בשליטתי',
  unknown:'לא ידוע'
};

const groupIcons={
  essential:'✓',
  discretionary:'◎',
  unknown:'?'
};

const optimizationLabels={
  none:'לא סומן',
  review:'כדאי לבדוק',
  opportunity:'הזדמנות לחיסכון',
  done:'נבדק'
};

const monthName=m=>m
  ? new Intl.DateTimeFormat('he-IL',{
      month:'long',
      year:'numeric'
    }).format(new Date(m+'-01T00:00:00'))
  : '';

function escapeHtml(s){
  return String(s??'').replace(/[&<>"']/g,c=>({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#039;'
  }[c]));
}

function render(){
  const a=analyze(transactions,prefs);

  app.innerHTML=`
    <main class="shell">
      <header class="top">
        <div>
          <div class="eyebrow">הכסף שלך, בתמונה אחת</div>
          <h1>כמה יצא?</h1>
          <p>${a.current?monthName(a.current):'מעלים קובץ אחד ומתחילים.'}</p>
        </div>

        <button id="settings" class="iconbtn" title="תקציבים">⚙︎</button>
      </header>

      <section id="drop" class="upload">
        <input id="file" type="file" accept=".xlsx,.xls" hidden>

        <div class="uploadIcon">↑</div>

        <div>
          <strong>העלאת פירוט אשראי</strong>
          <p>גרור לכאן Excel של כאל או בחר קובץ. הנתונים נשארים בדפדפן שלך.</p>
        </div>

        <button id="pick" class="btn primary">בחירת קובץ</button>
        <div id="status" class="status"></div>
      </section>

      ${
        transactions.length
          ? dashboard(a)
          : `
            <section class="empty card">
              <div class="bigicon">◌</div>
              <h2>עוד אין מה למדוד</h2>
              <p>אחרי העלאת הקובץ האפליקציה תציע קבוצה וקטגוריה לכל עסקה. אפשר לתקן בהדרגה.</p>
            </section>
          `
      }

      <div id="drawer" class="drawer hidden"></div>
    </main>
  `;

  bind(a);
}

function dashboard(a){
  const monthlyBudget=a.budgetRows
    .filter(x=>x.mode===BudgetMode.MONTHLY)
    .reduce((s,x)=>s+x.amount,0);

  const monthlySpent=a.budgetRows
    .filter(x=>x.mode===BudgetMode.MONTHLY)
    .reduce((s,x)=>s+x.spent,0);

  const pct=monthlyBudget
    ? Math.round(monthlySpent/monthlyBudget*100)
    : 0;

  return `
    <section class="hero card">
      <div>
        <span class="kicker">הוצאות שבשליטתך</span>
        <strong>${money(a.byGroup.discretionary)}</strong>
        <p>
          ${
            monthlyBudget
              ? `${money(monthlySpent)} מתוך ${money(monthlyBudget)} בתקציבים החודשיים`
              : 'עדיין לא הגדרת תקציבים חודשיים'
          }
        </p>
      </div>

      <div class="ring" style="--p:${Math.min(100,pct)}">
        <div>
          <b>${pct}%</b>
          <span>מהתקציב</span>
        </div>
      </div>
    </section>

    <section class="grid metrics">
      <button class="card metric clickable" data-group="essential">
        <span>הכרחי</span>
        <b>${money(a.byGroup.essential)}</b>
        <small>נספר בסך הכול, לא בתקציב</small>
      </button>

      <button class="card metric clickable" data-group="discretionary">
        <span>בשליטתי</span>
        <b>${money(a.byGroup.discretionary)}</b>
        <small>כאן התקציבים וההרגלים עובדים</small>
      </button>

      <button class="card metric clickable" data-group="unknown">
        <span>לא ידוע</span>
        <b>${a.unknown.length}</b>
        <small>עסקאות שמחכות לסיווג</small>
      </button>
    </section>

    <section class="card section">
      <div class="sectionHead">
        <div>
          <span class="kicker">היעדים שלך</span>
          <h2>תקציבים</h2>
        </div>

        <button id="editBudgets" class="textbtn">עריכה</button>
      </div>

      <div class="budgetList">
        ${a.budgetRows.map(b=>budgetRow(b)).join('')}
      </div>
    </section>

    <section class="split section">
      <div class="card">
        <span class="kicker">תמונה לפי תחום</span>
        <h2>קטגוריות</h2>
        <div class="categoryList">
          ${a.byCategory.map(categoryRow).join('')}
        </div>
      </div>

      <div class="card">
        <span class="kicker">בדיקה עדינה</span>
        <h2>הזדמנויות לחיסכון</h2>

        ${
          a.optimizationCandidates.length
            ? `
              <div class="insights">
                ${a.optimizationCandidates.slice(0,6).map(t=>`
                  <div class="insight">
                    <i>↘</i>
                    <span>
                      <b>${escapeHtml(t.merchant)}</b><br>
                      ${escapeHtml(t.optimizationNote||'אולי שווה לבדוק אם ניתן להוזיל.')}
                    </span>
                  </div>
                `).join('')}
              </div>
            `
            : `<p class="muted">כרגע אין הוצאות שסומנו לבדיקה.</p>`
        }
      </div>
    </section>

    <section class="split section">
      <div class="card">
        <span class="kicker">מבט רחב</span>
        <h2>ששת החודשים האחרונים</h2>
        ${trend(a)}
      </div>

      <div class="card">
        <span class="kicker">תובנות</span>
        <h2>מה כדאי לדעת</h2>

        <div class="insights">
          ${
            a.insights.length
              ? a.insights.map(x=>`
                  <div class="insight">
                    <i>✦</i>
                    <span>${x}</span>
                  </div>
                `).join('')
              : `<p class="muted">ככל שתעלה עוד חודשים, התמונה כאן תהיה חכמה יותר.</p>`
          }
        </div>
      </div>
    </section>

    <details class="card section">
      <summary>
        <div>
          <span class="kicker">כשבא לך לצלול</span>
          <h2>כל העסקאות</h2>
        </div>

        <span class="chev">⌄</span>
      </summary>

      <div class="transactions">
        ${a.cur.map(t=>txRow(t)).join('')}
      </div>
    </details>

    <footer>
      <button id="clear" class="dangerlink">מחיקת כל הנתונים המקומיים</button>
    </footer>
  `;
}

function categoryRow(c){
  return `
    <div class="tx">
      <div class="txMain">
        <b>${escapeHtml(c.label)}</b>
        <span>${c.count} עסקאות</span>
      </div>

      <div class="txRight">
        <b>${money(c.amount)}</b>
        <span class="muted">
          ${c.discretionary?`בשליטתי ${money(c.discretionary)}`:''}
        </span>
      </div>
    </div>
  `;
}

function budgetRow(b){
  const p=Math.min(100,Math.max(0,b.pct));

  return `
    <div class="budget">
      <div class="budgetTop">
        <div>
          <b>${escapeHtml(b.name)}</b>
          <small>
            ${b.mode===BudgetMode.ROLLOVER?'תקציב מצטבר':'תקציב חודשי'}
            · ממוצע 6 חודשים ${money(b.sixAvg)}
          </small>
        </div>

        <div class="budgetNum">
          <b>${money(b.spent)}</b>
          <span>/ ${money(b.amount)}</span>
        </div>
      </div>

      <div class="progress">
        <i style="width:${p}%" class="${b.pct>100?'over':''}"></i>
      </div>

      <div class="budgetFoot ${b.remaining<0?'bad':'good'}">
        ${
          b.remaining>=0
            ? `${money(b.remaining)} נשארו במסגרת`
            : `חריגה של ${money(Math.abs(b.remaining))}`
        }
      </div>
    </div>
  `;
}

function trend(a){
  if(!a.trend.length){
    return `<p class="muted">צריך עוד נתונים.</p>`;
  }

  const max=Math.max(...a.trend.map(x=>x.discretionary),1);

  return `
    <div class="chart">
      ${a.trend.map(x=>`
        <div class="col">
          <div
            class="colbar"
            style="height:${Math.max(5,x.discretionary/max*120)}px"
          ></div>

          <b>${money(x.discretionary)}</b>
          <span>${x.month.slice(5)}</span>
        </div>
      `).join('')}
    </div>

    <p class="muted">
      העמודות מציגות רק הוצאות שסומנו ״בשליטתי״.
    </p>
  `;
}

function txRow(t){
  const optimization=t.optimizationStatus!==OptimizationStatus.NONE
    ? ` · ${optimizationLabels[t.optimizationStatus]}`
    : '';

  return `
    <div class="tx">
      <div class="txMain">
        <b>${escapeHtml(t.merchant)}</b>
        <span>
          ${escapeHtml(t.categoryLabel)}
          · ${new Date(t.date+'T00:00:00').toLocaleDateString('he-IL')}
          ${optimization}
        </span>
      </div>

      <div class="txRight">
        <b>${money(t.amount)}</b>

        <button
          class="tag ${t.group}"
          data-merchant="${encodeURIComponent(t.merchant)}"
        >
          ${groupIcons[t.group]} ${groupLabels[t.group]}
        </button>
      </div>
    </div>
  `;
}

function bind(a){
  const input=document.querySelector('#file');
  const drop=document.querySelector('#drop');
  const status=document.querySelector('#status');

  document.querySelector('#pick').onclick=()=>input.click();

  input.onchange=()=>input.files[0]&&handle(input.files[0],status);

  ['dragenter','dragover'].forEach(e=>
    drop.addEventListener(e,x=>{
      x.preventDefault();
      drop.classList.add('drag');
    })
  );

  ['dragleave','drop'].forEach(e=>
    drop.addEventListener(e,x=>{
      x.preventDefault();
      drop.classList.remove('drag');
    })
  );

  drop.addEventListener('drop',e=>
    e.dataTransfer.files[0]&&handle(e.dataTransfer.files[0],status)
  );

  document.querySelectorAll('.tag').forEach(x=>
    x.onclick=()=>openMerchant(decodeURIComponent(x.dataset.merchant))
  );

  document.querySelectorAll('[data-group]').forEach(x=>
    x.onclick=()=>openGroup(x.dataset.group,a)
  );

  document.querySelector('#settings').onclick=()=>openBudgets();

  document.querySelector('#editBudgets')?.addEventListener(
    'click',
    openBudgets
  );

  document.querySelector('#clear')?.addEventListener('click',()=>{
    if(confirm('למחוק את כל הנתונים וההגדרות ששמורים בדפדפן?')){
      clearAll();
      transactions=[];
      prefs=loadPreferences();
      render();
    }
  });
}

function showDrawer(html){
  const d=document.querySelector('#drawer');

  d.innerHTML=`
    <div class="shade" data-close></div>

    <aside>
      <button class="close" data-close>×</button>
      ${html}
    </aside>
  `;

  d.classList.remove('hidden');

  d.querySelectorAll('[data-close]').forEach(
    x=>x.onclick=()=>d.classList.add('hidden')
  );
}

function openMerchant(merchant){
  const key=normalizeMerchantName(merchant);
  const rule=prefs.merchantRules[key]||{};
  const firstTx=transactions.find(t=>normalizeMerchantName(t.merchant)===key);
  const suggestion=firstTx?suggestClassification(firstTx):{
    group:SpendingGroup.UNKNOWN,
    categoryId:'other',
    optimizationStatus:OptimizationStatus.NONE
  };

  const activeGroup=rule.group||suggestion.group;
  const activeCategory=rule.categoryId||suggestion.categoryId;
  const activeOptimization=rule.optimizationStatus||suggestion.optimizationStatus;

  showDrawer(`
    <span class="kicker">סיווג קבוע</span>
    <h2>${escapeHtml(merchant)}</h2>

    <p class="muted">
      הבחירה נשמרת לבית העסק הזה גם בחודשים הבאים.
    </p>

    <label>
      קבוצה
      <select id="merchantGroup">
        ${Object.entries(groupLabels).map(([k,v])=>`
          <option value="${k}" ${activeGroup===k?'selected':''}>
            ${v}
          </option>
        `).join('')}
      </select>
    </label>

    <label>
      קטגוריה
      <select id="merchantCategory">
        ${CATEGORY_CATALOG.map(c=>`
          <option value="${c.id}" ${activeCategory===c.id?'selected':''}>
            ${escapeHtml(c.label)}
          </option>
        `).join('')}
      </select>
    </label>

    <label>
      האם שווה לבדוק חיסכון?
      <select id="merchantOptimization">
        ${Object.entries(optimizationLabels).map(([k,v])=>`
          <option value="${k}" ${activeOptimization===k?'selected':''}>
            ${v}
          </option>
        `).join('')}
      </select>
    </label>

    <label>
      הערה
      <input
        id="merchantOptimizationNote"
        value="${escapeHtml(rule.optimizationNote||'')}"
        placeholder="למשל: לבדוק מחיר אינטרנט מול ספקים אחרים"
      >
    </label>

    <button id="saveMerchant" class="btn primary wide">
      שמירה
    </button>
  `);

  document.querySelector('#saveMerchant').onclick=()=>{
    const group=document.querySelector('#merchantGroup').value;
    const categoryId=document.querySelector('#merchantCategory').value;
    const optimizationStatus=document.querySelector('#merchantOptimization').value;
    const optimizationNote=document.querySelector('#merchantOptimizationNote').value.trim();

    prefs.merchantRules[key]={
      ...(prefs.merchantRules[key]||{}),
      group,
      categoryId,
      optimizationStatus,
      optimizationNote
    };

    savePreferences(prefs);
    render();
  };
}

function openGroup(group,a){
  const rows=a.cur.filter(t=>t.group===group);

  showDrawer(`
    <span class="kicker">${groupLabels[group]}</span>
    <h2>${rows.length} עסקאות</h2>

    <div class="transactions">
      ${rows.map(txRow).join('')}
    </div>
  `);

  document.querySelectorAll('#drawer .tag').forEach(x=>
    x.onclick=()=>openMerchant(decodeURIComponent(x.dataset.merchant))
  );
}

function openBudgets(){
  showDrawer(`
    <span class="kicker">היעדים שלך</span>
    <h2>תקציבים</h2>

    <p class="muted">
      תקציב חל רק על עסקאות שסווגו ״בשליטתי״.
      חודשי מתאפס בכל חודש, מצטבר שומר יתרה לחודשים הבאים.
    </p>

    <div id="budgetEdit">
      ${Object.entries(prefs.budgets||{}).map(([categoryId,b])=>`
        <div class="budgetEdit">
          <input value="${escapeHtml(categoryById(categoryId).label)}" disabled>

          <input
            data-amount="${categoryId}"
            type="number"
            value="${b.amount}"
          >

          <select data-mode="${categoryId}">
            <option value="monthly" ${b.mode==='monthly'?'selected':''}>חודשי</option>
            <option value="rollover" ${b.mode==='rollover'?'selected':''}>מצטבר</option>
          </select>
        </div>
      `).join('')}
    </div>

    <div class="budgetEdit">
      <select id="newBudgetCategory">
        ${CATEGORY_CATALOG
          .filter(c=>!prefs.budgets?.[c.id])
          .map(c=>`<option value="${c.id}">${escapeHtml(c.label)}</option>`)
          .join('')}
      </select>

      <input id="newBudgetAmount" type="number" placeholder="סכום">

      <select id="newBudgetMode">
        <option value="monthly">חודשי</option>
        <option value="rollover">מצטבר</option>
      </select>
    </div>

    <button id="addBudget" class="btn wide">הוספת תקציב</button>
    <button id="saveBudgets" class="btn primary wide">שמירה</button>
  `);

  document.querySelector('#addBudget').onclick=()=>{
    const categoryId=document.querySelector('#newBudgetCategory').value;
    const amount=Math.max(0,+document.querySelector('#newBudgetAmount').value||0);
    const mode=document.querySelector('#newBudgetMode').value;

    if(!categoryId||!amount) return;

    prefs.budgets[categoryId]={amount,mode};
    savePreferences(prefs);
    openBudgets();
  };

  document.querySelector('#saveBudgets').onclick=()=>{
    document.querySelectorAll('[data-amount]').forEach(x=>{
      const categoryId=x.dataset.amount;
      prefs.budgets[categoryId].amount=Math.max(0,+x.value||0);
    });

    document.querySelectorAll('[data-mode]').forEach(x=>{
      const categoryId=x.dataset.mode;
      prefs.budgets[categoryId].mode=x.value;
    });

    savePreferences(prefs);
    render();
  };
}

async function handle(file,status){
  try{
    status.className='status';
    status.textContent='קוראת ומארגנת…';

    const incoming=await importCalWorkbook(file);
    const before=transactions.length;

    transactions=mergeTransactions(transactions,incoming);
    saveTransactions(transactions);

    const added=transactions.length-before;

    render();

    const s=document.querySelector('#status');
    s.textContent=`✓ נקלטו ${incoming.length} עסקאות · ${added} חדשות`;
    s.className='status success';
  }catch(e){
    console.error(e);
    status.className='status error';
    status.textContent=e.message||'לא הצלחתי לקרוא את הקובץ.';
  }
}

render();
