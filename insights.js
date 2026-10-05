const food=/wolt|וולט|ארומה|קפית|פיצה|מסעד|קפה|coffee|cafe/i;
const fixed=/ביטוח|כללית|מכבי|מאוחדת|לאומית|רב.?פס|חינוך|בית ספר|גן |ארנונה|חשמל|מים/i;
const optimize=/netflix|tidal|spotify|microsoft|google|yes|hot|next|סלקום|cellcom|partner|פרטנר|bezeq|בזק|אינטרנט|ביטוח|chatgpt|openai/i;
const discretionary=/wolt|וולט|מסעד|קפה|ארומה|פיצה|urbanica|אורבניקה|max stock|מקס סטוק|amazon|אמזון|איקאה|ikea/i;
export function suggestedClass(t){const s=`${t.merchant} ${t.category}`;if(food.test(s)||discretionary.test(s))return 'discretionary';if(optimize.test(s))return 'optimizable';if(fixed.test(s))return 'essential';return 'review'}
export function budgetGroup(t){const s=`${t.merchant} ${t.category}`;if(food.test(s))return 'מסעדות ואוכל בחוץ';if(/ביגוד|אופנה|urbanica|אורבניקה|max stock|מקס סטוק/i.test(s))return 'קניות ופינוקים';return 'שונות ורכישות גדולות'}
export function monthKey(d){return d.slice(0,7)}
export function analyze(items,prefs){
 const decorated=items.map(t=>{const rule=prefs.merchantRules[t.merchant]||{};return {...t,control:rule.control||suggestedClass(t),budgetGroup:rule.budgetGroup||budgetGroup(t)}});
 const months=[...new Set(decorated.map(t=>monthKey(t.date)))].sort();const current=months.at(-1)||'';const cur=decorated.filter(t=>monthKey(t.date)===current);
 const sum=x=>x.reduce((s,t)=>s+Math.max(0,t.amount),0), total=sum(cur);
 const classes=['essential','optimizable','discretionary','review'];const byControl=Object.fromEntries(classes.map(c=>[c,sum(cur.filter(t=>t.control===c))]));
 const byCategory=Object.entries(cur.reduce((a,t)=>{a[t.category]=(a[t.category]||0)+t.amount;return a},{})).sort((a,b)=>b[1]-a[1]);
 const budgetRows=Object.entries(prefs.budgets||{}).map(([name,b])=>{
   const spent=sum(cur.filter(t=>t.control==='discretionary'&&t.budgetGroup===name));
   const historical=months.filter(m=>m<=current); let allowance=b.amount;
   if(b.mode==='rollover') allowance=b.amount*Math.max(1,historical.length);
   const historicalSpent=sum(decorated.filter(t=>historical.includes(monthKey(t.date))&&t.control==='discretionary'&&t.budgetGroup===name));
   const used=b.mode==='rollover'?historicalSpent:spent, remaining=allowance-used;
   const six=months.slice(-6); const sixSpent=sum(decorated.filter(t=>six.includes(monthKey(t.date))&&t.control==='discretionary'&&t.budgetGroup===name));
   return {name,...b,spent,allowance,remaining,pct:allowance?used/allowance*100:0,sixAvg:six.length?sixSpent/six.length:0};
 });
 const disc=byControl.discretionary, discBudget=budgetRows.filter(x=>x.mode==='monthly').reduce((s,x)=>s+x.amount,0)+budgetRows.filter(x=>x.mode==='rollover').reduce((s,x)=>s+x.amount,0);
 const score=discBudget?Math.max(0,Math.min(100,Math.round(100-(disc/discBudget)*45))):null;
 const review=cur.filter(t=>t.control==='review'); const opt=cur.filter(t=>t.control==='optimizable');
 const sixMonths=months.slice(-6); const trend=sixMonths.map(m=>({month:m,discretionary:sum(decorated.filter(t=>monthKey(t.date)===m&&t.control==='discretionary')),total:sum(decorated.filter(t=>monthKey(t.date)===m))}));
 const insights=[];
 const over=budgetRows.filter(x=>x.remaining<0); if(over.length)insights.push(`יש ${over.length} תקציבים בחריגה החודש. הגדול שבהם: ${over.sort((a,b)=>a.remaining-b.remaining)[0].name}.`);
 const under=budgetRows.filter(x=>x.remaining>0); if(under.length)insights.push(`נשארו לך מרווחים בתקציבים. זה כסף שלא חייב למצוא משהו לקנות.`);
 if(opt.length)insights.push(`${opt.length} חיובים סומנו כ״הכרחי אבל ניתן לאופטימיזציה״. אלה מועמדים להשוואת מחיר, לא לביטול אוטומטי.`);
 if(review.length)insights.push(`${review.length} עסקאות עדיין מחכות לסיווג שלך. אפשר להשאיר אותן כך ולחזור אליהן כשנוח.`);
 return {decorated,current,cur,total,byControl,byCategory,budgetRows,score,review,opt,trend,insights};
}
