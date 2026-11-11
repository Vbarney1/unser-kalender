// store.js – die EINZIGE Datei, die weiß, WO die Daten liegen.
// Termine, Kategorien und Ansichten liegen in Supabase (Online-Datenbank, siehe supabase/schema.sql).
// Eine Kopie bleibt im Browser: So zeigt die App sofort etwas an, auch ohne Internet.
// Ändern geht nur online ("offline nur ansehen") – so gibt es keine Konflikte zwischen zwei Handys.
//
// Lesen (getEvents usw.) ist sofort da. Ändern (saveEvent usw.) ist async und wirft bei
// Problemen einen Error mit einer deutschen Meldung, die die App direkt anzeigen kann.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const CACHE_KEY = 'unser-kalender:cache';  // Kopie der Online-Daten
const PREFS_KEY = 'unser-kalender:prefs';  // Einstellungen dieses Geräts (bleiben immer lokal)
const LEGACY_KEY = 'unser-kalender:data';  // alte, rein lokale Daten aus Version 1

export const isConfigured = /^https:\/\/.+/.test(SUPABASE_URL)
  && !SUPABASE_URL.includes('DEIN-PROJEKT') && !SUPABASE_ANON_KEY.startsWith('DEIN-');

// window.supabase kommt aus dem <script>-Tag in index.html.
// Fehlt es (allererster Start ganz ohne Netz), bleibt db null und die App zeigt nur die Kopie.
const AUTH_KEY = 'unser-kalender:auth'; // hier merkt sich Supabase die Anmeldung
const db = isConfigured && window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { storageKey: AUTH_KEY } })
  : null;

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
    console.warn('Konnte', key, 'nicht speichern:', err);
  }
}

/* Datenmodell in der App:
   event    = { id, title, categoryId, date: 'YYYY-MM-DD', allDay, start: 'HH:MM'|null,
                end: 'HH:MM'|null, repeatUntil: 'YYYY-MM-DD'|null, note }
   category = { id, name, color: '#rrggbb' }
   view     = { id, name, categoryIds: [] }
   In der Datenbank heißen die Spalten in snake_case (category_id, all_day, ...). */
const isHexColor = c => /^#[0-9a-f]{6}$/i.test(c);
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isTime = s => typeof s === 'string' && /^\d{2}:\d{2}$/.test(s);

// Gespeicherte Daten nie blind vertrauen: Ein kaputter Eintrag soll nicht die ganze
// App abstürzen lassen. Wir reparieren, was geht, und werfen den Rest weg.
function normalizeEvent(e) {
  if (!e || typeof e.id !== 'string' || !isDate(e.date)) return null;
  const hasTimes = isTime(e.start) && isTime(e.end) && e.end > e.start;
  const allDay = Boolean(e.allDay) || !hasTimes;
  return {
    id: e.id,
    title: String(e.title ?? '').trim().slice(0, 100) || '(ohne Titel)',
    categoryId: String(e.categoryId ?? ''),
    date: e.date,
    allDay,
    start: allDay ? null : e.start,
    end: allDay ? null : e.end,
    repeatUntil: isDate(e.repeatUntil) && e.repeatUntil >= e.date ? e.repeatUntil : null,
    note: String(e.note ?? '').slice(0, 2000),
  };
}

const normalizeCategory = c => (c && typeof c.id === 'string')
  ? { id: c.id, name: String(c.name ?? '').trim().slice(0, 30) || 'Ohne Namen', color: isHexColor(c.color) ? c.color : '#8e8e93' }
  : null;

const normalizeView = v => (v && typeof v.id === 'string' && Array.isArray(v.categoryIds))
  ? { id: v.id, name: String(v.name ?? '').trim().slice(0, 30) || 'Ansicht', categoryIds: v.categoryIds.map(String) }
  : null;

const list = (value, normalize) => (Array.isArray(value) ? value : []).map(normalize).filter(Boolean);

