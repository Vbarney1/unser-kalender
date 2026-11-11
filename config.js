// config.js – Zugangsdaten für Supabase. Siehe SUPABASE.md, Schritt 6.
// URL: Project Settings → Data API. Schlüssel: Project Settings → API Keys → "Publishable key".
//
// Der Publishable key (sb_publishable_…) darf öffentlich sein: Er erlaubt ohne Anmeldung
// nichts, weil die Datenbank jede Tabelle mit Zugriffsregeln (RLS) schützt.
// Den Secret key (sb_secret_…) dagegen NIE hier eintragen!

export const SUPABASE_URL = 'https://qjvpklzxgchwzmlvokxx.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_qZuX-AE2jLiVsF9B2-NBuw_sLRIeg6u';
