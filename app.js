// app.js – verbindet Daten (store.js), Datumslogik (calendar.js) und die Oberfläche.
// Prinzip: Nach jeder Änderung rufen wir render() auf und zeichnen die Ansicht neu.
// Das ist einfacher als einzelne Elemente zu aktualisieren und für einen Kalender schnell genug.

import * as store from './store.js';
import * as cal from './calendar.js';
import { HOLIDAY_COLOR, holidaysInRange } from './holidays.js';

const HOUR_PX = 48;
const WEEK_START_HOUR = 7; // Wochenansicht zeigt oben zuerst 7 Uhr
const FALLBACK_COLOR = '#8e8e93';
document.documentElement.style.setProperty('--hour', `${HOUR_PX}px`);

const todayISO = () => cal.toISODate(new Date());

// Zustand der Oberfläche: was gerade angezeigt wird (wird nicht gespeichert, außer "mode").
const ui = {
  mode: store.getPrefs().mode,  // 'month' oder 'week'
  cursor: new Date(),           // welcher Monat / welche Woche sichtbar ist
  selected: todayISO(),         // ausgewählter Tag
  weekScrollTop: WEEK_START_HOUR * HOUR_PX,
};
let editingId = null; // id des Termins im Formular, null = neuer Termin

const $ = selector => document.querySelector(selector);
const els = {
  title: $('#title'),
  calendar: $('#calendar'),
  filterBar: $('#filter-bar'),
  eventDialog: $('#event-dialog'),
  eventForm: $('#event-form'),
  eventDialogTitle: $('#event-dialog-title'),
  eventError: $('#event-error'),
  seriesHint: $('#series-hint'),
  deleteBtn: $('#btn-delete'),
  settingsDialog: $('#settings-dialog'),
  categoryList: $('#category-list'),
  viewList: $('#view-list'),
};
const F = els.eventForm.elements; // Zugriff auf Formularfelder per name, z. B. F.date

// Kleiner Helfer, um HTML-Elemente zu bauen.
// Wichtig: Text wird als Text eingefügt, nie als HTML. So kann ein Termintitel wie
// "<script>…" keinen Schaden anrichten (Stichwort XSS).
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'color') node.style.setProperty('--c', value);
    else if (key === 'style') node.style.cssText += `;${value}`;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  node.append(...children.flat().filter(c => c != null && c !== false));
  return node;
}

// ---------- Kategorien, Filter, Feiertage ----------
const categoryById = id => store.getCategories().find(c => c.id === id);
const hiddenIds = () => new Set(store.getPrefs().hiddenCategoryIds);
const visibleCategoryIds = () => store.getCategories().map(c => c.id).filter(id => !hiddenIds().has(id));
const colorOf = o => (o.holiday ? HOLIDAY_COLOR : categoryById(o.categoryId)?.color ?? FALLBACK_COLOR);
const isWeekend = date => date.getDay() === 0 || date.getDay() === 6;

function visibleEvents() {
  const hidden = hiddenIds();
  return store.getEvents().filter(e => !hidden.has(e.categoryId));
}

// Alle sichtbaren Termine im Zeitraum, plus Feiertage. Feiertage kommen immer dazu,
// egal welcher Filter aktiv ist, und stehen an ihrem Tag ganz oben.
function occurrencesBetween(from, to) {
  const holidays = holidaysInRange(from, to).map(h => ({
    id: `holiday-${h.date}`, title: h.name, allDay: true, holiday: true, occurrenceDate: h.date,
  }));
  return [...holidays, ...cal.occurrences(visibleEvents(), from, to)];
}

function showOnly(categoryIds) {
  const keep = new Set(categoryIds);
  store.setPrefs({ hiddenCategoryIds: store.getCategories().map(c => c.id).filter(id => !keep.has(id)) });
  render();
}

function toggleCategory(id) {
  const hidden = hiddenIds();
  hidden.has(id) ? hidden.delete(id) : hidden.add(id);
  store.setPrefs({ hiddenCategoryIds: [...hidden] });
  render();
}

const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));

// Oben stehen nur "Alle" und die gespeicherten Ansichten.
// Einzelne Kategorien schaltet man in den Einstellungen.
function renderFilterBar() {
  const visible = visibleCategoryIds();
  const categories = store.getCategories();
  const allVisible = visible.length === categories.length;
  const existing = new Set(categories.map(c => c.id));
  const views = store.getViews();

  // Ohne Ansichten und ohne Filter wäre die Leiste nutzlos – dann ausblenden.
  els.filterBar.hidden = views.length === 0 && allVisible;

  // replaceChildren nimmt keine Listen, deshalb mit .flat() zu einer Ebene "plattdrücken".
  els.filterBar.replaceChildren(...[
    el('button', { class: `chip${allVisible ? ' active' : ''}`, onclick: () => showOnly(existing) }, 'Alle'),
    views.map(view => {
      const ids = view.categoryIds.filter(id => existing.has(id));
      return el('button', {
        class: `chip${!allVisible && sameSet(ids, visible) ? ' active' : ''}`,
        onclick: () => showOnly(ids),
      }, `★ ${view.name}`);
    }),
  ].flat());
}