function normalizeData(raw) {
  return {
    categories: list(raw?.categories, normalizeCategory),
    events: list(raw?.events, normalizeEvent),
    views: list(raw?.views, normalizeView),
  };
}

// Umrechnen zwischen App-Format und Datenbank-Format.
// Postgres liefert Uhrzeiten als "09:00:00" – wir brauchen nur "09:00".
const fromDb = {
  event: r => normalizeEvent({
    id: r.id, title: r.title, categoryId: r.category_id, date: r.date, allDay: r.all_day,
    start: r.start_time?.slice(0, 5) ?? null, end: r.end_time?.slice(0, 5) ?? null,
    repeatUntil: r.repeat_until, note: r.note,
  }),
  category: r => normalizeCategory(r),
  view: r => normalizeView({ id: r.id, name: r.name, categoryIds: r.category_ids ?? [] }),
};

const toDbEvent = e => ({
  id: e.id, title: e.title, category_id: e.categoryId, date: e.date, all_day: e.allDay,
  start_time: e.start, end_time: e.end, repeat_until: e.repeatUntil, note: e.note,
  updated_at: new Date().toISOString(),
});

// ---------- Zustand ----------
const cache = readJSON(CACHE_KEY, null);
let userId = cache?.userId ?? null;
let data = normalizeData(cache);
const prefs = { mode: 'month', hiddenCategoryIds: [], ...readJSON(PREFS_KEY, {}) };
if (!['month', 'week'].includes(prefs.mode)) prefs.mode = 'month';
if (!Array.isArray(prefs.hiddenCategoryIds)) prefs.hiddenCategoryIds = [];

// connecting: Verbindung wird gerade aufgebaut. online: letzte Anfrage hat geklappt.
// member: Konto ist in der Tabelle "members" freigeschaltet.
const status = { connecting: true, online: false, member: true, email: cache?.email ?? '', problem: '' };

const listeners = new Set();
export const onChange = fn => listeners.add(fn);
const notify = () => listeners.forEach(fn => fn());

const saveCache = () => writeJSON(CACHE_KEY, { userId, email: status.email, ...data });

export const getStatus = () => status;
export const canEdit = () => Boolean(db && userId && status.online && status.member);

