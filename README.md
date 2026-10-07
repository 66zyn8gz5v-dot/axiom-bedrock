# Axiom Bedrock

Ein Add-on für **Minecraft Bedrock Edition** (Konsole, Handy, PC), das die wichtigsten Bauwerkzeuge der Java-Mod
[Axiom](https://axiom.moulberry.com/) nachbildet: Auswahl-Werkzeuge, Formen, Modellieren, Malen, Terrain,
Zwischenablage mit Drehen/Spiegeln, Blaupausen, Rückgängig/Wiederherstellen, Symmetrie und vieles mehr.

Alles wird mit **Werkzeug-Items** und **Menüs** bedient, damit es auch mit dem **Controller** gut funktioniert.

> **Download:** [`dist/AxiomBedrock.mcaddon`](dist/AxiomBedrock.mcaddon) (enthält Verhaltens- und Ressourcenpaket)

---

## Installation

### Auf Handy oder PC (Windows)
1. `AxiomBedrock.mcaddon` herunterladen und öffnen → Minecraft importiert beide Pakete automatisch.
2. Neue Welt erstellen (oder bestehende bearbeiten):
   - **Kreativmodus** empfohlen
   - Unter **Verhaltenspakete** → „Axiom Bedrock (Verhalten)“ aktivieren (das Ressourcenpaket wird automatisch mit aktiviert)
   - **Experimente müssen NICHT eingeschaltet werden** – das Add-on nutzt nur stabile Schnittstellen.
3. Welt starten. Du bekommst automatisch das **Axiom-Menü**-Item.

### Auf Konsole (Xbox, PlayStation, Switch)
Konsolen erlauben keinen direkten Import von Add-on-Dateien. Der offizielle Weg ist ein **Realm**:

1. Auf einem **Handy/Tablet oder PC** mit Minecraft (gleiches Microsoft-Konto) das Add-on wie oben importieren
   und eine Welt mit aktiviertem Verhaltenspaket erstellen. Einmal kurz betreten.
2. In Minecraft: **Spielen → Realms → dein Realm bearbeiten (Stift) → Welt ersetzen** → die eben erstellte Welt wählen.
3. Auf der Konsole dem Realm beitreten – die Werkzeuge sind da.

Alternativen: Die Welt auf dem Handy/PC hosten und von der Konsole als Freund beitreten (benötigt ein zweites Konto),
oder einen eigenen Bedrock-Server mit dem Add-on betreiben.

---

## Schnellstart

1. **Axiom-Menü** benutzen → **Werkzeuge holen → Alle Werkzeuge**.
2. Mit der **Box-Auswahl** zweimal auf Blöcke zielen und benutzen → Bereich ist markiert (Partikel-Rahmen).
3. Mit einem Axiom-Werkzeug einen Block **schlagen** → dieser Block wird dein aktiver Block (Pipette).
4. **Axiom-Menü → Auswahl bearbeiten → Füllen**.
5. Fehler gemacht? **Rückgängig**-Werkzeug benutzen (Schleichen + Benutzen = Wiederherstellen).

### Steuerung (für alle Werkzeuge gleich)

| Aktion | Controller | Wirkung |
|---|---|---|
| **Benutzen** | linker Trigger (LT / L2 / ZL) | Hauptaktion des Werkzeugs – Pinsel-Werkzeuge: **gedrückt halten** |
| **Schleichen + Benutzen** | Stick drücken + LT | Einstellungen des Werkzeugs |
| **Schlagen** | rechter Trigger (RT / R2 / ZR) | Pipette (Block übernehmen) oder Zusatzaktion |

Werkzeuge haben eine **sehr große Reichweite** (Standard 160 Blöcke, einstellbar bis 512).
In der Aktionsleiste siehst du immer das aktuelle Werkzeug und seine Einstellungen.

---

## Werkzeuge

| Werkzeug | Was es macht |
|---|---|
| **Axiom-Menü** | Hauptmenü: Werkzeuge, Block/Muster, Maske, Auswahl, Zwischenablage, Verlauf, Fähigkeiten, Symmetrie, Ansichten, Welt, Hotbar-Sätze, Hilfe |
| **Box-Auswahl** | Ecke 1 und Ecke 2 setzen (Benutzen). Schlagen setzt Ecke 1 auf kurze Distanz. |
| **Magische Auswahl** | Wählt verbundene Blöcke automatisch: gleicher Blocktyp, sichtbare Oberfläche, oder alle festen Blöcke. |
| **Pinsel-Auswahl** | Freihand-Auswahl: mit dem Pinsel über Blöcke „malen“. |
| **Baumeister** | Fügt die Zwischenablage am Blickziel ein (mit Vorschau-Rahmen). Schlagen = 90° drehen. Einstellungen: Spiegeln, Luft mit einfügen, Kreaturen, Höhenversatz. |
| **Formen** | Kugel/Ellipsoid, Halbkugel, Quader, Zylinder, Kegel, Pyramide, Torus, Bogen, Prisma (Dach), Spirale (Wendelrampe, Steigung einstellbar) – massiv oder hohl, mittig oder auf dem Boden, auf Wunsch quer zur Blickrichtung gedreht. |
| **Modellieren** | Aufbauen, Abtragen, Glätten, Schmelzen/Erodieren, Auffüllen, Felsen, Aufrauen, Verzerren, Zerbrechen – optional mit unregelmäßigem Rand. |
| **Maler** | Oberfläche bemalen, nur Oberseite, alles ersetzen, Rauschen-Maler (2 Muster), Höhenverlauf, nach Neigung (flach Gras, steil Stein), Streuen (z.B. Gras & Blumen verteilen), Flutfüllung (See/Becken ab Blickziel füllen), Säubern (Pflanzen/Wasser weg). |
| **Terrain** | Gelände anheben, absenken, einebnen, glätten, Hügel, Terrassen – mit weichem Rand. Dazu Stempel für **Berg**, **Krater**, **Vulkan**, **Hochplateau**, **Insel** (mit Sandstrand), **Schlucht** (in Blickrichtung) und **Wasserfall** (auf eine Felswand zielen) – je ein Klick – sowie **Treppen an Stufenkanten** (setzt passende Treppen oder wahlweise Stufen-Platten vor 1-Block-Stufen). |
| **Extrudieren** | Zieht eine ganze Fläche verbundener Blöcke um eine Schicht heraus bzw. drückt sie hinein. |
| **Pfad** | Punkte setzen und als gerade Linie oder weiche Kurve bauen. Im Menü außerdem **Lasso** (Fläche innerhalb der Punkte auswählen) und **Fluss** (Flussbett mit Wasser entlang der Punkte, Breite/Tiefe/Bett-Block einstellbar). – rund (auch hohl als Röhre) oder flach als Straße/Rampe mit Unterbau bis zum Boden. |
| **Text** | Schreibt Text aus Blöcken – an eine Wand oder flach auf den Boden, in bis zu 8-facher Größe. Modus **Pixel-Art**: Zeilen aus Zeichen (z.B. `rr.rr/rrrrr`) plus Legende (`r=red_wool`) werden zu einem Block-Bild – mit fertigen Vorlagen (Herz, Creeper, Schwert, Smiley, Stern, Pfeil, Haus). |
| **Lineal** | Misst Abstände und Größen zwischen zwei Punkten. |
| **Blockzustand-Editor** | Ändert Zustände eines Blocks (Richtung, Achse, offen/zu, Stufe …). Schlagen = drehen. |
| **Bulldozer** | Baut Blöcke auf große Entfernung sofort ab (einzeln oder im Radius). |
| **Kreaturen** | Kreaturen, Rüstungsständer & Co. im Blick an-/abwählen (oder alle rund ums Blickziel bzw. in der Block-Auswahl) und dann verschieben, zum Blickziel setzen, zu dir holen, drehen, benennen, kopieren oder löschen. Schlagen = Auswahl leeren. |
| **Rückgängig** | Benutzen = Rückgängig, Schleichen + Benutzen = Wiederherstellen (40 Schritte pro Spieler). Im Menü „Verlauf“ kann man gezielt zu einem Schritt zurückspringen. |

### Auswahl bearbeiten (im Axiom-Menü)
Füllen · Ersetzen · Leeren · Hohlräume füllen · Verlauf (Muster 1 → 2) · Ausdünnen (Ruinen) · Wasser ablassen · Mit Wasser füllen · Wände · Umriss · Aushöhlen · Überziehen · Natürlich machen · Glätten ·
Kopieren · Ausschneiden · Stapeln · Array (Versatz + Drehung pro Kopie, z.B. Wendeltreppen) · Verschieben ·
Drehen (90/180/270°) · Spiegeln · Zwischenablage verstreuen (z.B. Baum-Blaupause als Wald) · Analysieren (Blöcke zählen) ·
Auswahl erweitern/verkleinern/verschieben · in 3D aufblasen/schrumpfen · auf Oberfläche begrenzen · per Koordinaten · Auswahl aufheben.

Auswahl-Modus (in den Auswahl-Werkzeugen): **Ersetzen**, **Hinzufügen (+)** oder **Entfernen (−)** – so lassen
sich Auswahlen wie bei Axiom kombinieren.

### Muster (aktiver Block)
- **Pipette:** mit einem Axiom-Werkzeug auf einen Block schlagen (übernimmt auch Zustände wie Holzachse).
- Aus dem Inventar wählen, **Hotbar-Blöcke als Mischung**, oder als Text: `3*stone, andesite, oak_log[pillar_axis=x]`.
- **Paletten:** Muster unter einem Namen speichern und später mit einem Klick wieder laden.

### Maske
Legt fest, welche Blöcke Werkzeuge verändern dürfen: alles, nur Luft/Pflanzen, nur feste Blöcke,
nur bestimmte Blöcke oder alles außer bestimmten Blöcken.

### Fähigkeiten
- **Reichweite** der Werkzeuge (8–512 Blöcke)
- **Weit platzieren:** normale Blöcke auf große Entfernung setzen
- **Engel-Platzierung:** Blöcke frei in die Luft setzen
- **Ersetzen-Modus:** angeklickten Block ersetzen statt daneben bauen
- **Nachtsicht**, **Durch Wände fliegen** (Zuschauer-Modus)
- **Nur Operatoren** dürfen Axiom benutzen (für Realms mit Freunden)

Auch mit Fähigkeiten gesetzte Blöcke lassen sich rückgängig machen.

### Symmetrie
Spiegelt alles, was Werkzeuge bauen – und auch normales Bauen und Abbauen – an einer X- und/oder Z-Achse.

### Zwischenablage & Blaupausen
Kopien bleiben auch nach einem Neustart der Welt erhalten. Blaupausen werden in der Welt gespeichert und können
von allen Spielern geladen werden. Die Blaupausen-Liste zeigt Größe, Ersteller und Datum; Blaupausen lassen sich
laden, umbenennen und löschen – und vorher als **Vorschau-Rahmen** am Blickziel anzeigen. Eine Auswahl kann auch
direkt als Blaupause gespeichert werden (ohne Umweg über Kopieren).

### Ansichten
Standpunkte mit Blickrichtung speichern und später per Menü wieder hinspringen (wie Axioms „Views“).

### Anmerkungen
Schwebende Bau-Notizen (farbiger Text), die alle Spieler sehen – z.B. „Hier kommt das Tor hin“. Im Axiom-Menü
setzen, bearbeiten, hinfliegen, versetzen oder löschen. Außerdem lassen sich farbige **Linien** speichern: mit dem
Lineal zwei Punkte messen, dann im Anmerkungen-Menü „Linie aus der letzten Lineal-Messung“ (sichtbar, solange man
ein Axiom-Werkzeug hält).

### Welt
Tageszeit, Wetter, Tageszyklus/Wetterwechsel, Mob-Spawning, Feuer, Mob-Griefing, Zufalls-Tick, Koordinaten.

### Hotbar-Sätze
Wie bei Axiom: bis zu 9 Hotbars speichern und mit einem Klick wechseln.

### Chat-Befehle (Handy/PC)
`/axiom:menu` · `/axiom:undo` · `/axiom:redo` · `/axiom:tools`

---

## Unterschiede zu Axiom (Java)

Bedrock erlaubt Add-ons keine eigenen 3D-Editor-Oberflächen, Tastenkürzel oder Kamera-Steuerung. Deshalb:
- Statt Editor-Fenster gibt es **Menüs** (Formulare) und **Werkzeug-Items**.
- Statt Vorschau-Hologrammen gibt es **Partikel-Rahmen** (Auswahl, Einfüge-Vorschau, Pfadpunkte, Symmetrieachse).
- Biome malen ist mit den stabilen Schnittstellen (noch) nicht möglich.
- Beim Einfügen mit Drehen **und** Spiegeln gleichzeitig kann es bei sehr großen Kopien (> 64 Blöcke) zu
  Versatz zwischen den Teilstücken kommen – bitte melden, falls das auftritt.

Die weitere Planung steht in [ROADMAP.md](ROADMAP.md).

---

## Für Entwickler

```bash
npm install          # Typdefinitionen + TypeScript
npm run check        # Typprüfung (JavaScript mit JSDoc, strict)
npm test             # Rundum-Test aller Werkzeuge gegen eine API-Attrappe (inkl. Rückgängig/Wiederherstellen)
pip install pillow
npm run build        # erzeugt Items, Texturen, Sprachdateien und dist/AxiomBedrock.mcaddon
```

Aufbau:
- `packs/AxiomBP/scripts/` – Skript-Code (`@minecraft/server` 2.4.0, `@minecraft/server-ui` 2.0.0, Minecraft ≥ 1.21.120)
  - `core/` – Auswahl, Muster/Maske, Bearbeitungs-Engine, Verlauf, Zwischenablage, Auswahl-Operationen
  - `tools/` – ein Modul pro Werkzeug
  - `ui/` – Menüs
- `packs/AxiomRP/` – Texturen, Partikel, Sprachdateien
- `tools/build.py`, `tools/icons.py` – Generator (Icons als Pixel-Art im Code)
- `tests/` – Test-Attrappe von `@minecraft/server` und Testlauf
