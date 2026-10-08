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
- [x] v0.3: Pfad flach als Straße/Rampe mit Unterbau, Modellieren „Verzerren“ & „Zerbrechen“, Wasser ablassen/füllen,
      Muster-Paletten, Auswahl aufblasen/schrumpfen/auf Oberfläche, Verlauf: zu Schritt springen,
      Formen Prisma & Spirale, Maler „Nach Neigung“
- [x] v0.4: Zwischenablage/Blaupausen verstreuen, Flutfüllung ab Blickziel, Formen nach Blickrichtung drehen,
      Spiral-Steigung, Fortschrittsanzeige bei großen Operationen
- [x] v0.5: Kreaturen-Werkzeug (auswählen, verschieben, drehen, holen, benennen, kopieren, löschen), Fortschritt in %
- [x] v0.6: Lasso-Auswahl (Umriss aus Pfadpunkten), Anmerkungen (schwebende Bau-Notizen)
- [x] v0.7: Terrain-Stempel Berg & Krater, Anmerkungs-Linien aus Lineal-Messung, Tests für Masken,
      Symmetrie mit großen Formen und Blaupausen aus Weltdaten
- [x] v0.8: Verlauf in der Auswahl (Muster 1 → 2), Ausdünnen (Ruinen), Pixel-Art im Text-Werkzeug
- [x] v0.9: Terrain „Treppen an Stufenkanten“, Stempel Vulkan & Hochplateau, Pixel-Art-Vorlagen
- [x] v0.10: Stufen (Platten) statt Treppen, korrekte Bedrock-Treppen-IDs, Stempel Insel & Schlucht
- [x] v0.11: Fluss entlang Pfadpunkten, Blaupausen-Verwaltung (Größe, Autor, Datum, umbenennen)
- [x] v0.12: Blaupausen-Vorschau am Blickziel, Auswahl direkt als Blaupause speichern
- [x] v0.13: Stempel Wasserfall (Rinne in Felswand, Quelle oben, Becken unten)
- [x] v0.14: Gespiegelte Kopie neben der Auswahl, Brücke entlang Pfadpunkten (Bogen, Belag, Geländer)

## Im Spiel prüfen (Rückmeldung vom Nutzer nötig)
- [ ] Treppen-Werkzeug: Treppen steigen zur höheren Stufe hin an (sonst Richtungstabelle STAIR_DIRS anpassen)
- [ ] Anmerkungen: Text schwebt sichtbar, die Entität selbst ist unsichtbar und lässt sich nicht verletzen
- [ ] Spiegeln „Ost-West“ spiegelt wirklich Ost↔West (sonst `mirEnum` in core/clipboard.js tauschen)
- [ ] Schlagen mit Werkzeug im Kreativmodus löst Pipette/Zusatzaktion aus (sonst Alternative über Menü nötig –
      die Pipette gibt es zusätzlich im Muster-Menü)
- [ ] Pinsel-Werkzeuge malen beim Gedrückthalten auch auf große Entfernung durchgehend

## Als Nächstes
- [ ] **Brücke**: Stützpfeiler bis zum Boden/Wasser als Option
- [ ] **Säulen-Werkzeug**: Säule vom Blickziel bis zum Boden/zur Decke mit Sockel & Kapitell
- [ ] **Kreaturen**: Kreaturen beim Kopieren/Einfügen mitnehmen testen
- [ ] **Englische Menütexte** (Sprache umschaltbar)

## Ideen / später
- Blaupausen zwischen Welten übertragen (über Strukturblöcke / .mcstructure)
