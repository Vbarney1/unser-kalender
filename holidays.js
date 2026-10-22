// holidays.js – Feiertage in Bayern, werden jedes Jahr neu berechnet (nicht gespeichert).
// Feiertage sind keine normale Kategorie: Man kann sie nicht ausblenden oder bearbeiten.

import { addDays, toISODate } from './calendar.js';

export const HOLIDAY_COLOR = '#f59e0b';

// Ostersonntag nach der Gaußschen Osterformel (Variante für den gregorianischen Kalender).
// Viele Feiertage hängen an Ostern, z. B. Pfingstmontag = Ostern + 50 Tage.
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

const cache = new Map(); // jedes Jahr nur einmal ausrechnen

function holidaysOfYear(year) {
  if (cache.has(year)) return cache.get(year);
  const easter = easterSunday(year);
  const fixed = (month, day, name) => ({ date: toISODate(new Date(year, month - 1, day)), name });
  const afterEaster = (days, name) => ({ date: toISODate(addDays(easter, days)), name });

  const list = [
    fixed(1, 1, 'Neujahr'),
    fixed(1, 6, 'Heilige Drei Könige'),
    afterEaster(-2, 'Karfreitag'),
    afterEaster(0, 'Ostersonntag'),
    afterEaster(1, 'Ostermontag'),
    fixed(5, 1, 'Tag der Arbeit'),
    afterEaster(39, 'Christi Himmelfahrt'),
    afterEaster(49, 'Pfingstsonntag'),
    afterEaster(50, 'Pfingstmontag'),
    afterEaster(60, 'Fronleichnam'),
    fixed(8, 15, 'Mariä Himmelfahrt'),
    fixed(10, 3, 'Tag der Deutschen Einheit'),
    fixed(11, 1, 'Allerheiligen'),
    fixed(12, 25, '1. Weihnachtstag'),
    fixed(12, 26, '2. Weihnachtstag'),
  ];
  cache.set(year, list);
  return list;
}

// Alle Feiertage zwischen from und to (inklusive), beide als "YYYY-MM-DD".
export function holidaysInRange(from, to) {
  const out = [];
  for (let year = Number(from.slice(0, 4)); year <= Number(to.slice(0, 4)); year++) {
    out.push(...holidaysOfYear(year).filter(h => h.date >= from && h.date <= to));
  }
  return out;
}