// ---------- Monatsansicht ----------
function groupByDay(occurrences) {
  const map = new Map();
  for (const o of occurrences) {
    if (!map.has(o.occurrenceDate)) map.set(o.occurrenceDate, []);
    map.get(o.occurrenceDate).push(o);
  }
  return map;
}

function renderMonth() {
  const year = ui.cursor.getFullYear();
  const month = ui.cursor.getMonth();
  const days = cal.monthGrid(year, month);
  const byDay = groupByDay(occurrencesBetween(cal.toISODate(days[0]), cal.toISODate(days[41])));
  const today = todayISO();
  const MAX_PILLS = 3;

  const grid = el('div', { class: 'month-grid' },
    cal.WEEKDAYS_SHORT.map((name, i) => el('div', { class: `weekday${i >= 5 ? ' weekend' : ''}` }, name)),
    days.map(d => {
      const iso = cal.toISODate(d);
      const list = byDay.get(iso) ?? [];
      const classes = ['day',
        d.getMonth() !== month && 'other',
        isWeekend(d) && 'weekend',
        list.some(o => o.holiday) && 'holiday',
        iso === today && 'today',
        iso === ui.selected && 'selected'].filter(Boolean).join(' ');
      return el('button', { class: classes, onclick: () => { ui.selected = iso; render(); } },
        el('span', { class: 'num' }, d.getDate()),
        list.slice(0, MAX_PILLS).map(o => el('div', {
          class: `pill${o.allDay ? ' allday' : ''}`,
          color: colorOf(o),
        }, o.title)),
        list.length > MAX_PILLS && el('div', { class: 'more' }, `+${list.length - MAX_PILLS}`),
      );
    }),
  );

  // Scrollposition merken, damit das Neuzeichnen (z. B. jede Minute) nicht springt.
  const scrollTop = els.calendar.scrollTop;
  els.calendar.replaceChildren(grid, renderDayList(ui.selected));
  els.calendar.scrollTop = scrollTop;
}

function timeLabel(o) {
  return o.allDay ? 'ganztägig' : `${o.start} – ${o.end}`;
}

function renderDayList(iso) {
  const list = occurrencesBetween(iso, iso);
  return el('section', { class: 'day-list' },
    el('h2', {}, cal.formatLongDate(iso)),
    list.length === 0
      ? el('p', { class: 'empty' }, 'Keine Termine. Tippe auf +, um einen anzulegen.')
      : list.map(o => {
        if (o.holiday) {
          // Feiertage lassen sich nicht bearbeiten, deshalb kein Button.
          return el('div', { class: 'event-row', color: HOLIDAY_COLOR },
            el('span', { class: 'bar' }),
            el('span', { class: 'info' }, el('div', { class: 'name' }, o.title), el('div', { class: 'meta' }, 'Feiertag')));
        }
        const category = categoryById(o.categoryId);
        return el('button', { class: 'event-row', color: colorOf(o), onclick: () => openEventForm(o) },
          el('span', { class: 'bar' }),
          el('span', { class: 'info' },
            el('div', { class: 'name' }, o.title),
            el('div', { class: 'meta' },
              [timeLabel(o), category?.name, o.repeatUntil && '↻ wöchentlich'].filter(Boolean).join(' · ')),
          ),
        );
      }),
  );
}

