"""Erzeugt die Seiten des 3D-Handbuchs (Doppelseiten als Texturen) und die Textfassung fürs Menü.

Jede Doppelseite ist ein 1024×704-Bild (links + rechts), dazu ein brauner Streifen für die Buchkanten.
Gestaltung: Lederumschlag, Pergament, Banner-Überschriften, Inventar-Slots und 3D-Blockbilder.
Alles Pixelige (Hintergrund, Rahmen, Szenen) wird in halber Auflösung gezeichnet und verdoppelt,
der Fließtext in voller Auflösung darübergelegt – so sieht es nach Minecraft aus und bleibt gut lesbar.
"""
import json
import os

from PIL import Image, ImageDraw, ImageFont

import bookart

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEX_DIR = os.path.join(ROOT, "packs", "AxiomRP", "textures", "entity", "axiom_guide")
TEXT_JS = os.path.join(ROOT, "packs", "AxiomBP", "scripts", "ui", "guide_pages.js")

W, H = 1024, 704
PAGE_W = W // 2
FONT_DIR = "/usr/share/fonts/truetype/dejavu/"
F_HEAD = ImageFont.truetype(FONT_DIR + "DejaVuSans-Bold.ttf", 25)
F_TEXT = ImageFont.truetype(FONT_DIR + "DejaVuSans.ttf", 21)
F_SMALL = ImageFont.truetype(FONT_DIR + "DejaVuSans.ttf", 18)
F_BTN = ImageFont.truetype(FONT_DIR + "DejaVuSans-Bold.ttf", 17)
F_NUM = ImageFont.truetype(FONT_DIR + "DejaVuSans-Bold.ttf", 15)
# Pixel-Schrift für Überschriften (wird in halber Auflösung gezeichnet → klare 2×2-Pixel)
_PIXEL = "/usr/share/fonts/opentype/unifont/unifont.otf"
if os.path.exists(_PIXEL):
    P_HEAD = ImageFont.truetype(_PIXEL, 16)
    P_TITLE = ImageFont.truetype(_PIXEL, 32)
else:  # Ersatz, falls die Schrift fehlt
    P_HEAD = ImageFont.truetype(FONT_DIR + "DejaVuSans-Bold.ttf", 13)
    P_TITLE = ImageFont.truetype(FONT_DIR + "DejaVuSans-Bold.ttf", 26)

INK = (52, 38, 26)
ACCENT = (118, 52, 168)
ACCENT_DARK = (70, 28, 100)
LEATHER = (104, 58, 32)
BROWN = (110, 70, 40)
TIP_BG = (236, 220, 178)


def icon(name, size):
    """Werkzeug-Icon (mit Umrandung wie im Spiel) vergrößert."""
    import build  # noqa: E402  (vermeidet Zirkelimport beim Laden)

    return build.icon_image(name).resize((size, size), Image.NEAREST)


def controller(draw, x, y, width):
    """Gamepad mit Schultertasten (volle Auflösung). Gibt die verbrauchte Höhe zurück."""
    cx = x + width // 2
    draw.rounded_rectangle([cx - 130, y + 30, cx + 130, y + 130], radius=45, fill=(60, 60, 75), outline=INK, width=3)
    draw.rounded_rectangle([cx - 120, y + 8, cx - 60, y + 34], radius=8, fill=(170, 90, 220), outline=INK, width=2)
    draw.rounded_rectangle([cx + 60, y + 8, cx + 120, y + 34], radius=8, fill=(90, 170, 230), outline=INK, width=2)
    draw.text((cx - 104, y + 10), "LT", font=F_BTN, fill=(255, 255, 255))
    draw.text((cx + 76, y + 10), "RT", font=F_BTN, fill=(255, 255, 255))
    draw.ellipse([cx - 95, y + 60, cx - 55, y + 100], fill=(30, 30, 40), outline=(200, 200, 210), width=3)
    for dx, dy, c in ((70, 55, (230, 80, 80)), (95, 75, (80, 200, 90)), (45, 75, (80, 140, 235)), (70, 95, (240, 200, 60))):
        draw.ellipse([cx + dx - 11, y + dy - 11, cx + dx + 11, y + dy + 11], fill=c, outline=INK, width=2)
    draw.text((cx - 150, y + 136), "Benutzen", font=F_SMALL, fill=(130, 60, 170))
    draw.text((cx + 70, y + 136), "Schlagen", font=F_SMALL, fill=(40, 110, 170))
    draw.text((cx - 112, y + 104), "Schleichen", font=F_SMALL, fill=(255, 255, 255))
    return 165


