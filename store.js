// store.js – die EINZIGE Datei, die weiß, WO die Daten liegen.
// Heute: localStorage im Browser. Später: Supabase.
// Der Rest der App ruft nur diese Funktionen auf und merkt vom Wechsel nichts.

const DATA_KEY = 'unser-kalender:data';   // Termine, Kategorien, Ansichten (später geteilt)
const PREFS_KEY = 'unser-kalender:prefs'; // Einstellungen dieses Geräts (bleiben immer lokal)

const DEFAULT_CATEGORIES = [
  { id: 'uni', name: 'Uni', color: '#3b82f6' },
  { id: 'privat', name: 'Privat', color: '#22c55e' },
  { id: 'gemeinsam', name: 'Gemeinsam', color: '#a855f7' },
];

// localStorage kann nur Text speichern, deshalb wandeln wir mit JSON um.
function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    console.warn('Konnte', key, 'nicht lesen:', err);
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error(err);
    alert('Speichern fehlgeschlagen. Ist der Speicher voll oder privates Surfen aktiv?');
  }
}

/* Datenmodell:
   event    = { id, title, categoryId, date: 'YYYY-MM-DD', allDay, start: 'HH:MM'|null,
                end: 'HH:MM'|null, repeatUntil: 'YYYY-MM-DD'|null, note }
   category = { id, name, color: '#rrggbb' }
   view     = { id, name, categoryIds: [] } */
const isHexColor = c => /^#[0-9a-f]{6}$/i.test(c);
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isTime = s => typeof s === 'string' && /^\d{2}:\d{2}$/.test(s);

// Gespeicherte Daten nie blind vertrauen: Ein kaputter Eintrag soll nicht die ganze
// App abstürzen lassen. Wir reparieren, was geht, und werfen den Rest weg.
// (Das brauchen wir später auch für Backup-Import und Supabase.)
function normalizeEvent(e) {
  if (!e || typeof e.id !== 'string' || !isDate(e.date)) return null;
  const hasTimes = isTime(e.start) && isTime(e.end) && e.end > e.start;
  const allDay = Boolean(e.allDay) || !hasTimes;
  return {
    id: e.id,
    title: String(e.title ?? '').trim() || '(ohne Titel)',
    categoryId: String(e.categoryId ?? ''),
    date: e.date,
    allDay,
    start: allDay ? null : e.start,
    end: allDay ? null : e.end,
    repeatUntil: isDate(e.repeatUntil) && e.repeatUntil >= e.date ? e.repeatUntil : null,
    note: String(e.note ?? ''),
  };
}

function normalizeData(raw) {
  const categories = (Array.isArray(raw?.categories) ? raw.categories : [])
    .filter(c => c && typeof c.id === 'string')
    .map(c => ({ id: c.id, name: String(c.name ?? '').trim() || 'Ohne Namen', color: isHexColor(c.color) ? c.color : '#8e8e93' }));
  return {
    version: 1,
    categories: categories.length ? categories : DEFAULT_CATEGORIES.map(c => ({ ...c })),
    events: (Array.isArray(raw?.events) ? raw.events : []).map(normalizeEvent).filter(Boolean),
    views: (Array.isArray(raw?.views) ? raw.views : [])
      .filter(v => v && typeof v.id === 'string' && Array.isArray(v.categoryIds))
      .map(v => ({ id: v.id, name: String(v.name ?? 'Ansicht'), categoryIds: v.categoryIds.map(String) })),
  };
}

const data = normalizeData(readJSON(DATA_KEY, null));
const prefs = { mode: 'month', hiddenCategoryIds: [], ...readJSON(PREFS_KEY, {}) };
if (!['month', 'week'].includes(prefs.mode)) prefs.mode = 'month';
if (!Array.isArray(prefs.hiddenCategoryIds)) prefs.hiddenCategoryIds = [];

const persist = () => writeJSON(DATA_KEY, data);

export function newId() {
  // randomUUID gibt es nur über HTTPS/localhost, deshalb ein Ersatz.
  return crypto.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ---------- Termine ----------
export const getEvents = () => data.events;

export function saveEvent(event) {
  const i = data.events.findIndex(e => e.id === event.id);
  if (i === -1) data.events.push(event);
  else data.events[i] = event;
  persist();
}

export function deleteEvent(id) {
  data.events = data.events.filter(e => e.id !== id);
  persist();
}

// ---------- Kategorien ----------
export const getCategories = () => data.categories;

export function addCategory(name, color) {
  const category = { id: newId(), name: name.trim(), color: isHexColor(color) ? color : '#888888' };
  data.categories.push(category);
  persist();
  return category;
}

export function updateCategory(id, patch) {
  const cat = data.categories.find(c => c.id === id);
  if (!cat) return;
  if (patch.name?.trim()) cat.name = patch.name.trim();
  if (isHexColor(patch.color)) cat.color = patch.color;
  persist();
}

export function deleteCategory(id) {
  const used = data.events.filter(e => e.categoryId === id).length;
  if (used > 0) return { ok: false, message: `Diese Kategorie hat noch ${used} Termin(e). Bitte erst verschieben oder löschen.` };
  if (data.categories.length <= 1) return { ok: false, message: 'Mindestens eine Kategorie muss bleiben.' };
  data.categories = data.categories.filter(c => c.id !== id);
  data.views.forEach(v => { v.categoryIds = v.categoryIds.filter(cid => cid !== id); });
  persist();
  setPrefs({ hiddenCategoryIds: prefs.hiddenCategoryIds.filter(cid => cid !== id) });
  return { ok: true };
}

// ---------- Gespeicherte Ansichten ----------
// Später mit Supabase: Ansichten gehören zum jeweiligen Konto und werden nicht geteilt.
export const getViews = () => data.views;

export function addView(name, categoryIds) {
  data.views.push({ id: newId(), name: name.trim(), categoryIds: [...categoryIds] });
  persist();
}

export function deleteView(id) {
  data.views = data.views.filter(v => v.id !== id);
  persist();
}

// ---------- Geräte-Einstellungen ----------
export const getPrefs = () => prefs;

export function setPrefs(patch) {
  Object.assign(prefs, patch);
  writeJSON(PREFS_KEY, prefs);
}
