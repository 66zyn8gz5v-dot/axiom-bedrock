"""Erzeugt die Seiten des 3D-Handbuchs (Doppelseiten als Texturen) und die Textfassung fürs Menü.

Jede Doppelseite ist ein 1024×704-Bild (links + rechts), dazu ein brauner Streifen für die Buchkanten.
Inhalt: kurze Sätze, große Bilder – damit es auch Freunde schnell verstehen.
"""
import json
import os

from PIL import Image, ImageDraw, ImageFont

from icons import ICONS, PALETTE

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEX_DIR = os.path.join(ROOT, "packs", "AxiomRP", "textures", "entity", "axiom_guide")
TEXT_JS = os.path.join(ROOT, "packs", "AxiomBP", "scripts", "ui", "guide_pages.js")

W, H = 1024, 704
PAGE_W = W // 2
FONT_DIR = "/usr/share/fonts/truetype/dejavu/"
F_TITLE = ImageFont.truetype(FONT_DIR + "DejaVuSans-Bold.ttf", 38)
F_HEAD = ImageFont.truetype(FONT_DIR + "DejaVuSans-Bold.ttf", 27)
F_TEXT = ImageFont.truetype(FONT_DIR + "DejaVuSans.ttf", 22)
F_SMALL = ImageFont.truetype(FONT_DIR + "DejaVuSans.ttf", 18)
F_BTN = ImageFont.truetype(FONT_DIR + "DejaVuSans-Bold.ttf", 18)

PAPER = (244, 234, 210)
PAPER_DARK = (226, 212, 180)
INK = (52, 40, 30)
ACCENT = (120, 50, 160)
BROWN = (110, 70, 40)


def icon(name, size):
    """Werkzeug-Icon (mit Umrandung wie im Spiel) vergrößert."""
    import build  # noqa: E402  (vermeidet Zirkelimport beim Laden)

    return build.icon_image(name).resize((size, size), Image.NEAREST)


def illus(draw, img, x, y, width, name):
    """Kleine Zeichnungen für das Handbuch. Gibt die verbrauchte Höhe zurück."""
    cx = x + width // 2
    if name == "controller":
        # Gamepad mit Schultertasten
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
    if name == "selbox":
        # Würfel mit gepunktetem Auswahlrahmen
        s = 70
        ox, oy = cx - 40, y + 40
        front = [(ox - s, oy), (ox + s - 20, oy), (ox + s - 20, oy + 2 * s - 20), (ox - s, oy + 2 * s - 20)]
        back = [(px + 50, py - 35) for px, py in front]
        draw.polygon(front, fill=(150, 150, 150), outline=INK)
        draw.polygon([front[0], back[0], back[1], front[1]], fill=(185, 185, 185), outline=INK)
        draw.polygon([front[1], back[1], back[2], front[2]], fill=(120, 120, 120), outline=INK)
        for a, b in list(zip(front, front[1:] + front[:1])) + list(zip(back, back[1:] + back[:1])) + list(zip(front, back)):
            n = int(max(abs(b[0] - a[0]), abs(b[1] - a[1])) / 10)
            for k in range(n + 1):
                px = a[0] + (b[0] - a[0]) * k / max(1, n)
                py = a[1] + (b[1] - a[1]) * k / max(1, n)
                draw.ellipse([px - 3, py - 3, px + 3, py + 3], fill=(240, 90, 240))
        draw.ellipse([front[3][0] - 8, front[3][1] - 8, front[3][0] + 8, front[3][1] + 8], fill=(80, 220, 80), outline=INK)
        draw.ellipse([back[1][0] - 8, back[1][1] - 8, back[1][0] + 8, back[1][1] + 8], fill=(80, 140, 255), outline=INK)
        draw.text((front[3][0] - 30, front[3][1] + 12), "Ecke 1", font=F_SMALL, fill=INK)
        draw.text((back[1][0] + 12, back[1][1] - 10), "Ecke 2", font=F_SMALL, fill=INK)
        return 2 * s + 62
    if name == "house":
        bx = cx - 110
        draw.rectangle([bx, y + 90, bx + 220, y + 200], fill=(190, 140, 90), outline=INK, width=3)
        draw.polygon([(bx - 20, y + 92), (bx + 110, y + 10), (bx + 240, y + 92)], fill=(140, 60, 50), outline=INK)
        for wx in (bx + 25, bx + 150):
            draw.rectangle([wx, y + 115, wx + 45, y + 155], fill=(170, 215, 245), outline=INK, width=2)
        draw.rectangle([bx + 92, y + 135, bx + 128, y + 200], fill=(110, 70, 40), outline=INK, width=2)
        return 210
    return 0


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


