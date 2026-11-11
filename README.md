# Unser Kalender – Version 1

Kalender-Web-App (PWA) ohne Framework. Termine liegen in Supabase und werden zwischen zwei Konten geteilt.
Einrichtung: siehe [SUPABASE.md](SUPABASE.md).

## Dateien

| Datei | Aufgabe |
|---|---|
| `index.html` | Grundgerüst, Formulare, iPhone-Meta-Tags |
| `styles.css` | Design (Handy zuerst, Hell/Dunkel automatisch) |
| `store.js` | **Einziger** Ort für das Speichern: Supabase plus Kopie im Browser für offline |
| `config.js` | Supabase-Adresse und öffentlicher anon-Schlüssel |
| `supabase/schema.sql` | Tabellen und Zugriffsregeln, einmal im Supabase SQL Editor ausführen |
| `calendar.js` | Datumslogik: Raster, Wiederholungen, Überlappungen, Kalenderwoche |
| `holidays.js` | Feiertage in Bayern (berechnet, nicht ausblendbar) |
| `app.js` | Oberfläche: Zeichnen, Klicks, Formulare |
| `sw.js` + `manifest.webmanifest` + `icons/` | PWA: Homescreen-Icon und Offline-Start |
| `tools/serve.ps1` | Mini-Webserver zum Testen am PC |
| `tools/make-icons.ps1` | Erzeugt die Icons neu |

## Am PC starten

```powershell
powershell -ExecutionPolicy Bypass -File tools\serve.ps1
```

Danach http://localhost:8080 öffnen. Ein Doppelklick auf `index.html` reicht nicht,
weil ES-Module und Service Worker eine echte http-Adresse brauchen.

## Aufs iPhone bringen

Für den Homescreen braucht die App eine HTTPS-Adresse. Am einfachsten geht das mit GitHub Pages:

1. Neues GitHub-Repository anlegen und alle Dateien hochladen.
2. Unter *Settings → Pages* als Quelle den `main`-Branch wählen.
3. Die Adresse (`https://<name>.github.io/<repo>/`) in **Safari** öffnen.
4. Auf *Teilen → Zum Home-Bildschirm* tippen.

## Gut zu wissen

- Die Daten liegen in Supabase. Auf dem Gerät liegt nur eine Kopie zum Offline-Ansehen.
- Offline kann man nur ansehen, nicht ändern.
- Nach Code-Änderungen in `sw.js` die Versionsnummer `CACHE` erhöhen.