def wrap(draw, text, font, width):
    words = text.split()
    lines, cur = [], ""
    for w in words:
        test = (cur + " " + w).strip()
        if draw.textlength(test, font=font) <= width:
            cur = test
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


# ---------------------------------------------------------------------------
# Inhalt: Liste von Doppelseiten, jede mit linker und rechter Seite.
# Bausteine: ("title", text) ("h", text) ("p", text) ("tool", icon, name, text)
#            ("steps", [..]) ("ctrl", [(knopf, text), ..]) ("big", icon) ("center", text)
#            ("tip", text) ("img", "controller" | Name einer 3D-Szene aus bookart.scene)
# ---------------------------------------------------------------------------
PAGES = [
    (
        [("space", 70), ("big", "menu"), ("space", 20), ("title", "Axiom Bedrock"), ("center", "Das Bau-Handbuch"),
         ("space", 30), ("center", "Bauen wie mit der Axiom-Mod –"), ("center", "jetzt auf Konsole, Handy & PC.")],
        [("h", "So liest du dieses Buch"),
         ("ctrl", [("Schlagen", "nächste Seite"), ("Schleichen + Schlagen", "vorherige Seite"),
                   ("Benutzen", "nächste Seite"), ("Buch benutzen", "Buch schließen")]),
         ("space", 10),
         ("p", "Das Buch schwebt vor dir. Du kannst dich bewegen – es bleibt dort stehen, wo du es geöffnet hast."),
         ("tip", "Den Text gibt es auch im Axiom-Menü unter Hilfe → Handbuch.")],
    ),
    (
        [("h", "Die Steuerung"),
         ("p", "Alle Werkzeuge funktionieren gleich:"),
         ("ctrl", [("LT / L2 / ZL", "Benutzen = Aktion"), ("RT / R2 / ZR", "Schlagen = Pipette"),
                   ("Stick drücken", "Schleichen")]),
         ("img", "controller"),
         ("p", "Schleichen + Benutzen = Einstellungen des Werkzeugs.")],
        [("h", "Inhalt"),
         ("steps", ["Erste Schritte", "Auswählen", "Kopieren & Einfügen", "Formen & Modellieren", "Malen & Terrain",
                    "Pfad, Brücke, Fluss, Text", "Weitere Werkzeuge", "Fähigkeiten & Welt", "Ein Haus in 5 Minuten",
                    "Tipps"])],
    ),
    (
        [("h", "1. Erste Schritte"),
         ("tool", "menu", "Axiom-Menü", "Benutzen → „Werkzeuge holen“ → „Alle Werkzeuge“."),
         ("steps", ["Box-Auswahl nehmen", "Auf Ecke 1 zielen + benutzen", "Auf Ecke 2 zielen + benutzen",
                    "Menü → Auswahl bearbeiten → Füllen"]),
         ("tip", "Fehler? Einfach das Rückgängig-Werkzeug benutzen.")],
        [("h", "Block & Muster"),
         ("p", "Dein Bau-Block heißt Muster. So stellst du ihn ein:"),
         ("steps", ["Mit einem Werkzeug auf einen Block schlagen (Pipette)", "Oder: Menü → Block / Muster",
                    "„Hotbar-Blöcke als Mischung“ mischt alle Blöcke deiner Hotbar"]),
         ("p", "Lieblings-Mischungen kannst du als Palette speichern."),
         ("tool", "undo", "Rückgängig", "Benutzen = zurück, Schleichen + Benutzen = wieder vor.")],
    ),
    (
        [("h", "2. Auswählen"),
         ("tool", "box_select", "Box-Auswahl", "Zwei Ecken setzen – fertig ist der Quader."),
         ("img", "selection"),
         ("tool", "magic_select", "Magische Auswahl", "Wählt alle verbundenen gleichen Blöcke."),
         ("tool", "brush_select", "Pinsel-Auswahl", "Gedrückt halten und über Blöcke malen.")],
        [("h", "Auswahl bearbeiten"),
         ("p", "Axiom-Menü → Auswahl bearbeiten:"),
         ("p", "Füllen · Ersetzen · Leeren · Wände · Aushöhlen · Überziehen · Natürlich machen · Glätten · "
               "Verlauf · Ausdünnen · Dach · Fenster · Stapeln · Array · Verschieben · Drehen · Spiegeln · "
               "Gespiegelte Kopie · Wasser · Analysieren"),
         ("p", "Die Partikel zeigen dir immer, was gerade ausgewählt ist."),
         ("p", "Lasso: Mit dem Pfad Punkte setzen → „Lasso“.")],
    ),
    (
        [("h", "3. Kopieren & Einfügen"),
         ("steps", ["Etwas auswählen", "Menü → Auswahl bearbeiten → Kopieren", "Baumeister nehmen",
                    "Zielen: der gelbe Rahmen zeigt den Platz", "Benutzen = einfügen"]),
         ("tool", "builder", "Baumeister", "Schlagen dreht um 90°. Schleichen + Benutzen: spiegeln, ohne Luft …"),
         ("img", "copy")],
        [("h", "Blaupausen"),
         ("p", "Blaupausen sind gespeicherte Bauten – auch nach dem Neustart noch da."),
         ("steps", ["Menü → Zwischenablage & Blaupausen", "„Auswahl direkt als Blaupause speichern“",
                    "Später: Blaupausen → laden → mit dem Baumeister einfügen"]),
         ("p", "Mit „Vorschau“ siehst du vorher einen blauen Rahmen. Bäume als Blaupause? → „Verstreuen“ macht einen Wald!")],
    ),
    (
        [("h", "4. Formen"),
         ("tool", "shape", "Formen", "Kugel, Kuppel, Quader, Zylinder, Kegel, Pyramide, Ring, Bogen, Dach, Spirale, Säule."),
         ("p", "Schleichen + Benutzen: Form, Größe, hohl oder voll."),
         ("p", "Benutzen setzt die Form dort, wo du hinschaust – auch in der Luft."),
         ("img", "sphere")],
        [("h", "Modellieren"),
         ("tool", "sculpt", "Modellieren", "Wie Knete: gedrückt halten und formen."),
         ("p", "Modi: Aufbauen · Abtragen · Glätten · Schmelzen · Auffüllen · Felsen · Aufrauen · Verzerren · Zerbrechen"),
         ("tool", "bulldozer", "Bulldozer", "Baut Blöcke aus großer Entfernung sofort ab.")],
    ),
    (
        [("h", "5. Malen"),
         ("tool", "painter", "Maler", "Färbt Blöcke im Pinsel um – gedrückt halten."),
         ("p", "Gute Modi: Oberfläche · Nach Neigung (oben Gras, Hänge Stein) · Rauschen (2 Blöcke gemischt) · "
               "Streuen (Blumen) · Flutfüllung (See füllen)")],
        [("h", "Terrain"),
         ("tool", "terrain", "Terrain", "Gelände anheben, absenken, einebnen, glätten."),
         ("p", "Stempel mit einem Klick: Berg · Krater · Vulkan · Hochplateau · Insel · Schlucht · Wasserfall"),
         ("img", "terrain"),
         ("tip", "„Treppen an Stufenkanten“ macht Hügel begehbar.")],
    ),
    (
        [("h", "6. Pfad & Co."),
         ("tool", "path", "Pfad", "Benutzen setzt Punkte. Schleichen + Benutzen zum Bauen."),
         ("p", "Daraus wird: Rohr oder Straße · Brücke mit Bogen & Geländer · Fluss mit Wasser · Lasso-Auswahl"),
         ("img", "bridge")],
        [("h", "Text & Pixel-Art"),
         ("tool", "text", "Text", "Schreibt Wörter aus Blöcken – an die Wand oder auf den Boden."),
         ("p", "Modus Pixel-Art: fertige Bilder wie Herz, Creeper, Schwert oder Haus wählen und setzen."),
         ("img", "heart")],
    ),
    (
        [("h", "7. Weitere Werkzeuge"),
         ("tool", "extrude", "Extrudieren", "Zieht eine ganze Fläche einen Block heraus."),
         ("tool", "ruler", "Lineal", "Misst Längen zwischen zwei Punkten."),
         ("tool", "tinker", "Blockzustand", "Richtung, Farbe, offen/zu ändern. Schlagen dreht.")],
        [("h", "Kreaturen & Notizen"),
         ("tool", "entity", "Kreaturen", "Tiere & Rüstungsständer wählen, verschieben, drehen, benennen."),
         ("p", "Anmerkungen (Menü): schwebende Notizen wie „Hier kommt das Tor hin“ und farbige Linien.")],
    ),
    (
        [("h", "8. Fähigkeiten"),
         ("p", "Menü → Fähigkeiten:"),
         ("steps", ["Reichweite bis 512 Blöcke", "Blöcke in die Luft setzen (Engel)", "Ersetzen-Modus",
                    "Nachtsicht", "Durch Wände fliegen"]),
         ("p", "Symmetrie spiegelt alles, was du baust – auch normales Bauen.")],
        [("h", "Welt & Ansichten"),
         ("p", "Menü → Welt: Tageszeit, Wetter und Spielregeln."),
         ("p", "Ansichten: Lieblingsplätze speichern und sofort hinspringen."),
         ("p", "Hotbar-Sätze: bis zu 9 Hotbars speichern und tauschen.")],
    ),
    (
        [("h", "9. Ein Haus in 5 Minuten"),
         ("steps", ["Box-Auswahl: Grundriss + Höhe", "Muster: Holzbretter → „Wände“", "Muster: Steinziegel → Boden füllen",
                    "Dach aufsetzen (Satteldach)", "Eine Wand auswählen → Fenster-Raster"]),
         ("img", "house")],
        [("h", "10. Tipps"),
         ("tip", "Alles lässt sich rückgängig machen – trau dich!"),
         ("p", "Die Leiste unten am Bildschirm zeigt dein Werkzeug und seine Einstellungen."),
         ("p", "Masken schützen Blöcke: „nur Luft ersetzen“ baut nur in leere Stellen."),
         ("space", 20), ("center", "Viel Spaß beim Bauen!")],
    ),
]


