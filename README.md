# Unser Kalender – Version 1

Kalender-Web-App (PWA) ohne Framework. Termine liegen vorerst nur lokal im Browser.

## Dateien

| Datei | Aufgabe |
|---|---|
| `index.html` | Grundgerüst, Formulare, iPhone-Meta-Tags |
| `styles.css` | Design (Handy zuerst, Hell/Dunkel automatisch) |
| `store.js` | **Einziger** Ort für das Speichern (heute `localStorage`, später Supabase) |
| `calendar.js` | Datumslogik: Raster, Wiederholungen, Überlappungen |
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

- Die Daten liegen nur auf dem jeweiligen Gerät. Löscht man die Website-Daten in Safari, sind sie weg.
- Nach Code-Änderungen in `sw.js` die Versionsnummer `CACHE` erhöhen.