export function newId() {
  // randomUUID gibt es nur über HTTPS/localhost, deshalb ein Ersatz.
  return crypto.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ---------- Anmeldung & Laden ----------

// Sofort beim Start, ohne Netz: Was sollen wir zuerst zeigen?
export function firstScreen() {
  if (!isConfigured) return 'setup';
  return userId ? 'app' : 'login';
}

// Verbindung aufbauen. Liefert danach 'app' oder 'login'.
export async function connect() {
  if (!db) {
    status.connecting = false;
    status.problem = 'Keine Verbindung';
    notify();
    return userId ? 'app' : 'login';
  }

  const { data: result, error } = await db.auth.getSession();
  const session = result?.session;
  status.connecting = false;

  if (!session) {
    // Ohne Netz kann Supabase die Anmeldung nicht erneuern. Dann trotzdem die Kopie zeigen.
    if (userId && (error || !navigator.onLine)) {
      status.problem = 'Keine Verbindung';
      notify();
      return 'app';
    }
    forgetUser();
    return 'login';
  }

  useSession(session);
  await refresh();
  return 'app';
}

function useSession(session) {
  if (userId !== session.user.id) {
    data = normalizeData(null); // anderes Konto: alte Kopie nicht anzeigen
  }
  userId = session.user.id;
  status.email = session.user.email ?? '';
  subscribe();
}

function forgetUser() {
  userId = null;
  status.email = '';
  status.online = false;
  data = normalizeData(null);
  try { localStorage.removeItem(CACHE_KEY); } catch { /* egal */ }
  if (channel) {
    db?.removeChannel(channel);
    channel = null;
  }
  notify();
}

export async function signIn(email, password) {
  if (!db) throw new Error('Keine Verbindung zum Server. Bist du online?');
  const { data: result, error } = await db.auth.signInWithPassword({ email: email.trim(), password });
  if (error) {
    if (/invalid login credentials/i.test(error.message)) throw new Error('E-Mail oder Passwort ist falsch.');
    if (isNetworkError(error)) throw new Error('Keine Verbindung zum Server. Bist du online?');
    throw new Error(`Anmelden fehlgeschlagen: ${error.message}`);
  }
  useSession(result.session);
  await refresh();
}

export async function signOut() {
  // signOut() meldet auch beim Server ab. Ohne Netz schlägt das fehl und Supabase
  // behält die Anmeldung – dann löschen wir sie auf diesem Gerät selbst.
  const { error } = db ? await db.auth.signOut().catch(err => ({ error: err })) : { error: true };
  if (error) {
    try { localStorage.removeItem(AUTH_KEY); } catch { /* egal */ }
  }
  forgetUser();
}

// Alles neu vom Server holen. Die Datenmengen sind klein, deshalb ist das einfacher
// und sicherer, als einzelne Änderungen nachzuverfolgen.
export async function refresh() {
  if (!db || !userId) return;
  try {
    const [c, e, v, m] = await Promise.all([
      db.from('categories').select('*').order('created_at'),
      db.from('events').select('*'),
      db.from('views').select('*').order('created_at'),
      db.from('members').select('user_id').eq('user_id', userId),
    ]);
    const error = c.error || e.error || v.error || m.error;
    if (error) throw error;
    data = {
      categories: c.data.map(fromDb.category).filter(Boolean),
      events: e.data.map(fromDb.event).filter(Boolean),
      views: v.data.map(fromDb.view).filter(Boolean),
    };
    status.member = m.data.length > 0;
    status.online = true;
    status.problem = '';
    saveCache();
  } catch (err) {
    console.warn('Laden fehlgeschlagen:', err);
    status.online = false;
    status.problem = isNetworkError(err) ? 'Keine Verbindung' : `Server-Fehler: ${err.message}`;
  }
  notify();
}

// Live-Updates: Ändert die andere Person etwas, meldet Supabase das sofort.
let channel = null;
let refreshTimer = null;
const refreshSoon = () => {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refresh, 300); // mehrere Änderungen auf einmal nur einmal laden
};

function subscribe() {
  if (!db || channel) return;
  channel = db.channel('kalender')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, refreshSoon)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, refreshSoon)
    .subscribe();
}

// Auf dem iPhone schläft die App im Hintergrund – beim Zurückkommen neu laden.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshSoon();
});
window.addEventListener('online', refreshSoon);

// Safari meldet "Load failed", Chrome "Failed to fetch", Firefox "NetworkError".
const isNetworkError = err => !navigator.onLine || /failed to fetch|load failed|networkerror|fetch/i.test(err?.message ?? '');

// Führt eine Änderung auf dem Server aus und übersetzt Fehler in verständliche Meldungen.
async function write(query) {
  if (!canEdit()) {
    throw new Error(status.member ? 'Gerade offline – Änderungen gehen erst wieder mit Internet.' : 'Dein Konto ist noch nicht freigeschaltet.');
  }
  const { error } = await query;
  if (!error) return;
  if (isNetworkError(error)) {
    status.online = false;
    status.problem = 'Keine Verbindung';
    notify();
    throw new Error('Keine Verbindung – es wurde nichts gespeichert.');
  }
  if (error.code === '23503') throw new Error('Diese Kategorie wird noch von Terminen benutzt.');
  throw new Error(`Speichern fehlgeschlagen: ${error.message}`);
}

function replaceIn(arr, item) {
  const i = arr.findIndex(x => x.id === item.id);
  if (i === -1) arr.push(item);
  else arr[i] = item;
}

// ---------- Termine ----------
export const getEvents = () => data.events;

export async function saveEvent(event) {
  await write(db.from('events').upsert(toDbEvent(event)));
  replaceIn(data.events, event);
  saveCache();
}

export async function deleteEvent(id) {
  await write(db.from('events').delete().eq('id', id));
  data.events = data.events.filter(e => e.id !== id);
  saveCache();
}

