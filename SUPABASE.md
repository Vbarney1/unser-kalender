# Supabase einrichten

Einmalig, dauert etwa 15 Minuten. Supabase ist im kostenlosen Plan völlig ausreichend.

## 1. Konto und Projekt anlegen

1. Auf [supabase.com](https://supabase.com) auf **Start your project** und ein Konto anlegen (geht auch mit GitHub).
2. **New project** anlegen:
   - Name: `unser-kalender`
   - Database Password: ein langes Passwort ausdenken und im Passwort-Manager speichern (brauchst du für die App nicht, nur für Notfälle).
   - Region: **Central EU (Frankfurt)**
3. Ein, zwei Minuten warten, bis das Projekt fertig ist.

## 2. Tabellen anlegen

1. Links **SQL Editor** öffnen.
2. Den kompletten Inhalt von [`supabase/schema.sql`](supabase/schema.sql) hineinkopieren.
3. **Run** klicken. Unten sollte „Success. No rows returned“ stehen.

## 3. Fremde Anmeldungen abschalten

Links **Authentication**, dann **Sign In / Providers**:

- **Allow new users to sign up** ausschalten und speichern.
- **Email** muss als Anbieter eingeschaltet bleiben.

Damit kann sich niemand selbst ein Konto anlegen. Nur ihr zwei bekommt eins.

## 4. Eure zwei Konten anlegen

**Authentication → Users → Add user → Create new user**, für jede Person einmal:

- E-Mail und Passwort eintragen
- **Auto Confirm User** anhaken

## 5. Die zwei Konten freischalten

Wieder im **SQL Editor** (neue Abfrage), E-Mail-Adressen anpassen und **Run**:

```sql
insert into public.members (user_id)
select id from auth.users
where email in ('deine@mail.de', 'partner@mail.de')
on conflict do nothing;
```

Ohne diesen Schritt sieht ein Konto nach dem Anmelden nichts. Die App sagt dann „Dein Konto ist noch nicht freigeschaltet“.

## 6. Zugangsdaten in die App eintragen

- **Project URL:** unter **Project Settings → Data API** (sieht aus wie `https://abcdefgh.supabase.co`)
- **Publishable key:** unter **Project Settings → API Keys**, beginnt mit `sb_publishable_…`. Mit dem Kopier-Knopf daneben kopieren, weil er in der Anzeige abgeschnitten ist.

Beide in [`config.js`](config.js) eintragen.

> **Wichtig:** Nur den **Publishable key** verwenden. Der **Secret key** (`sb_secret_…`) darf nie in die App, weil er alle Zugriffsregeln umgeht.

## 7. Ausprobieren

```powershell
powershell -ExecutionPolicy Bypass -File tools\serve.ps1
```

http://localhost:8080 öffnen und anmelden. Wer vorher schon Termine in der alten Version hatte, wird einmal gefragt, ob sie in den gemeinsamen Kalender übernommen werden sollen.

## So funktioniert es

- **Termine und Kategorien** teilt ihr beide. Ändert einer etwas, sieht es der andere sofort.
- **Gespeicherte Ansichten** und welche Kategorien ein- oder ausgeblendet sind, gehören jedem selbst.
- **Ohne Internet** zeigt die App die zuletzt geladenen Termine. Ändern geht dann nicht (gelbe Leiste oben).
- **Sicherheit:** Jede Tabelle ist mit Row Level Security geschützt. Lesen und schreiben darf nur, wer angemeldet ist und in `members` steht.
