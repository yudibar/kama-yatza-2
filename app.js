const TX='kama-yatza.transactions.v2';
const PREF='kama-yatza.preferences.v2';
const DEFAULTS={
  merchantRules:{},
  budgets:{
    'מסעדות ואוכל בחוץ':{amount:600,mode:'monthly'},
    'קניות ופינוקים':{amount:500,mode:'monthly'},
    'שונות ורכישות גדולות':{amount:600,mode:'rollover'}
  },
  openingMonth:null
};

function loadTransactions(){
  try{
    return JSON.parse(
      localStorage.getItem(TX) ||
      localStorage.getItem('kama-yatza.transactions.v1') ||
      '[]'
    );
  }catch{
    return [];
  }
}

function saveTransactions(items){
  localStorage.setItem(TX,JSON.stringify(items));
}

function mergeTransactions(existing,incoming){
  const map=new Map(existing.map(t=>[t.id,t]));
  incoming.forEach(t=>map.set(t.id,{...map.get(t.id),...t}));
  return [...map.values()].sort((a,b)=>b.date.localeCompare(a.date));
}

function loadPreferences(){
  try{
    return {
      ...DEFAULTS,
      ...JSON.parse(localStorage.getItem(PREF)||'{}')
    };
  }catch{
    return structuredClone(DEFAULTS);
  }
}

function savePreferences(p){
  localStorage.setItem(PREF,JSON.stringify(p));
}

function clearAll(){
  localStorage.removeItem(TX);
  localStorage.removeItem(PREF);
  localStorage.removeItem('kama-yatza.transactions.v1');
}

const food=/wolt|וולט|ארומה|קפית|פיצה|מסעד|קפה|coffee|cafe/i;
const fixed=/ביטוח|כללית|מכבי|מאוחדת|לאומית|רב.?פס|חינוך|בית ספר|גן |ארנונה|חשמל|מים/i;
const optimize=/netflix|tidal|spotify|microsoft|google|yes|hot|next|סלקום|cellcom|partner|פרטנר|bezeq|בזק|אינטרנט|ביטוח|chatgpt|openai/i;
const discretionary=/wolt|וולט|מסעד|קפה|ארומה|פיצה|urbanica|אורבניקה|max stock|מקס סטוק|amazon|אמזון|איקאה|ikea/i;

function suggestedClass(t){
  const s=`${t.merchant} ${t.category}`;

  if(food.test(s) || discretionary.test(s)){
    return 'discretionary';
  }

  if(optimize.test(s)){
    return 'optimizable';
  }

  if(fixed.test(s)){
    return 'essential';
  }

  return 'review';
}

function budgetGroup(t){
  const s=`${t.merchant} ${t.category}`;

  if(food.test(s)){
    return 'מסעדות ואוכל בחוץ';
  }

  if(/ביגוד|אופנה|urbanica|אורבניקה|max stock|מקס סטוק/i.test(s)){
    return 'קניות ופינוקים';
  }

  return 'שונות ורכישות גדולות';
}

function monthKey(d){
  return d.slice(0,7);
}

