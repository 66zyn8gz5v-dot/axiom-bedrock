# Roadmap

Plan für die nächsten Ausbaustufen. Jede Nacht (23 Uhr und 0 Uhr) nimmt sich die obersten offenen Punkte vor,
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
- [x] v0.15: Säule mit Sockel & Kapitell (Formen), Stützpfeiler für Brücken
- [x] v0.16: Dach aufsetzen (Sattel-/Walmdach mit Treppen, Überstand, Giebel), Fenster-Raster für Wände
- [x] v0.17: 3D-Handbuch (klappt vor dem Spieler auf, 22 Seiten mit Bildern, umblättern), Textfassung im Hilfe-Menü
- [x] v0.18: Handbuch-Design (Leder, Pergament, Banner, Slots, 3D-Blockbilder mit Original-Texturen)
- [x] v0.19: Biom-Malen beim Terraformen (Gras, Sand am Wasser, Stein an Hängen, Schnee), Modus „Nur Oberfläche“, Erosion (Regen, Wind/Schmelzen)
- [x] v0.20: Formen-Vorschau (Partikel-Umriss, Vorschau-Modus), 11 neue Formen (Keil, Tetraeder, Oktaeder, Vieleck, Stufenpyramide, Rohr, Scheibe, Kegelstumpf, Stern, Herz, Kreuz)
- [x] v0.29: See bis zum Überlauf füllen, Flüsse mit Sandufer
- [x] v0.28: Formen-Material (Verlauf, Rand), Lieblingsformen
- [x] v0.27: Landschaft in einer Auswahl erzeugen (Hügel, Täler, Seen, Schnee)
- [x] v0.26: Form von Punkt A nach B, Hohl mit offenem Boden/Deckel, Drahtgitter
- [x] v0.25: Felsbogen, Höhleneingang, Hügelkette entlang Pfad-Punkten
- [x] v0.24: Formen drehen/kippen/neigen, Form in Auswahl einpassen
- [x] v0.23: Stempel Düne, Schneegipfel, Klippe
- [x] v0.22: Terrain-Stempel einstellbar (Zackigkeit, Drehung, Streckung) mit Vorschau-Umriss
- [x] v0.21: Editor-Modus (Hotbar als Werkzeugleiste 1–9), Übersicht mit allen Werkzeugen, Vogelperspektive

## Im Spiel prüfen (Rückmeldung vom Nutzer nötig)
- [ ] Editor-Modus: Werkzeuge auf 1–9, Übersicht zeigt Überschriften & Icons, Hotbar kommt beim Ausschalten zurück
- [ ] Vogelperspektive: Kamera von oben folgt flüssig, Ausschalten stellt normale Sicht her
- [ ] 3D-Handbuch: Seiten sind lesbar (nicht gespiegelt), Umblättern per Schlagen/Benutzen klappt, Buch ist hell genug
- [ ] Treppen-Werkzeug: Treppen steigen zur höheren Stufe hin an (sonst Richtungstabelle STAIR_DIRS anpassen)
- [ ] Anmerkungen: Text schwebt sichtbar, die Entität selbst ist unsichtbar und lässt sich nicht verletzen
- [ ] Spiegeln „Ost-West“ spiegelt wirklich Ost↔West (sonst `mirEnum` in core/clipboard.js tauschen)
- [ ] Schlagen mit Werkzeug im Kreativmodus löst Pipette/Zusatzaktion aus (sonst Alternative über Menü nötig –
      die Pipette gibt es zusätzlich im Muster-Menü)
- [ ] Pinsel-Werkzeuge malen beim Gedrückthalten auch auf große Entfernung durchgehend

## Als Nächstes (Schwerpunkt laut Nutzer: Terraform & Formen wie Zylinder, Dreieck, Pyramide)
Zwei Ausbau-Runden pro Nacht: 23 Uhr Terraform, 0 Uhr Formen. Die Punkte werden von oben nach unten abgearbeitet.

### Terraform vertiefen
- [x] **Biom-Malen beim Terraformen** (v0.19): Oberfläche automatisch passend (Gras oben, Erde darunter, Stein in der Tiefe,
      Sand am Wasser, Schnee ab einstellbarer Höhe, Geröll an steilen Hängen)
- [x] **Erosion** (v0.19): Regen-Erosion (Rinnen an Hängen) und Wind-/Schmelz-Erosion als Pinsel-Modi
- [x] **Stempel-Formen frei einstellbar** (v0.22): Größe, Höhe, Zackigkeit, Drehung + Vorschau-Rahmen vor dem Setzen
- [x] **Neue Stempel** Düne, Schneegipfel, Klippe (v0.23)
- [x] **Weitere Stempel**: Hügelkette entlang Pfadpunkten, Felsbogen, Höhleneingang (v0.25)
- [x] **Gelände aus Auswahl** (v0.27): ganze Box-Auswahl als Landschaft füllen (Rauschen mit Oktaven, Meereshöhe, Seen)
- [x] **Flüsse & Seen verbessern** (v0.29): Flussbett mit Ufer-Sand, Seen auffüllen bis zum Überlauf
- [ ] **Höhenkarten-Pinsel**: Formen „Spitz“, „Rund“, „Plateau“ für Anheben/Absenken, Stärke per Schleichen umkehren

### Formen (Figuren) vertiefen
- [x] **Vorschau vor dem Setzen** (v0.20): Partikel-Umriss der Form am Blickziel, erst der nächste Klick setzt sie
- [x] **Neue Grundformen** (v0.20): Dreieck/Keil (Rampe), Tetraeder (dreiseitige Pyramide), Oktaeder (Doppelpyramide),
      Vieleck-Prisma (3–12 Ecken, z.B. Sechseck-Turm), Stufenpyramide (Zikkurat), Rohr/Röhre (liegend & stehend),
      Scheibe/Kreisfläche, Kegelstumpf, Stern, Herz, Kreuz
- [x] **Freie Drehung & Neigung** (v0.24): Formen in 15°-Schritten um alle Achsen drehen/kippen (z.B. schräger Zylinder)
- [x] **Form zwischen zwei Punkten** (v0.26): Zylinder/Kegel/Pyramide von Punkt A nach Punkt B ziehen (wie Box-Auswahl)
- [x] **Form in die Auswahl einpassen** (v0.24): Kugel, Zylinder, Pyramide usw. genau in die aktuelle Box-Auswahl setzen
- [x] **Hohl-Optionen** (v0.26): Wandstärke je Form, offener Boden/Deckel, nur Umriss (Drahtgitter-Kanten)
- [x] **Material-Varianten** (v0.28): Verlauf von unten nach oben (Muster 1 → 2), Rand anderer Block als Füllung
- [x] **Lieblingsformen speichern** (v0.28): Form + Größe + Einstellungen als Vorlage merken und schnell wieder wählen

### Sonstiges
- [ ] **Kreaturen beim Kopieren/Einfügen mitnehmen** testen
- [ ] **Haus-Rohbau**: aus einer Box-Auswahl Wände, Boden, Tür-Öffnung, Fenster und Dach in einem Schritt
- [ ] **Dach**: Pultdach und Zeltdach, Dachrinne/Traufe mit umgedrehten Treppen
- [ ] **Englische Menütexte** (Sprache umschaltbar)

## Ideen / später
- Blaupausen zwischen Welten übertragen (über Strukturblöcke / .mcstructure)