// ---------- Wochenansicht ----------
function renderWeek() {
  const days = cal.weekDays(ui.cursor);
  const isoDays = days.map(cal.toISODate);
  const byDay = groupByDay(occurrencesBetween(isoDays[0], isoDays[6]));
  const today = todayISO();

  const head = el('div', { class: 'week-head' },
    el('div', { class: 'kw' }, 'KW', el('span', { class: 'date' }, cal.isoWeek(days[0]))),
    days.map((d, i) => el('div', { class: isoDays[i] === today ? 'today' : null },
      cal.WEEKDAYS_SHORT[i], el('span', { class: 'date' }, d.getDate()))),
  );

  const allDay = el('div', { class: 'week-allday' },
    el('div', { class: 'label' }, 'ganzt.'),
    isoDays.map(iso => el('div', { class: 'cell' },
      (byDay.get(iso) ?? []).filter(o => o.allDay).map(o => el(o.holiday ? 'div' : 'button', {
        class: 'pill allday',
        color: colorOf(o),
        onclick: o.holiday ? null : () => openEventForm(o),
      }, o.title)))),
  );

  const hours = el('div', { class: 'hours' },
    Array.from({ length: 23 }, (_, i) => el('span', { style: `top:${(i + 1) * HOUR_PX}px` }, `${i + 1}:00`)));

  const columns = isoDays.map((iso, dayIndex) => {
    const timed = (byDay.get(iso) ?? [])
      .filter(o => !o.allDay)
      .map(o => ({ ...o, startMin: cal.timeToMinutes(o.start), endMin: cal.timeToMinutes(o.end) }));

    const classes = ['week-col', isWeekend(days[dayIndex]) && 'weekend', iso === today && 'today'].filter(Boolean).join(' ');
    const col = el('div', { class: classes },
      cal.layoutOverlaps(timed).map(o => {
        const top = (o.startMin / 60) * HOUR_PX;
        const height = Math.max(((o.endMin - o.startMin) / 60) * HOUR_PX - 2, 18);
        const width = 100 / o.lanes;
        return el('button', {
          class: 'week-event',
          color: colorOf(o),
          style: `top:${top}px;height:${height}px;left:calc(${o.lane * width}% + 1px);width:calc(${width}% - 2px)`,
          onclick: () => openEventForm(o),
        }, el('div', { class: 't' }, o.title), height > 30 && el('div', { class: 'time' }, o.start));
      }),
    );

    // Tippen auf eine leere Stelle legt dort einen Termin an.
    col.addEventListener('click', event => {
      if (event.target !== col) return;
      const y = event.clientY - col.getBoundingClientRect().top;
      const hour = Math.min(23, Math.floor(y / HOUR_PX));
      openEventForm(null, { date: iso, start: cal.minutesToTime(hour * 60) });
    });

    if (iso === today) {
      const now = new Date();
      col.append(el('div', { class: 'now-line', style: `top:${((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_PX}px` }));
    }
    return col;
  });

  const scroll = el('div', { class: 'week-scroll' }, el('div', { class: 'week-body' }, hours, columns));
  scroll.addEventListener('scroll', () => { ui.weekScrollTop = scroll.scrollTop; });

  els.calendar.replaceChildren(el('div', { class: 'week' }, head, allDay, scroll));
  scroll.scrollTop = ui.weekScrollTop; // Scrollposition beim Neuzeichnen behalten
}

// ---------- Alles zeichnen ----------
function render() {
  const isWeek = ui.mode === 'week';
  els.title.textContent = isWeek ? cal.formatWeekTitle(cal.weekDays(ui.cursor)) : cal.formatMonthTitle(ui.cursor);
  document.querySelectorAll('.segmented button').forEach(b => b.classList.toggle('active', b.dataset.mode === ui.mode));
  els.calendar.classList.toggle('is-week', isWeek);
  renderFilterBar();
  isWeek ? renderWeek() : renderMonth();
}

// ---------- Navigation ----------
function move(step) {
  if (ui.mode === 'week') {
    ui.cursor = cal.addDays(ui.cursor, step * 7);
    ui.selected = cal.toISODate(ui.cursor);
  } else {
    ui.cursor = new Date(ui.cursor.getFullYear(), ui.cursor.getMonth() + step, 1);
    const now = new Date();
    const isCurrentMonth = now.getFullYear() === ui.cursor.getFullYear() && now.getMonth() === ui.cursor.getMonth();
    ui.selected = isCurrentMonth ? todayISO() : cal.toISODate(ui.cursor);
    els.calendar.scrollTop = 0;
  }
  render();
}

$('#btn-prev').addEventListener('click', () => move(-1));
$('#btn-next').addEventListener('click', () => move(1));
$('#btn-today').addEventListener('click', () => {
  ui.cursor = new Date();
  ui.selected = todayISO();
  ui.weekScrollTop = WEEK_START_HOUR * HOUR_PX;
  render();
});

document.querySelectorAll('.segmented button').forEach(button => {
  button.addEventListener('click', () => {
    if (ui.mode === button.dataset.mode) return;
    ui.mode = button.dataset.mode;
    ui.cursor = cal.parseISODate(ui.selected); // zeige den Monat/die Woche des gewählten Tags
    if (ui.mode === 'week') ui.weekScrollTop = WEEK_START_HOUR * HOUR_PX; // immer bei 7 Uhr beginnen
    store.setPrefs({ mode: ui.mode });
    render();
  });
});