function analyze(items,prefs){
  const decorated=items.map(t=>{
    const rule=prefs.merchantRules[t.merchant]||{};

    return {
      ...t,
      control:rule.control||suggestedClass(t),
      budgetGroup:rule.budgetGroup||budgetGroup(t)
    };
  });

  const months=[...new Set(decorated.map(t=>monthKey(t.date)))].sort();
  const current=months.at(-1)||'';
  const cur=decorated.filter(t=>monthKey(t.date)===current);

  const sum=x=>x.reduce((s,t)=>s+Math.max(0,t.amount),0);
  const total=sum(cur);

  const classes=['essential','optimizable','discretionary','review'];

  const byControl=Object.fromEntries(
    classes.map(c=>[
      c,
      sum(cur.filter(t=>t.control===c))
    ])
  );

  const byCategory=Object.entries(
    cur.reduce((a,t)=>{
      a[t.category]=(a[t.category]||0)+t.amount;
      return a;
    },{})
  ).sort((a,b)=>b[1]-a[1]);

  const budgetRows=Object.entries(prefs.budgets||{}).map(([name,b])=>{
    const spent=sum(
      cur.filter(
        t=>
          t.control==='discretionary' &&
          t.budgetGroup===name
      )
    );

    const historical=months.filter(m=>m<=current);

    let allowance=b.amount;

    if(b.mode==='rollover'){
      allowance=b.amount*Math.max(1,historical.length);
    }

    const historicalSpent=sum(
      decorated.filter(
        t=>
          historical.includes(monthKey(t.date)) &&
          t.control==='discretionary' &&
          t.budgetGroup===name
      )
    );

    const used=b.mode==='rollover'
      ? historicalSpent
      : spent;

    const remaining=allowance-used;

    const six=months.slice(-6);

    const sixSpent=sum(
      decorated.filter(
        t=>
          six.includes(monthKey(t.date)) &&
          t.control==='discretionary' &&
          t.budgetGroup===name
      )
    );

    return {
      name,
      ...b,
      spent,
      allowance,
      remaining,
      pct:allowance ? used/allowance*100 : 0,
      sixAvg:six.length ? sixSpent/six.length : 0
    };
  });

  const disc=byControl.discretionary;

  const discBudget=
    budgetRows
      .filter(x=>x.mode==='monthly')
      .reduce((s,x)=>s+x.amount,0)
    +
    budgetRows
      .filter(x=>x.mode==='rollover')
      .reduce((s,x)=>s+x.amount,0);

  const score=discBudget
    ? Math.max(
        0,
        Math.min(
          100,
          Math.round(100-(disc/discBudget)*45)
        )
      )
    : null;

  const review=cur.filter(t=>t.control==='review');
  const opt=cur.filter(t=>t.control==='optimizable');

  const sixMonths=months.slice(-6);

  const trend=sixMonths.map(m=>({
    month:m,
    discretionary:sum(
      decorated.filter(
        t=>
          monthKey(t.date)===m &&
          t.control==='discretionary'
      )
    ),
    total:sum(
      decorated.filter(
        t=>monthKey(t.date)===m
      )
    )
  }));

  const insights=[];

  const over=budgetRows.filter(x=>x.remaining<0);

  if(over.length){
    insights.push(
      `יש ${over.length} תקציבים בחריגה החודש. הגדול שבהם: ${
        over.sort((a,b)=>a.remaining-b.remaining)[0].name
      }.`
    );
  }

  const under=budgetRows.filter(x=>x.remaining>0);

  if(under.length){
    insights.push(
      `נשארו לך מרווחים בתקציבים. זה כסף שלא חייב למצוא משהו לקנות.`
    );
  }

  if(opt.length){
    insights.push(
      `${opt.length} חיובים סומנו כ״הכרחי אבל ניתן לאופטימיזציה״. אלה מועמדים להשוואת מחיר, לא לביטול אוטומטי.`
    );
  }

  if(review.length){
    insights.push(
      `${review.length} עסקאות עדיין מחכות לסיווג שלך. אפשר להשאיר אותן כך ולחזור אליהן כשנוח.`
    );
  }

  return {
    decorated,
    current,
    cur,
    total,
    byControl,
    byCategory,
    budgetRows,
    score,
    review,
    opt,
    trend,
    insights
  };
}

/* =========================
   CAL EXCEL IMPORT
========================= */

const SheetJS = window.XLSX;

const text = v => String(v ?? '').trim();

const normalizedText = v =>
  text(v)
    .replace(/\s+/g,' ')
    .trim();

const number = v =>
  Number(
    String(v ?? 0)
      .replace(/[,₪]/g,'')
  ) || 0;

function isCalHeaderRow(row){
  const c0=normalizedText(row?.[0]);
  const c1=normalizedText(row?.[1]);
  const c2=normalizedText(row?.[2]);
  const c3=normalizedText(row?.[3]);

  return (
    c0.includes('תאריך') &&
    c0.includes('עסקה') &&
    c1.includes('שם בית עסק') &&
    c2.includes('סכום') &&
    c2.includes('עסקה') &&
    c3.includes('סכום') &&
    c3.includes('חיוב')
  );
}

function excelDate(value){
  if(value instanceof Date){
    return value;
  }

  if(typeof value==='number'){
    const p=SheetJS.SSF.parse_date_code(value);

    return p
      ? new Date(p.y,p.m-1,p.d)
      : null;
  }

  const m=text(value).match(
    /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/
  );

  if(!m){
    return null;
  }

  let y=Number(m[3]);

  if(y<100){
    y+=2000;
  }

  return new Date(
    y,
    Number(m[2])-1,
    Number(m[1])
  );
}

function idFor(t){
  return [
    t.date,
    t.merchant,
    t.amount,
    t.type,
    t.notes
  ]
    .join('|')
    .toLowerCase();
}

