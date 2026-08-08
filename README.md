# Menuiserie Delley — Offerten, Auftragsbestätigungen & Rechnungen

Lokale App zur Verwaltung von Kunden, Artikeln, Dienstleistungen sowie Offerten, die sich in Auftragsbestätigungen und danach in Rechnungen umwandeln lassen. Alle Daten bleiben lokal in deinem Browser gespeichert — es wird keine Internetverbindung benötigt (ausser für den ersten Aufruf, falls du die Schriftart/Icons nachlädst, was hier nicht der Fall ist).

## Starten

**Einfachste Variante:** Doppelklick auf **„App starten.command“** in diesem Ordner. Es öffnet sich ein Terminal-Fenster (das während der Arbeit offen bleiben muss) und danach automatisch der Browser.

Beim allerersten Start auf einem neuen Mac blockiert macOS Gatekeeper die Datei evtl. kurz („nicht verifizierter Entwickler“) — dann **rechtsklicken → Öffnen** statt Doppelklick, einmalig bestätigen. Danach funktioniert der normale Doppelklick.

**Alternative über Terminal:**
1. Terminal öffnen und in diesen Ordner wechseln:
   ```
   cd "/Pfad/zu/menuiserie-delley"
   python3 server.py
   ```
2. Im Browser öffnen: **http://localhost:5173**
3. Zum Beenden im Terminal `Ctrl + C` drücken.

Tipp: Lege dir ein Lesezeichen auf `http://localhost:5173` an. Verwende immer denselben Browser (z. B. Chrome), da die Daten browserspezifisch lokal gespeichert werden.

## Mehrere Rechner (z. B. zusätzlich auf einem iMac)

Jede Installation dieser App speichert ihre Daten **unabhängig und lokal** im jeweiligen Browser. Kopierst du den ganzen Ordner auf einen zweiten Mac, startet dort eine **komplett separate, leere** Datenbank — Kunden/Offerten/Termine werden NICHT automatisch zwischen den Rechnern abgeglichen.

Um Daten von einem Rechner auf den anderen zu übertragen:
1. Auf dem Quell-Rechner: **Einstellungen → Datensicherung → „Backup herunterladen“**
2. Die heruntergeladene `.json`-Datei per AirDrop/USB-Stick auf den Ziel-Rechner übertragen
3. Dort: **Einstellungen → Datensicherung → „Backup wiederherstellen“** → Datei auswählen

Das überschreibt beim Zielrechner alle dort vorhandenen Daten mit dem Stand des Backups — mach das also nur, wenn du bewusst einen Rechner auf den Stand des anderen bringen willst. Für Notizen & AVOR gibt es zusätzlich einen separaten, **zusammenführenden** Export/Import (auf der Seite „Notizen & AVOR“), der bestehende Daten nicht überschreibt, sondern ergänzt.

## Wichtig: Datensicherung

Die Daten liegen ausschliesslich im lokalen Speicher deines Browsers. Erstelle regelmässig ein Backup:
**Einstellungen → Datensicherung → „Backup herunterladen“**. Die Datei kann jederzeit über „Backup wiederherstellen“ wieder eingespielt werden (z. B. nach einem Browser-Reset oder auf einem neuen Rechner).

## Funktionen

- **Kunden, Artikel, Dienstleistungen** verwalten und in Offerten direkt auswählen
- **Offerte → Auftragsbestätigung → Rechnung**: Eine Dokumentnummer (z. B. 2026-1501) läuft durch den ganzen Ablauf, genau wie bisher in der Excel-Datei
- **PDF-Export** im Corporate-Design mit Logo
- **E-Mail-Versand**: Button lädt das PDF herunter und öffnet eine neue Mail in Outlook (Anhang bitte per Drag & Drop hinzufügen — Browser können das aus Sicherheitsgründen nicht automatisch)
- **Schweizer QR-Rechnung**: Jede Rechnung erhält automatisch einen Einzahlungsschein mit Swiss-QR-Code, korrektem Betrag und Referenz als letzte PDF-Seite
- **Zweisprachig (DE/FR)**: Umschalter unten links in der Seitenleiste stellt die ganze App um. Jede Offerte/Auftragsbestätigung/Rechnung merkt sich zusätzlich ihre eigene Sprache (im Feld „Langue du document“ / „Dokumentsprache“ bei den Details), sodass du z. B. eine französische Offerte erstellen und die App danach wieder auf Deutsch zurückstellen kannst, ohne dass sich das Dokument ändert
- **Einstellungen**: Firmendaten, MwSt-Satz, Zahlungsfrist, Textbausteine, Nummerierung frei anpassbar (die editierbaren Textbausteine gelten für die deutsche Version; die französischen Standardtexte sind fest hinterlegt)

## Hinweis zur QR-Rechnung

Die generierte QR-Rechnung wurde nach den offiziellen Swiss-Implementation-Guidelines aufgebaut und mit deiner bisherigen Vorlage abgeglichen. Bitte einmalig eine Testrechnung bei deiner Bank / PostFinance E-Banking scannen, um die automatische Erkennung zu bestätigen, bevor du sie produktiv einsetzt.