def button(draw, x, y, label, color=(70, 70, 90)):
    w = draw.textlength(label, font=F_BTN) + 18
    draw.rounded_rectangle([x, y, x + w, y + 30], radius=10, fill=color, outline=INK, width=2)
    draw.text((x + 9, y + 4), label, font=F_BTN, fill=(255, 255, 255))
    return w


# ---------------------------------------------------------------------------
# Inhalt: Liste von Doppelseiten, jede mit linker und rechter Seite.
# Bausteine: ("title", text) ("h", text) ("p", text) ("tool", icon, name, text)
#            ("steps", [..]) ("ctrl", [(knopf, text), ..]) ("big", icon) ("center", text)
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
         ("p", "Tipp: Den Text gibt es auch im Axiom-Menü unter Hilfe → Handbuch.")],
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
         ("p", "Fertig! Fehler? Einfach das Rückgängig-Werkzeug benutzen.")],
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
         ("img", "selbox"),
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
         ("tool", "builder", "Baumeister", "Schlagen dreht um 90°. Schleichen + Benutzen: spiegeln, ohne Luft …")],
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
         ("p", "Benutzen setzt die Form dort, wo du hinschaust – auch in der Luft.")],
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
         ("p", "„Treppen an Stufenkanten“ macht Hügel begehbar.")],
    ),
    (
        [("h", "6. Pfad & Co."),
         ("tool", "path", "Pfad", "Benutzen setzt Punkte. Schleichen + Benutzen zum Bauen."),
         ("p", "Daraus wird: Rohr oder Straße · Brücke mit Bogen & Geländer · Fluss mit Wasser · Lasso-Auswahl")],
        [("h", "Text & Pixel-Art"),
         ("tool", "text", "Text", "Schreibt Wörter aus Blöcken – an die Wand oder auf den Boden."),
         ("p", "Modus Pixel-Art: fertige Bilder wie Herz, Creeper, Schwert oder Haus wählen und setzen.")],
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
         ("p", "Alles lässt sich rückgängig machen – trau dich!"),
         ("p", "Die Leiste unten am Bildschirm zeigt dein Werkzeug und seine Einstellungen."),
         ("p", "Masken schützen Blöcke: „nur Luft ersetzen“ baut nur in leere Stellen."),
         ("space", 20), ("center", "Viel Spaß beim Bauen!")],
    ),
]


