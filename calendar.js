// calendar.js – reine Datumslogik, ohne HTML. So lässt sie sich leicht testen.

export const WEEKDAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

// Wir speichern Daten als Text "YYYY-MM-DD" in LOKALER Zeit.
// (toISOString() würde UTC nehmen – dann landet ein Termin um 0:30 Uhr am Vortag.)
// Praktischer Nebeneffekt: Solche Texte kann man direkt mit < und > vergleichen.
export function toISODate(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function parseISODate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date, n) {
  const r = new Date(date);
  r.setDate(r.getDate() + n);
  return r;
}

// Woche beginnt am Montag. getDay() liefert 0 = Sonntag, deshalb die Umrechnung.
export function startOfWeek(date) {
  const r = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return addDays(r, -((r.getDay() + 6) % 7));
}

// Immer 6 Wochen × 7 Tage, damit das Raster nicht springt.
export function monthGrid(year, month) {
  const start = startOfWeek(new Date(year, month, 1));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function weekDays(date) {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

function daysBetween(a, b) {
  // Math.round gleicht die Zeitumstellung (23 oder 25 Stunden) aus.
  return Math.round((parseISODate(b) - parseISODate(a)) / 86_400_000);
}

// Liefert alle Vorkommen zwischen from und to (inklusive).
// Wiederkehrende Termine sind nur EINMAL gespeichert – hier werden die einzelnen
// Wochen ausgerechnet. Jedes Vorkommen bekommt zusätzlich "occurrenceDate".
export function occurrences(events, from, to) {
  const out = [];
  for (const ev of events) {
    if (!ev.repeatUntil) {
      if (ev.date >= from && ev.date <= to) out.push({ ...ev, occurrenceDate: ev.date });
      continue;
    }
    const last = ev.repeatUntil < to ? ev.repeatUntil : to;
    let d = parseISODate(ev.date);
    if (ev.date < from) d = addDays(d, Math.ceil(daysBetween(ev.date, from) / 7) * 7);
    for (let s = toISODate(d); s <= last; d = addDays(d, 7), s = toISODate(d)) {
      out.push({ ...ev, occurrenceDate: s });
    }
  }
  return out.sort(compareOccurrences);
}

// Sortierung: nach Tag, dann ganztägige zuerst, dann nach Uhrzeit.
function compareOccurrences(a, b) {
  if (a.occurrenceDate !== b.occurrenceDate) return a.occurrenceDate < b.occurrenceDate ? -1 : 1;
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  return (a.start ?? '').localeCompare(b.start ?? '');
}

export function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(min) {
  const clamped = Math.max(0, Math.min(min, 23 * 60 + 59));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

// Überlappende Termine in der Wochenansicht nebeneinander anordnen.
// Jeder Eintrag bekommt "lane" (Spalte) und "lanes" (Anzahl Spalten seiner Gruppe).
export function layoutOverlaps(items) {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  let group = [];
  let groupEnd = -1;
  const flush = () => {
    const laneEnds = [];
    for (const it of group) {
      let lane = laneEnds.findIndex(end => end <= it.startMin);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = it.endMin;
      it.lane = lane;
    }
    group.forEach(it => { it.lanes = laneEnds.length; });
    group = [];
  };
  for (const it of sorted) {
    if (group.length && it.startMin >= groupEnd) flush();
    group.push(it);
    groupEnd = Math.max(groupEnd, it.endMin);
  }
  flush();
  return sorted;
}

const longDate = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
const monthYear = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' });
const dayMonthShort = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short' });

export const formatLongDate = iso => longDate.format(parseISODate(iso));
export const formatMonthTitle = d => monthYear.format(d);

export function formatWeekTitle(days) {
  const first = days[0], last = days[6];
  const left = first.getMonth() === last.getMonth() ? `${first.getDate()}.` : dayMonthShort.format(first);
  // Jahr nur anzeigen, wenn es nicht das aktuelle ist – spart Platz auf dem Handy.
  const year = last.getFullYear() === new Date().getFullYear() ? '' : ` ${last.getFullYear()}`;
  return `${left}–${dayMonthShort.format(last)}${year}`;
}