async function importCalWorkbook(file){
  const buffer=await file.arrayBuffer();

  const workbook=SheetJS.read(
    buffer,
    {
      type:'array',
      cellDates:true
    }
  );

  const sheet=
    workbook.Sheets[
      workbook.SheetNames[0]
    ];

  const rows=
    SheetJS.utils.sheet_to_json(
      sheet,
      {
        header:1,
        defval:null,
        raw:true
      }
    );

  const headerIndex=
    rows.findIndex(isCalHeaderRow);

  if(headerIndex<0){
    throw new Error(
      'הקובץ לא נראה כמו פירוט עסקאות של כאל הנתמך כרגע.'
    );
  }

  return rows
    .slice(headerIndex+1)
    .filter(r=>r.some(v=>v!=null))
    .map(r=>{
      const d=excelDate(r[0]);

      const transaction={
        source:'CAL',

        date:
          d
            ? d.toISOString().slice(0,10)
            : '',

        merchant:text(r[1]),

        originalAmount:number(r[2]),

        amount:number(r[3]),

        type:text(r[4]),

        category:
          text(r[5]) ||
          'אחר',

        notes:text(r[6])
      };

      return {
        ...transaction,
        id:idFor(transaction)
      };
    })
    .filter(
      t=>
        t.date &&
        t.merchant &&
        t.amount!==0
    );
}

/* =========================
   UI
========================= */

const app=document.querySelector('#app');

let transactions=loadTransactions();
let prefs=loadPreferences();

const money=n=>
  new Intl.NumberFormat(
    'he-IL',
    {
      style:'currency',
      currency:'ILS',
      maximumFractionDigits:0
    }
  ).format(n||0);

const labels={
  essential:'הכרחי',
  optimizable:'חשוב · אפשר לייעל',
  discretionary:'בשליטתי',
  review:'לטיפול'
};

const icons={
  essential:'✓',
  optimizable:'↘',
  discretionary:'◎',
  review:'?'
};

const monthName=m=>
  m
    ? new Intl.DateTimeFormat(
        'he-IL',
        {
          month:'long',
          year:'numeric'
        }
      ).format(
        new Date(
          m+'-01T00:00:00'
        )
      )
    : '';

