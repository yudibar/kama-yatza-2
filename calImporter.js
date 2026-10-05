const XLSX = window.XLSX;

const HEADER_MARKER = 'תאריך\nעסקה';
const text = v => String(v ?? '').trim();
const number = v => Number(String(v ?? 0).replace(/[,₪]/g, '')) || 0;

function excelDate(value) {
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    const p = XLSX.SSF.parse_date_code(value);
    return p ? new Date(p.y, p.m - 1, p.d) : null;
  }
  const m = text(value).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null;
  let y = Number(m[3]); if (y < 100) y += 2000;
  return new Date(y, Number(m[2]) - 1, Number(m[1]));
}

function idFor(t) {
  return [t.date, t.merchant, t.amount, t.type, t.notes].join('|').toLowerCase();
}

export async function importCalWorkbook(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
  const headerIndex = rows.findIndex(r => text(r[0]) === HEADER_MARKER);
  if (headerIndex < 0) throw new Error('הקובץ לא נראה כמו פירוט עסקאות של כאל הנתמך כרגע.');

  return rows.slice(headerIndex + 1).filter(r => r.some(v => v != null)).map(r => {
    const d = excelDate(r[0]);
    const transaction = {
      source: 'CAL',
      date: d ? d.toISOString().slice(0, 10) : '',
      merchant: text(r[1]),
      originalAmount: number(r[2]),
      amount: number(r[3]),
      type: text(r[4]),
      category: text(r[5]) || 'אחר',
      notes: text(r[6])
    };
    return { ...transaction, id: idFor(transaction) };
  }).filter(t => t.date && t.merchant && t.amount !== 0);
}