# Szenen-Größe je Bild (Pixel pro Block in halber Auflösung)
SCENE_U = {"selection": 22, "house": 16, "terrain": 16, "bridge": 16, "heart": 22, "sphere": 12, "copy": 14}


class Spread:
    """Eine Doppelseite: `art` (halbe Auflösung, pixelig) + Aufgaben für die volle Auflösung."""

    def __init__(self, seed):
        self.art = Image.new("RGBA", (W // 2, H // 2), LEATHER + (255,))
        self.da = ImageDraw.Draw(self.art)
        self.da.fontmode = "1"
        self.full = []  # Funktionen (img, draw), die nach dem Vergrößern ausgeführt werden
        self.measure = ImageDraw.Draw(Image.new("RGBA", (4, 4)))
        self._background(seed)

    def _background(self, seed):
        a, d = self.art, self.da
        w, h = a.size
        # Leder mit leichter Maserung
        leather = bookart._noise_tex(LEATHER, 7, seed).resize((w, h), Image.NEAREST)
        a.alpha_composite(leather)
        # Goldene Ziernaht am Rand
        for x in range(4, w - 4, 4):
            d.line([x, 1, x + 1, 1], fill=bookart.GOLD)
            d.line([x, h - 2, x + 1, h - 2], fill=bookart.GOLD)
        for y in range(4, h - 4, 4):
            d.line([1, y, 1, y + 1], fill=bookart.GOLD)
            d.line([w - 2, y, w - 2, y + 1], fill=bookart.GOLD)
        # Pergament-Seiten
        for i, px in enumerate((5, w // 2 + 2)):
            pg = bookart.parchment(w // 2 - 7, h - 10, seed * 3 + i)
            # Schatten zum Buchfalz hin
            pp = pg.load()
            for k in range(14):
                f = 0.72 + 0.28 * (k / 14)
                xx = pg.size[0] - 1 - k if i == 0 else k
                for yy in range(pg.size[1]):
                    r, g, b, al = pp[xx, yy]
                    pp[xx, yy] = (int(r * f), int(g * f), int(b * f), al)
            a.alpha_composite(pg, (px, 5))
            x0, x1 = px + 4, px + pg.size[0] - 5
            bookart.corner(d, x0, 9, 1, 1)
            bookart.corner(d, x1, 9, -1, 1)
            bookart.corner(d, x0, h - 10, 1, -1)
            bookart.corner(d, x1, h - 10, -1, -1)
        # Buchfalz
        d.rectangle([w // 2 - 2, 0, w // 2 + 1, h], fill=(70, 38, 20))
        # Lesebändchen
        rx = w // 2 + 8
        d.polygon([(rx, 0), (rx + 6, 0), (rx + 6, 62), (rx + 3, 58), (rx, 62)], fill=(176, 36, 40))
        d.line([rx + 1, 0, rx + 1, 59], fill=(214, 70, 70))

    # Hilfen: Koordinaten immer in voller Auflösung angeben
    def text(self, xy, s, font, fill):
        self.full.append(lambda img, d: d.text(xy, s, font=font, fill=fill))

    def paste(self, im, xy):
        self.full.append(lambda img, d: img.alpha_composite(im, (int(xy[0]), int(xy[1]))))

    def render(self):
        img = Image.new("RGBA", (W, 768), BROWN + (255,))
        img.alpha_composite(self.art.resize((W, H), Image.NEAREST))
        d = ImageDraw.Draw(img)
        for f in self.full:
            f(img, d)
        return img


def banner(sp, x0, width, y, text):
    """Überschrift auf einem lila Stoffbanner (Pixel-Schrift)."""
    d = sp.da
    hx0, hx1, hy = (x0 - 6) // 2, (x0 + width + 6) // 2, y // 2
    h = 19
    dark = ACCENT_DARK
    for sx, dirn in ((hx0, -1), (hx1, 1)):
        tip = sx + dirn * 9
        d.polygon([(sx, hy + 4), (tip, hy + 4), (tip - dirn * 4, hy + 4 + h // 2), (tip, hy + 4 + h), (sx, hy + 4 + h)],
                  fill=dark)
    d.rectangle([hx0, hy, hx1, hy + h], fill=ACCENT)
    d.line([hx0, hy + 1, hx1, hy + 1], fill=(170, 110, 220))
    d.line([hx0, hy + h, hx1, hy + h], fill=dark)
    tw = d.textlength(text, font=P_HEAD)
    if tw > hx1 - hx0 - 4:
        raise SystemExit(f"Überschrift zu lang: {text}")
    tx = (hx0 + hx1 - tw) // 2
    d.text((tx + 1, hy + 2), text, font=P_HEAD, fill=dark)
    d.text((tx, hy + 1), text, font=P_HEAD, fill=(255, 246, 222))
    return (h + 8) * 2


def slot(sp, x, y, name):
    """Inventar-Slot (72×72) mit Werkzeug-Icon."""
    d = sp.da
    hx, hy, s = x // 2, y // 2, 36
    d.rectangle([hx, hy, hx + s, hy + s], fill=(139, 139, 139))
    d.line([hx, hy, hx + s, hy], fill=(55, 55, 55))
    d.line([hx, hy, hx, hy + s], fill=(55, 55, 55))
    d.line([hx + s, hy, hx + s, hy + s], fill=(255, 255, 255))
    d.line([hx, hy + s, hx + s, hy + s], fill=(255, 255, 255))
    sp.paste(icon(name, 64), (hx * 2 + 5, hy * 2 + 5))


def gem(sp, x, y, n):
    d = sp.da
    hx, hy = x // 2, y // 2
    pts = [(hx + 7, hy), (hx + 14, hy + 7), (hx + 7, hy + 14), (hx, hy + 7)]
    d.polygon(pts, fill=ACCENT, outline=ACCENT_DARK)
    d.line([(hx + 7, hy + 2), (hx + 11, hy + 6)], fill=(210, 170, 240))
    s = str(n)
    tw = sp.measure.textlength(s, font=F_NUM)
    sp.text((hx * 2 + 15 - tw / 2, hy * 2 + 5), s, F_NUM, (255, 255, 255))


def mc_button(sp, x, y, label):
    d = sp.da
    w = int(sp.measure.textlength(label, font=F_BTN) + 22)
    hx, hy, hw = x // 2, y // 2, w // 2
    d.rectangle([hx, hy, hx + hw, hy + 15], fill=(112, 112, 112), outline=(20, 20, 20))
    d.line([hx + 1, hy + 1, hx + hw - 1, hy + 1], fill=(172, 172, 172))
    d.line([hx + 1, hy + 1, hx + 1, hy + 14], fill=(150, 150, 150))
    d.line([hx + 1, hy + 14, hx + hw - 1, hy + 14], fill=(70, 70, 70))
    sp.text((hx * 2 + 12, hy * 2 + 6), label, F_BTN, (40, 40, 40))
    sp.text((hx * 2 + 11, hy * 2 + 5), label, F_BTN, (255, 255, 255))
    return hw * 2


def render_page(sp, x0, blocks, page_no):
    m = sp.measure
    x = x0 + 50
    y = 44
    width = PAGE_W - 100
    text_out = []
    for b in blocks:
        kind = b[0]
        if kind == "space":
            y += b[1]
        elif kind == "title":
            d = sp.da
            tw = d.textlength(b[1], font=P_TITLE)
            tx, ty = (x0 // 2) + (PAGE_W // 2 - tw) // 2, y // 2
            d.text((tx + 2, ty + 2), b[1], font=P_TITLE, fill=ACCENT_DARK)
            d.text((tx, ty), b[1], font=P_TITLE, fill=ACCENT)
            y += 74
            text_out.append("§l" + b[1] + "§r")
        elif kind == "center":
            tw = m.textlength(b[1], font=F_TEXT)
            sp.text((x0 + (PAGE_W - tw) / 2, y), b[1], F_TEXT, INK)
            y += 31
            text_out.append(b[1])
        elif kind == "big":
            # Icon auf goldenem Sockel
            d = sp.da
            cx, cy = (x0 + PAGE_W // 2) // 2, (y + 80) // 2
            d.ellipse([cx - 46, cy - 46, cx + 46, cy + 46], fill=(232, 200, 120), outline=bookart.GOLD_DARK, width=2)
            d.ellipse([cx - 40, cy - 40, cx + 40, cy + 40], outline=(250, 228, 160))
            sp.paste(icon(b[1], 128), (cx * 2 - 64, cy * 2 - 64))
            y += 176
        elif kind == "h":
            y += banner(sp, x, width, y, b[1])
            text_out.append("§d§l" + b[1] + "§r")
        elif kind == "p":
            for line in wrap(m, b[1], F_TEXT, width):
                sp.text((x, y), line, F_TEXT, INK)
                y += 28
            y += 8
            text_out.append(b[1])
        elif kind == "tip":
            lines = wrap(m, b[1], F_SMALL, width - 64)
            bh = max(52, len(lines) * 24 + 20)
            d = sp.da
            d.rectangle([x // 2, y // 2, (x + width) // 2, (y + bh) // 2], fill=TIP_BG, outline=bookart.GOLD_DARK)
            d.line([x // 2 + 1, y // 2 + 1, (x + width) // 2 - 1, y // 2 + 1], fill=(250, 238, 200))
            # Glühbirne als kleines Pixel-Symbol
            lx, ly = x // 2 + 8, y // 2 + 6
            d.ellipse([lx, ly, lx + 10, ly + 10], fill=(255, 220, 80), outline=(160, 110, 20))
            d.rectangle([lx + 3, ly + 11, lx + 7, ly + 13], fill=(130, 130, 130))
            d.point([(lx + 3, ly + 3)], fill=(255, 255, 230))
            yy = y + 10 + (bh - 20 - len(lines) * 24) // 2
            for line in lines:
                sp.text((x + 50, yy), line, F_SMALL, INK)
                yy += 24
            y += bh + 12
            text_out.append("§6Tipp:§r " + b[1])
        elif kind == "tool":
            _, name, title, text = b
            slot(sp, x, y, name)
            sp.text((x + 86, y), title, F_HEAD, ACCENT_DARK)
            yy = y + 32
            for line in wrap(m, text, F_SMALL, width - 86):
                sp.text((x + 86, yy), line, F_SMALL, INK)
                yy += 23
            y = max(y + 84, yy + 10)
            text_out.append(f"§e{title}§r: {text}")
        elif kind == "steps":
            for i, s in enumerate(b[1], 1):
                gem(sp, x, y, i)
                for line in wrap(m, s, F_TEXT, width - 40):
                    sp.text((x + 40, y + 1), line, F_TEXT, INK)
                    y += 28
                y += 6
                text_out.append(f"{i}. {s}")
            y += 4
        elif kind == "img":
            if b[1] == "controller":
                yy = y
                sp.full.append(lambda img, d, yy=yy: controller(d, x, yy, width))
                y += 165
            else:
                # Szene in voller Auflösung, damit die Original-Texturen scharf bleiben
                sc = bookart.scene(b[1], SCENE_U.get(b[1]))
                sx = x0 + PAGE_W // 2 - sc.size[0] // 2
                # Schatten unter der Szene
                cy = (y + sc.size[1] - 12) // 2
                sp.da.ellipse([(sx + 16) // 2, cy - 4, (sx + sc.size[0] - 16) // 2, cy + 6], fill=(205, 186, 150))
                sp.paste(sc, (sx, y))
                y += sc.size[1] + 10
        elif kind == "ctrl":
            for key, text in b[1]:
                bw = mc_button(sp, x, y, key)
                sp.text((x + bw + 12, y + 4), "= " + text, F_TEXT, INK)
                y += 40
                text_out.append(f"§b{key}§r = {text}")
    if y > H - 54:
        raise SystemExit(f"Seite {page_no} ist zu voll ({y}px)")
    # Seitenzahl auf kleinem Gold-Schild
    pn = str(page_no)
    d = sp.da
    cx = (x0 + PAGE_W // 2) // 2
    d.rectangle([cx - 11, H // 2 - 23, cx + 11, H // 2 - 11], fill=bookart.GOLD, outline=bookart.GOLD_DARK)
    tw = m.textlength(pn, font=F_NUM)
    sp.text((cx * 2 - tw / 2, H - 43), pn, F_NUM, (90, 55, 15))
    return text_out


def render_all():
    os.makedirs(TEX_DIR, exist_ok=True)
    texts = []
    for i, (left, right) in enumerate(PAGES):
        sp = Spread(i + 1)
        lt = render_page(sp, 0, left, i * 2 + 1)
        rt = render_page(sp, PAGE_W, right, i * 2 + 2)
        sp.render().save(os.path.join(TEX_DIR, f"p{i}.png"))
        texts.append("\n".join(lt) + "\n\n" + "\n".join(rt))
    with open(TEXT_JS, "w", encoding="utf-8") as f:
        f.write("// Automatisch erzeugt von tools/guide.py – nicht von Hand bearbeiten.\n")
        f.write("/** Textfassung des Handbuchs (eine Doppelseite pro Eintrag). */\n")
        f.write("export const GUIDE_PAGES = " + json.dumps(texts, ensure_ascii=False, indent=2) + ";\n")
    return len(PAGES)


if __name__ == "__main__":
    print("Seiten:", render_all())
