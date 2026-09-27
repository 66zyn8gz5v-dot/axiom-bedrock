# Roadmap

Plan für die nächsten Ausbaustufen. Jeder Abend (23 Uhr) nimmt sich die obersten offenen Punkte vor,
setzt sie um, testet (`npm run check`, `npm test`), baut (`npm run build`) und hakt sie hier ab.
Neue Ideen unten anhängen.

## Erledigt (v0.1.0)
- [x] Werkzeug-Items mit eigenen Icons, Aktionsleisten-Anzeige, Pipette
- [x] Box-, Magische und Pinsel-Auswahl mit Ersetzen/Hinzufügen/Entfernen
- [x] Auswahl-Operationen: Füllen, Ersetzen, Leeren, Wände, Umriss, Aushöhlen, Überziehen, Natürlich, Glätten,
      Stapeln, Verschieben, Drehen, Spiegeln, Analysieren, Anpassen, Koordinaten
- [x] Zwischenablage (dauerhaft), Baumeister mit Vorschau, Drehen/Spiegeln/ohne Luft/Kreaturen/Versatz
- [x] Blaupausen speichern/laden/löschen
- [x] Formen: Kugel, Halbkugel, Quader, Zylinder, Kegel, Pyramide, Torus, Bogen (massiv/hohl)
- [x] Modellieren: Aufbauen, Abtragen, Glätten, Schmelzen, Auffüllen, Felsen, Aufrauen
- [x] Maler: Oberfläche, Oberseite, Ersetzen, Rauschen, Höhenverlauf, Säubern
- [x] Terrain: Anheben, Absenken, Einebnen, Glätten, Hügel, Terrassen
- [x] Extrudieren, Pfad (Linie/Kurve/Röhre), Text, Lineal, Blockzustand-Editor, Bulldozer
- [x] Verlauf: Rückgängig/Wiederherstellen (Blöcke + Struktur-Schnappschüsse), mehrere Schritte
- [x] Fähigkeiten: Reichweite, Weit platzieren, Engel-Platzierung, Ersetzen-Modus, Nachtsicht, Noclip, Nur-OPs
- [x] Symmetrie (X/Z) für Werkzeuge und normales Bauen/Abbauen
- [x] Welt-Menü, Hotbar-Sätze, Hilfe, Chat-Befehle
- [x] Automatischer Test aller Werkzeuge gegen eine API-Attrappe
- [x] Ansichten (Standpunkte speichern & hinspringen), Maler „Streuen“, Array-Stapeln, Hohlräume füllen

## Im Spiel prüfen (Rückmeldung vom Nutzer nötig)
- [ ] Spiegeln „Ost-West“ spiegelt wirklich Ost↔West (sonst `mirEnum` in core/clipboard.js tauschen)
- [ ] Schlagen mit Werkzeug im Kreativmodus löst Pipette/Zusatzaktion aus (sonst Alternative über Menü nötig –
      die Pipette gibt es zusätzlich im Muster-Menü)
- [ ] Pinsel-Werkzeuge malen beim Gedrückthalten auch auf große Entfernung durchgehend

## Als Nächstes
- [ ] **Neigung/Rampe (Slope)**: Rampe zwischen zwei Pfadpunkten / Böschung am Hang
- [ ] **Verzerren (Distort) & Zerbrechen (Shatter)** als weitere Modellier-Modi
- [ ] **Blaupausen streuen**: Blaupausen (z.B. Bäume) zufällig auf Oberflächen verteilen
- [ ] **Wasser ablassen/füllen** in der Auswahl bzw. per Flutfüllung ab Blickziel
- [ ] **Muster-Paletten** speichern (mehrere benannte Muster, schnell wechseln)
- [ ] **Auswahl-Operationen**: Auswahl um N Blöcke aufblasen/schrumpfen (3D), Auswahl auf Oberfläche begrenzen
- [ ] **Verlaufs-Liste**: gezielt zu einem Schritt zurückspringen
- [ ] **Kreaturen-Werkzeug**: Kreaturen/Rüstungsständer auswählen, verschieben, drehen, löschen
- [ ] **Anmerkungen**: schwebende Texte/Linien als Bau-Notizen (eigene Entität im Ressourcenpaket)
- [ ] **Formen**: Spirale, Bogen in Blickrichtung drehen, Kuppel mit Wandstärke, Prisma
- [ ] **Maler**: Neigungs-abhängig malen (steile Hänge Stein, flach Gras)
- [ ] Mehr Tests: Masken-Kombinationen, Symmetrie + Struktur-Verlauf, Blaupausen über Neustart
- [ ] Leistung: große Operationen in Teilstücken mit Fortschrittsanzeige in der Aktionsleiste

## Ideen / später
- Bild → Blöcke (Pixel-Art aus eingegebenen Farbcodes)
- Höhenkarten-Stempel (vordefinierte Berge/Krater)
- Englische Menütexte (Sprache umschaltbar)