// Wischen nach links/rechts blättert (fühlt sich auf dem iPhone natürlich an).
let touchStart = null;
els.calendar.addEventListener('touchstart', e => {
  touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
}, { passive: true });
els.calendar.addEventListener('touchend', e => {
  if (!touchStart) return;
  const dx = e.changedTouches[0].clientX - touchStart.x;
  const dy = e.changedTouches[0].clientY - touchStart.y;
  touchStart = null;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) move(dx < 0 ? 1 : -1);
});

// ---------- Termin-Formular ----------
function updateFormVisibility() {
  els.eventForm.querySelector('.time-fields').hidden = F.allDay.checked;
  els.eventForm.querySelector('.repeat-until').hidden = !F.repeatWeekly.checked;
}

function fillCategorySelect(selectedId) {
  const categories = store.getCategories();
  F.categoryId.replaceChildren(...categories.map(c => el('option', { value: c.id }, c.name)));
  // Falls die Kategorie nicht (mehr) existiert, die erste nehmen.
  F.categoryId.value = categories.some(c => c.id === selectedId) ? selectedId : categories[0].id;
}

// event = vorhandener Termin (auch ein Vorkommen einer Serie) oder null für "neu".
function openEventForm(event, defaults = {}) {
  els.eventForm.reset();
  els.eventError.textContent = '';

  // Bei Serien bearbeiten wir das gespeicherte Original, nicht das einzelne Vorkommen.
  const original = event && store.getEvents().find(e => e.id === event.id);

  if (original) {
    editingId = original.id;
    els.eventDialogTitle.textContent = 'Termin bearbeiten';
    F.title.value = original.title;
    fillCategorySelect(original.categoryId);
    F.date.value = original.date;
    F.allDay.checked = original.allDay;
    F.start.value = original.start ?? '09:00';
    F.end.value = original.end ?? '10:00';
    F.repeatWeekly.checked = Boolean(original.repeatUntil);
    F.repeatUntil.value = original.repeatUntil ?? '';
    F.note.value = original.note ?? '';
  } else {
    editingId = null;
    els.eventDialogTitle.textContent = 'Neuer Termin';
    // Vorauswahl: erste sichtbare Kategorie, damit der neue Termin auch zu sehen ist.
    fillCategorySelect(visibleCategoryIds()[0]);
    F.date.value = defaults.date ?? ui.selected;
    F.start.value = defaults.start ?? '09:00';
    F.end.value = cal.minutesToTime(cal.timeToMinutes(F.start.value) + 60);
  }

  els.seriesHint.hidden = !original?.repeatUntil;
  els.deleteBtn.hidden = !original;
  updateFormVisibility();
  // showModal() setzt den Fokus auf die Überschrift (autofocus im HTML),
  // nicht auf ein Textfeld – so bleibt die Tastatur zu, bis man ein Feld antippt.
  els.eventDialog.showModal();
  els.eventDialog.scrollTop = 0;
}

F.allDay.addEventListener('change', updateFormVisibility);
F.repeatWeekly.addEventListener('change', () => {
  // Sinnvoller Standard: Serie läuft ca. ein Semester (15 Wochen).
  if (F.repeatWeekly.checked && !F.repeatUntil.value && F.date.value) {
    F.repeatUntil.value = cal.toISODate(cal.addDays(cal.parseISODate(F.date.value), 7 * 15));
  }
  updateFormVisibility();
});
// Wenn der Beginn hinter das Ende rutscht, Ende automatisch eine Stunde später setzen.
F.start.addEventListener('change', () => {
  if (F.start.value && F.end.value <= F.start.value) {
    F.end.value = cal.minutesToTime(cal.timeToMinutes(F.start.value) + 60);
  }
});

function validate(ev) {
  if (!ev.title) return 'Bitte einen Titel eingeben.';
  if (!ev.date) return 'Bitte ein Datum wählen.';
  if (!ev.allDay) {
    if (!ev.start || !ev.end) return 'Bitte Beginn und Ende angeben.';
    if (ev.end <= ev.start) return 'Das Ende muss nach dem Beginn liegen.';
  }
  if (F.repeatWeekly.checked) {
    if (!ev.repeatUntil) return 'Bitte angeben, bis wann wiederholt wird.';
    if (ev.repeatUntil < ev.date) return 'Das Wiederholungsende liegt vor dem Datum.';
  }
  return null;
}