def render_page(draw, img, x0, blocks, page_no):
    x = x0 + 46
    y = 40
    width = PAGE_W - 92
    text_out = []
    for b in blocks:
        kind = b[0]
        if kind == "space":
            y += b[1]
        elif kind == "title":
            tw = draw.textlength(b[1], font=F_TITLE)
            draw.text((x0 + (PAGE_W - tw) / 2, y), b[1], font=F_TITLE, fill=ACCENT)
            y += 52
            text_out.append("§l" + b[1] + "§r")
        elif kind == "center":
            tw = draw.textlength(b[1], font=F_TEXT)
            draw.text((x0 + (PAGE_W - tw) / 2, y), b[1], font=F_TEXT, fill=INK)
            y += 32
            text_out.append(b[1])
        elif kind == "big":
            ic = icon(b[1], 160)
            img.alpha_composite(ic, (int(x0 + (PAGE_W - 160) / 2), y))
            y += 170
        elif kind == "h":
            draw.text((x, y), b[1], font=F_HEAD, fill=ACCENT)
            y += 36
            draw.line([x, y, x + width, y], fill=PAPER_DARK, width=3)
            y += 12
            text_out.append("§d§l" + b[1] + "§r")
        elif kind == "p":
            for line in wrap(draw, b[1], F_TEXT, width):
                draw.text((x, y), line, font=F_TEXT, fill=INK)
                y += 29
            y += 8
            text_out.append(b[1])
        elif kind == "tool":
            _, name, title, text = b
            img.alpha_composite(icon(name, 64), (x, y))
            draw.text((x + 78, y), title, font=F_HEAD, fill=INK)
            yy = y + 34
            for line in wrap(draw, text, F_SMALL, width - 78):
                draw.text((x + 78, yy), line, font=F_SMALL, fill=INK)
                yy += 23
            y = max(y + 74, yy + 8)
            text_out.append(f"§e{title}§r: {text}")
        elif kind == "steps":
            for i, s in enumerate(b[1], 1):
                draw.ellipse([x, y + 1, x + 28, y + 29], fill=ACCENT)
                n = str(i)
                draw.text((x + 14 - draw.textlength(n, font=F_BTN) / 2, y + 4), n, font=F_BTN, fill=(255, 255, 255))
                lines = wrap(draw, s, F_TEXT, width - 40)
                for line in lines:
                    draw.text((x + 40, y + 2), line, font=F_TEXT, fill=INK)
                    y += 29
                y += 6
                text_out.append(f"{i}. {s}")
            y += 4
        elif kind == "img":
            y += illus(draw, img, x, y, width, b[1])
        elif kind == "ctrl":
            for key, text in b[1]:
                bw = button(draw, x, y, key)
                draw.text((x + bw + 12, y + 3), "= " + text, font=F_TEXT, fill=INK)
                y += 40
                text_out.append(f"§b{key}§r = {text}")
    if y > H - 50:
        raise SystemExit(f"Seite {page_no} ist zu voll ({y}px)")
    # Seitenzahl
    pn = str(page_no)
    draw.text((x0 + PAGE_W / 2 - draw.textlength(pn, font=F_SMALL) / 2, H - 38), pn, font=F_SMALL, fill=BROWN)
    return text_out


def render_all():
    os.makedirs(TEX_DIR, exist_ok=True)
    texts = []
    for i, (left, right) in enumerate(PAGES):
        img = Image.new("RGBA", (W, 768), BROWN + (255,))
        page = Image.new("RGBA", (W, H), PAPER + (255,))
        img.alpha_composite(page, (0, 0))
        d = ImageDraw.Draw(img)
        # Rand und Buchfalz (Schatten in der Mitte)
        d.rectangle([0, 0, W - 1, H - 1], outline=PAPER_DARK, width=6)
        for k in range(18):
            c = tuple(int(PAPER[j] - (18 - k) * 3) for j in range(3))
            d.line([W // 2 - 18 + k, 0, W // 2 - 18 + k, H], fill=c)
            d.line([W // 2 + 18 - k, 0, W // 2 + 18 - k, H], fill=c)
        lt = render_page(d, img, 0, left, i * 2 + 1)
        rt = render_page(d, img, PAGE_W, right, i * 2 + 2)
        img.save(os.path.join(TEX_DIR, f"p{i}.png"))
        texts.append("\n".join(lt) + "\n\n" + "\n".join(rt))
    with open(TEXT_JS, "w", encoding="utf-8") as f:
        f.write("// Automatisch erzeugt von tools/guide.py – nicht von Hand bearbeiten.\n")
        f.write("/** Textfassung des Handbuchs (eine Doppelseite pro Eintrag). */\n")
        f.write("export const GUIDE_PAGES = " + json.dumps(texts, ensure_ascii=False, indent=2) + ";\n")
    return len(PAGES)


if __name__ == "__main__":
    print("Seiten:", render_all())