function escapeHtml(s){
  return String(s??'')
    .replace(
      /[&<>"']/g,
      c=>({
        '&':'&amp;',
        '<':'&lt;',
        '>':'&gt;',
        '"':'&quot;',
        "'":'&#039;'
      }[c])
    );
}

function render(){
  const a=analyze(transactions,prefs);

  app.innerHTML=`
    <main class="shell">

      <header class="top">

        <div>

          <div class="eyebrow">
            הכסף שלך, בתמונה אחת
          </div>

          <h1>
            כמה יצא?
          </h1>

          <p>
            ${
              a.current
                ? monthName(a.current)
                : 'מעלים קובץ אחד ומתחילים.'
            }
          </p>

        </div>

        <button
          id="settings"
          class="iconbtn"
          title="תקציבים"
        >
          ⚙︎
        </button>

      </header>

      <section
        id="drop"
        class="upload"
      >

        <input
          id="file"
          type="file"
          accept=".xlsx,.xls"
          hidden
        >

        <div class="uploadIcon">
          ↑
        </div>

        <div>

          <strong>
            העלאת פירוט אשראי
          </strong>

          <p>
            גרור לכאן Excel של כאל או בחר קובץ.
            הנתונים נשארים בדפדפן שלך.
          </p>

        </div>

        <button
          id="pick"
          class="btn primary"
        >
          בחירת קובץ
        </button>

        <div
          id="status"
          class="status"
        ></div>

      </section>

      ${
        transactions.length
          ? dashboard(a)
          : `
            <section class="empty card">

              <div class="bigicon">
                ◌
              </div>

              <h2>
                עוד אין מה למדוד
              </h2>

              <p>
                אחרי העלאת הקובץ אארגן את ההוצאות
                ואציע סיווג ראשוני.
                לא צריך להגדיר הכול מראש.
              </p>

            </section>
          `
      }

      <div
        id="drawer"
        class="drawer hidden"
      ></div>

    </main>
  `;

  bind(a);
}

function dashboard(a){
  const discBudget=
    a.budgetRows.reduce(
      (s,x)=>s+x.amount,
      0
    );

  const disc=
    a.byControl.discretionary;

  const pct=
    discBudget
      ? Math.round(
          disc/discBudget*100
        )
      : 0;

  return `

    <section class="hero card">

      <div>

        <span class="kicker">
          הוצאות שבשליטתך
        </span>

        <strong>
          ${money(disc)}
        </strong>

        <p>
          ${
            discBudget
              ? `מתוך מסגרת חודשית בסיסית של ${money(discBudget)}`
              : 'עדיין לא הגדרת תקציבים'
          }
        </p>

      </div>

      <div
        class="ring"
        style="--p:${Math.min(100,pct)}"
      >

        <div>

          <b>
            ${pct}%
          </b>

          <span>
            מהמסגרת
          </span>

        </div>

      </div>

    </section>

    <section class="grid metrics">

      <button
        class="card metric clickable"
        data-open="essential"
      >

        <span>
          הכרחי
        </span>

        <b>
          ${money(a.byControl.essential)}
        </b>

        <small>
          נספר בסך הכול, לא יעד לצמצום
        </small>

      </button>

      <button
        class="card metric clickable"
        data-open="optimizable"
      >

        <span>
          אפשר לייעל
        </span>

        <b>
          ${money(a.byControl.optimizable)}
        </b>

        <small>
          ${a.opt.length} חיובים לבדיקה
        </small>

      </button>

      <button
        class="card metric clickable"
        data-open="review"
      >

        <span>
          לטיפול
        </span>

        <b>
          ${a.review.length}
        </b>

        <small>
          האפליקציה לא בטוחה לגביהם
        </small>

      </button>

    </section>

    <section class="card section">

      <div class="sectionHead">

        <div>

          <span class="kicker">
            היעדים שלך
          </span>

          <h2>
            תקציבים
          </h2>

        </div>

        <button
          id="editBudgets"
          class="textbtn"
        >
          עריכה
        </button>

      </div>

      <div class="budgetList">

        ${
          a.budgetRows
            .map(
              b=>budgetRow(b)
            )
            .join('')
        }

      </div>

    </section>

    <section class="split section">

      <div class="card">

        <span class="kicker">
          מבט רחב
        </span>

        <h2>
          ששת החודשים האחרונים
        </h2>

        ${trend(a)}

      </div>

      <div class="card">

        <span class="kicker">
          תובנות
        </span>

        <h2>
          מה כדאי לדעת
        </h2>

        <div class="insights">

          ${
            a.insights.length
              ? a.insights
                  .map(
                    x=>`
                      <div class="insight">
                        <i>✦</i>
                        <span>${x}</span>
                      </div>
                    `
                  )
                  .join('')
              : `
                <p class="muted">
                  ככל שתעלה עוד חודשים,
                  התמונה כאן תהיה חכמה יותר.
                </p>
              `
          }

        </div>

      </div>

    </section>

    <details class="card section">

      <summary>

        <div>

          <span class="kicker">
            כשבא לך לצלול
          </span>

          <h2>
            כל העסקאות
          </h2>

        </div>

        <span class="chev">
          ⌄
        </span>

      </summary>

      <div class="transactions">

        ${
          a.cur
            .map(
              t=>txRow(t)
            )
            .join('')
        }

      </div>

    </details>

    <footer>

      <button
        id="clear"
        class="dangerlink"
      >
        מחיקת כל הנתונים המקומיים
      </button>

    </footer>
  `;
}

function budgetRow(b){
  const p=
    Math.min(
      100,
      Math.max(
        0,
        b.pct
      )
    );

  return `
    <div class="budget">

      <div class="budgetTop">

        <div>

          <b>
            ${escapeHtml(b.name)}
          </b>

          <small>
            ${
              b.mode==='rollover'
                ? 'תקציב מצטבר'
                : 'תקציב חודשי'
            }
            ·
            ממוצע 6 חודשים
            ${money(b.sixAvg)}
          </small>

        </div>

        <div class="budgetNum">

          <b>
            ${money(b.spent)}
          </b>

          <span>
            /
            ${money(b.amount)}
          </span>

        </div>

      </div>

      <div class="progress">

        <i
          style="width:${p}%"
          class="${b.pct>100?'over':''}"
        ></i>

      </div>

      <div
        class="budgetFoot ${
          b.remaining<0
            ? 'bad'
            : 'good'
        }"
      >

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
    return `
      <p class="muted">
        צריך עוד נתונים.
      </p>
    `;
  }

  const max=
    Math.max(
      ...a.trend.map(
        x=>x.discretionary
      ),
      1
    );

  return `
    <div class="chart">

      ${
        a.trend
          .map(
            x=>`
              <div class="col">

                <div
                  class="colbar"
                  style="
                    height:${
                      Math.max(
                        5,
                        x.discretionary/max*120
                      )
                    }px
                  "
                ></div>

                <b>
                  ${money(x.discretionary)}
                </b>

                <span>
                  ${x.month.slice(5)}
                </span>

              </div>
            `
          )
          .join('')
      }

    </div>

    <p class="muted">
      העמודות מציגות רק הוצאות שסומנו
      ״בשליטתי״,
      כדי שהרעש של הוצאות קבועות
      לא יסתיר את ההתנהלות.
    </p>
  `;
}

function txRow(t){
  return `
    <div class="tx">

      <div class="txMain">

        <b>
          ${escapeHtml(t.merchant)}
        </b>

        <span>
          ${escapeHtml(t.category)}
          ·
          ${
            new Date(
              t.date+'T00:00:00'
            )
            .toLocaleDateString('he-IL')
          }
        </span>

      </div>

      <div class="txRight">

        <b>
          ${money(t.amount)}
        </b>

        <button
          class="tag ${t.control}"
          data-merchant="${encodeURIComponent(t.merchant)}"
        >
          ${icons[t.control]}
          ${labels[t.control]}
        </button>

      </div>

    </div>
  `;
}

function bind(a){
  const input=
    document.querySelector('#file');

  const drop=
    document.querySelector('#drop');

  const status=
    document.querySelector('#status');

  document.querySelector('#pick').onclick=
    ()=>input.click();

  input.onchange=
    ()=>input.files[0] &&
    handle(
      input.files[0],
      status
    );

  ['dragenter','dragover']
    .forEach(
      e=>
        drop.addEventListener(
          e,
          x=>{
            x.preventDefault();
            drop.classList.add('drag');
          }
        )
    );

  ['dragleave','drop']
    .forEach(
      e=>
        drop.addEventListener(
          e,
          x=>{
            x.preventDefault();
            drop.classList.remove('drag');
          }
        )
    );

  drop.addEventListener(
    'drop',
    e=>
      e.dataTransfer.files[0] &&
      handle(
        e.dataTransfer.files[0],
        status
      )
  );

  document
    .querySelectorAll('.tag')
    .forEach(
      x=>
        x.onclick=
          ()=>openMerchant(
            decodeURIComponent(
              x.dataset.merchant
            )
          )
    );

  document
    .querySelectorAll('[data-open]')
    .forEach(
      x=>
        x.onclick=
          ()=>openClass(
            x.dataset.open,
            a
          )
    );

  document.querySelector('#settings').onclick=
    ()=>openBudgets();

  document
    .querySelector('#editBudgets')
    ?.addEventListener(
      'click',
      openBudgets
    );

  document
    .querySelector('#clear')
    ?.addEventListener(
      'click',
      ()=>{
        if(
          confirm(
            'למחוק את כל הנתונים וההגדרות ששמורים בדפדפן?'
          )
        ){
          clearAll();

          transactions=[];

          prefs=
            loadPreferences();

          render();
        }
      }
    );
}

function showDrawer(html){
  const d=
    document.querySelector('#drawer');

  d.innerHTML=`
    <div
      class="shade"
      data-close
    ></div>

    <aside>

      <button
        class="close"
        data-close
      >
        ×
      </button>

      ${html}

    </aside>
  `;

  d.classList.remove('hidden');

  d
    .querySelectorAll('[data-close]')
    .forEach(
      x=>
        x.onclick=
          ()=>d.classList.add('hidden')
    );
}

function openMerchant(merchant){
  const rule=
    prefs.merchantRules[merchant]||{};

  showDrawer(`
    <span class="kicker">
      סיווג קבוע
    </span>

    <h2>
      ${escapeHtml(merchant)}
    </h2>

    <p class="muted">
      הבחירה תיזכר גם בקבצים הבאים
      שבהם יופיע אותו בית עסק.
    </p>

    <div class="choices">

      ${
        Object
          .entries(labels)
          .map(
            ([k,v])=>`
              <button
                data-class="${k}"
                class="
                  choice
                  ${
                    rule.control===k
                      ? 'selected'
                      : ''
                  }
                "
              >

                <b>
                  ${icons[k]}
                  ${v}
                </b>

                <small>
                  ${
                    k==='essential'
                      ? 'הוצאה שצריך לחיות איתה'
                      :
                    k==='optimizable'
                      ? 'צריך אותה, אבל אולי אפשר לשלם פחות'
                      :
                    k==='discretionary'
                      ? 'כאן תקציב והרגלים באמת משנים'
                      :
                      'אשאיר אותה ברשימת הדברים לבדיקה'
                  }
                </small>

              </button>
            `
          )
          .join('')
      }

    </div>

    <label>

      תקציב משויך

      <select id="group">

        <option value="">
          ללא
        </option>

        ${
          Object
            .keys(prefs.budgets)
            .map(
              x=>`
                <option
                  ${
                    rule.budgetGroup===x
                      ? 'selected'
                      : ''
                  }
                >
                  ${escapeHtml(x)}
                </option>
              `
            )
            .join('')
        }

      </select>

    </label>
  `);

  document
    .querySelectorAll('[data-class]')
    .forEach(
      b=>
        b.onclick=
          ()=>{
            prefs.merchantRules[merchant]={
              ...prefs.merchantRules[merchant],
              control:b.dataset.class,
              budgetGroup:
                document.querySelector('#group').value
            };

            savePreferences(prefs);

            render();
          }
    );

  document.querySelector('#group').onchange=
    e=>{
      prefs.merchantRules[merchant]={
        ...prefs.merchantRules[merchant],
        budgetGroup:e.target.value
      };

      savePreferences(prefs);
    };
}

function openClass(cls,a){
  const rows=
    a.cur.filter(
      t=>t.control===cls
    );

  showDrawer(`
    <span class="kicker">
      ${labels[cls]}
    </span>

    <h2>
      ${rows.length}
      עסקאות
    </h2>

    <div class="transactions">

      ${
        rows
          .map(
            txRow
          )
          .join('')
      }

    </div>
  `);

  document
    .querySelectorAll('#drawer .tag')
    .forEach(
      x=>
        x.onclick=
          ()=>openMerchant(
            decodeURIComponent(
              x.dataset.merchant
            )
          )
    );
}

function openBudgets(){
  showDrawer(`
    <span class="kicker">
      היעדים שלך
    </span>

    <h2>
      תקציבים
    </h2>

    <p class="muted">
      חודשי מתאפס בכל חודש.
      מצטבר שומר את מה שלא השתמשת בו
      לרכישה גדולה בעתיד.
    </p>

    <div id="budgetEdit">

      ${
        Object
          .entries(prefs.budgets)
          .map(
            ([n,b])=>`
              <div class="budgetEdit">

                <input
                  value="${escapeHtml(n)}"
                  disabled
                >

                <input
                  data-amount="${encodeURIComponent(n)}"
                  type="number"
                  value="${b.amount}"
                >

                <select
                  data-mode="${encodeURIComponent(n)}"
                >

                  <option
                    value="monthly"
                    ${
                      b.mode==='monthly'
                        ? 'selected'
                        : ''
                    }
                  >
                    חודשי
                  </option>

                  <option
                    value="rollover"
                    ${
                      b.mode==='rollover'
                        ? 'selected'
                        : ''
                    }
                  >
                    מצטבר
                  </option>

                </select>

              </div>
            `
          )
          .join('')
      }

    </div>

    <button
      id="saveBudgets"
      class="btn primary wide"
    >
      שמירה
    </button>
  `);

  document.querySelector('#saveBudgets').onclick=
    ()=>{
      document
        .querySelectorAll('[data-amount]')
        .forEach(
          x=>{
            const n=
              decodeURIComponent(
                x.dataset.amount
              );

            prefs.budgets[n].amount=
              Math.max(
                0,
                +x.value||0
              );
          }
        );

      document
        .querySelectorAll('[data-mode]')
        .forEach(
          x=>{
            const n=
              decodeURIComponent(
                x.dataset.mode
              );

            prefs.budgets[n].mode=
              x.value;
          }
        );

      savePreferences(prefs);

      render();
    };
}

async function handle(file,status){
  try{
    status.className='status';

    status.textContent=
      'קוראת ומארגנת…';

    const incoming=
      await importCalWorkbook(file);

    const before=
      transactions.length;

    transactions=
      mergeTransactions(
        transactions,
        incoming
      );

    saveTransactions(
      transactions
    );

    const added=
      transactions.length-before;

    render();

    const s=
      document.querySelector('#status');

    s.textContent=
      `✓ נקלטו ${incoming.length} עסקאות · ${added} חדשות`;

    s.className=
      'status success';

  }catch(e){

    console.error(e);

    status.className=
      'status error';

    status.textContent=
      e.message ||
      'לא הצלחתי לקרוא את הקובץ.';
  }
}

render();