els.eventForm.addEventListener('submit', e => {
  e.preventDefault(); // sonst würde der Browser die Seite neu laden
  const allDay = F.allDay.checked;
  const ev = {
    id: editingId ?? store.newId(),
    title: F.title.value.trim(),
    categoryId: F.categoryId.value,
    date: F.date.value,
    allDay,
    start: allDay ? null : F.start.value,
    end: allDay ? null : F.end.value,
    repeatUntil: F.repeatWeekly.checked ? F.repeatUntil.value : null,
    note: F.note.value.trim(),
  };

  const error = validate(ev);
  if (error) {
    els.eventError.textContent = error;
    return;
  }

  store.saveEvent(ev);
  els.eventDialog.close();
  // Zum Termin springen, damit man sieht, dass er gespeichert wurde.
  if (editingId === null) {
    ui.selected = ev.date;
    ui.cursor = cal.parseISODate(ev.date);
  }
  render();
});

els.deleteBtn.addEventListener('click', () => {
  const ev = store.getEvents().find(e => e.id === editingId);
  if (!ev) return;
  const series = ev.repeatUntil ? '\nDas löscht alle Wiederholungen.' : '';
  if (!confirm(`„${ev.title}" löschen?${series}`)) return;
  store.deleteEvent(ev.id);
  els.eventDialog.close();
  render();
});

$('#btn-add').addEventListener('click', () => openEventForm(null));

// ---------- Einstellungen: Kategorien & Ansichten ----------
function renderSettings() {
  const visible = visibleCategoryIds();
  els.categoryList.replaceChildren(
    ...store.getCategories().map(c => el('li', {},
      el('input', {
        type: 'color', value: c.color, 'aria-label': `Farbe von ${c.name}`,
        onchange: e => { store.updateCategory(c.id, { color: e.target.value }); render(); },
      }),
      el('input', {
        value: c.name, maxlength: 30, 'aria-label': 'Name',
        onchange: e => { store.updateCategory(c.id, { name: e.target.value }); renderSettings(); render(); },
      }),
      // Schalter: Kategorie im Kalender anzeigen oder ausblenden.
      el('input', {
        type: 'checkbox', class: 'switch', checked: visible.includes(c.id),
        'aria-label': `${c.name} anzeigen`,
        onchange: () => toggleCategory(c.id),
      }),
      el('button', {
        class: 'small-danger', 'aria-label': `${c.name} löschen`,
        onclick: () => {
          if (!confirm(`Kategorie „${c.name}" löschen?`)) return;
          const result = store.deleteCategory(c.id);
          if (!result.ok) alert(result.message);
          renderSettings();
          render();
        },
      }, '✕'),
    )),
    // Feiertage: feste Zeile, nicht bearbeitbar und nicht ausblendbar.
    el('li', { class: 'fixed', color: HOLIDAY_COLOR },
      el('span', { class: 'swatch' }),
      el('span', { class: 'name' }, 'Feiertage (Bayern)'),
      el('span', { class: 'meta' }, 'immer sichtbar'),
    ),
  );

  els.viewList.replaceChildren(...store.getViews().map(v => el('li', {},
    el('span', { class: 'name' }, `★ ${v.name}`),
    el('span', { class: 'meta' }, v.categoryIds.map(id => categoryById(id)?.name).filter(Boolean).join(', ') || '–'),
    el('button', {
      class: 'small-danger', 'aria-label': `Ansicht ${v.name} löschen`,
      onclick: () => { store.deleteView(v.id); renderSettings(); render(); },
    }, '✕'),
  )));
}

$('#btn-settings').addEventListener('click', () => {
  renderSettings();
  els.settingsDialog.showModal();
  els.settingsDialog.scrollTop = 0;
});

$('#category-add').addEventListener('submit', e => {
  e.preventDefault();
  const form = e.target;
  if (!form.elements.name.value.trim()) return;
  store.addCategory(form.elements.name.value, form.elements.color.value);
  form.elements.name.value = '';
  renderSettings();
  render();
});

$('#view-add').addEventListener('submit', e => {
  e.preventDefault();
  const form = e.target;
  const visible = visibleCategoryIds();
  if (!form.elements.name.value.trim()) return;
  if (visible.length === 0) return alert('Schalte zuerst mindestens eine Kategorie ein.');
  store.addView(form.elements.name.value, visible);
  form.elements.name.value = '';
  renderSettings();
  render();
});

// Dialoge schließen per "Abbrechen"/"Fertig".
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dialog.close()));
}

// ---------- Start ----------
render();

// Jede Minute neu zeichnen (rote "Jetzt"-Linie, Tageswechsel) – aber nicht, während ein Dialog offen ist.
setInterval(() => {
  if (!document.querySelector('dialog[open]')) render();
}, 60_000);

// Service Worker registrieren: macht die App offline-fähig (siehe sw.js).
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(err => console.warn('Service Worker:', err));
}
