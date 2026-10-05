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
export function loadTransactions(){try{return JSON.parse(localStorage.getItem(TX)||localStorage.getItem('kama-yatza.transactions.v1')||'[]')}catch{return []}}
export function saveTransactions(items){localStorage.setItem(TX,JSON.stringify(items))}
export function mergeTransactions(existing,incoming){const map=new Map(existing.map(t=>[t.id,t]));incoming.forEach(t=>map.set(t.id,{...map.get(t.id),...t}));return [...map.values()].sort((a,b)=>b.date.localeCompare(a.date))}
export function loadPreferences(){try{return {...DEFAULTS,...JSON.parse(localStorage.getItem(PREF)||'{}')}}catch{return structuredClone(DEFAULTS)}}
export function savePreferences(p){localStorage.setItem(PREF,JSON.stringify(p))}
export function clearAll(){localStorage.removeItem(TX);localStorage.removeItem(PREF);localStorage.removeItem('kama-yatza.transactions.v1')}