// ---------- Kategorien ----------
export const getCategories = () => data.categories;

export async function addCategory(name, color) {
  const category = { id: newId(), name: name.trim().slice(0, 30), color: isHexColor(color) ? color : '#888888' };
  await write(db.from('categories').insert(category));
  data.categories.push(category);
  saveCache();
  return category;
}

export async function updateCategory(id, patch) {
  const cat = data.categories.find(c => c.id === id);
  if (!cat) return;
  const changes = {};
  if (patch.name?.trim()) changes.name = patch.name.trim().slice(0, 30);
  if (isHexColor(patch.color)) changes.color = patch.color;
  if (!Object.keys(changes).length) return;
  await write(db.from('categories').update(changes).eq('id', id));
  Object.assign(cat, changes);
  saveCache();
}

export async function deleteCategory(id) {
  const used = data.events.filter(e => e.categoryId === id).length;
  if (used > 0) throw new Error(`Diese Kategorie hat noch ${used} Termin(e). Bitte erst verschieben oder löschen.`);
  if (data.categories.length <= 1) throw new Error('Mindestens eine Kategorie muss bleiben.');
  await write(db.from('categories').delete().eq('id', id));
  data.categories = data.categories.filter(c => c.id !== id);
  // Ansichten, die die Kategorie enthalten, aufräumen (nur die eigenen sind sichtbar).
  for (const v of data.views.filter(v => v.categoryIds.includes(id))) {
    v.categoryIds = v.categoryIds.filter(cid => cid !== id);
    await write(db.from('views').update({ category_ids: v.categoryIds }).eq('id', v.id));
  }
  saveCache();
  setPrefs({ hiddenCategoryIds: prefs.hiddenCategoryIds.filter(cid => cid !== id) });
}

// ---------- Gespeicherte Ansichten (gehören nur dem eigenen Konto) ----------
export const getViews = () => data.views;

export async function addView(name, categoryIds) {
  const view = { id: newId(), name: name.trim().slice(0, 30), categoryIds: [...categoryIds] };
  await write(db.from('views').insert({ id: view.id, name: view.name, category_ids: view.categoryIds }));
  data.views.push(view);
  saveCache();
}

export async function deleteView(id) {
  await write(db.from('views').delete().eq('id', id));
  data.views = data.views.filter(v => v.id !== id);
  saveCache();
}

// ---------- Alte, lokale Daten aus Version 1 übernehmen ----------

// Liefert die alten Daten, falls es welche gibt und noch nicht gefragt wurde.
export function legacyData() {
  if (prefs.legacyHandled) return null;
  const old = normalizeData(readJSON(LEGACY_KEY, null));
  return old.events.length || old.views.length ? old : null;
}

export const markLegacyHandled = () => setPrefs({ legacyHandled: true });

// Lädt die alten Daten hoch. Schon vorhandene Einträge (gleiche id) bleiben unverändert.
// Die alten Daten bleiben zur Sicherheit im Browser liegen.
export async function importLegacy(old) {
  const categoryIds = new Set(old.categories.map(c => c.id));
  const fallback = old.categories[0]?.id ?? data.categories[0]?.id;
  const events = old.events.map(e => ({ ...e, categoryId: categoryIds.has(e.categoryId) ? e.categoryId : fallback }));

  if (old.categories.length) {
    await write(db.from('categories').upsert(old.categories, { onConflict: 'id', ignoreDuplicates: true }));
  }
  if (events.length) {
    await write(db.from('events').upsert(events.map(toDbEvent), { onConflict: 'id', ignoreDuplicates: true }));
  }
  if (old.views.length) {
    await write(db.from('views').insert(old.views.map(v => ({ id: newId(), name: v.name, category_ids: v.categoryIds }))));
  }
  markLegacyHandled();
  await refresh();
}

// ---------- Geräte-Einstellungen ----------
export const getPrefs = () => prefs;

export function setPrefs(patch) {
  Object.assign(prefs, patch);
  writeJSON(PREFS_KEY, prefs);
}
