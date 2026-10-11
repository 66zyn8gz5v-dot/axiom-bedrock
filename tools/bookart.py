"""Grafik-Bausteine für das Handbuch: Block-Texturen, isometrische 3D-Szenen und Buch-Verzierungen.

Die Blöcke nutzen die Original-Texturen aus dem Vanilla-Ressourcenpaket (Mojang/bedrock-samples, in tools/vanilla);
Szenen und Verzierungen werden daraus prozedural zusammengesetzt.
"""
import math
import os
import random

from PIL import Image, ImageDraw

# ---------------------------------------------------------------------------
# Block-Texturen (16×16)
# ---------------------------------------------------------------------------


def _noise_tex(base, var, seed, specks=None):
    rnd = random.Random(seed)
    img = Image.new("RGBA", (16, 16))
    for y in range(16):
        for x in range(16):
            d = rnd.randint(-var, var)
            c = tuple(max(0, min(255, base[i] + d)) for i in range(3))
            img.putpixel((x, y), c + (255,))
    if specks:
        for col, n in specks:
            for _ in range(n):
                img.putpixel((rnd.randrange(16), rnd.randrange(16)), col + (255,))
    return img


VANILLA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vanilla")


def _v(name, tint=None):
    """Original-Textur aus dem Vanilla-Ressourcenpaket (tools/vanilla, aus Mojang/bedrock-samples)."""
    img = Image.open(os.path.join(VANILLA, name)).convert("RGBA")
    img = img.crop((0, 0, 16, 16))  # animierte Texturen: erstes Bild
    if tint:
        px = img.load()
        for y in range(16):
            for x in range(16):
                r, g, b, a = px[x, y]
                px[x, y] = (r * tint[0] // 255, g * tint[1] // 255, b * tint[2] // 255, a)
    return img


def _opaque(img, bg):
    """Löcher (z.B. bei Laub) mit dunkler Farbe füllen, damit die Szene nicht durchscheint."""
    out = Image.new("RGBA", img.size, bg + (255,))
    out.alpha_composite(img)
    return out


def _water():
    img = _v("water_still_grey.png", (68, 120, 228))
    img.putalpha(190)
    return img


TEX = {
    "grass": (_v("grass_carried.png"), _v("grass_side_carried.png")),
    "dirt": (_v("dirt.png"),) * 2,
    "stone": (_v("stone.png"),) * 2,
    "cobble": (_v("cobblestone.png"),) * 2,
    "planks": (_v("planks_oak.png"),) * 2,
    "dark": (_v("planks_spruce.png"),) * 2,
    "roof": (_v("planks_big_oak.png"),) * 2,
    "bricks": (_v("brick.png"),) * 2,
    "glass": (_v("glass.png"),) * 2,
    "water": (_water(),) * 2,
    "sand": (_v("sand.png"),) * 2,
    "gold": (_v("gold_block.png"),) * 2,
    "quartz": (_v("quartz_block_side.png"),) * 2,
    "leaves": (_opaque(_v("leaves_oak_carried.tga"), (40, 82, 24)),) * 2,
    "log": (_v("log_oak_top.png"), _v("log_oak.png")),
    "red": (_v("wool_colored_red.png"),) * 2,
    "purple": (_v("purpur_block.png"),) * 2,
}

# ---------------------------------------------------------------------------
# Isometrischer Renderer
# ---------------------------------------------------------------------------


def _shade(img, f):
    px = img.load()
    out = Image.new("RGBA", img.size)
    po = out.load()
    for y in range(img.size[1]):
        for x in range(img.size[0]):
            r, g, b, a = px[x, y]
            po[x, y] = (int(r * f), int(g * f), int(b * f), a)
    return out


def _face(draw, tex, o, a, b):
    """Textur als Parallelogramm zeichnen: Ursprung o, Kanten a (u-Richtung) und b (v-Richtung)."""
    px = tex.load()
    n = tex.size[0]
    for j in range(n):
        for i in range(n):
            c = px[i, j]
            if c[3] == 0:
                continue
            p0 = (o[0] + a[0] * i / n + b[0] * j / n, o[1] + a[1] * i / n + b[1] * j / n)
            p1 = (p0[0] + a[0] / n, p0[1] + a[1] / n)
            p2 = (p1[0] + b[0] / n, p1[1] + b[1] / n)
            p3 = (p0[0] + b[0] / n, p0[1] + b[1] / n)
            draw.polygon([p0, p1, p2, p3], fill=c)


def render_scene(blocks, u=12, pad=6, extra=None):
    """blocks: Liste (x, y, z, typ). Gibt ein RGBA-Bild zurück (Hintergrund transparent).
    extra(draw, P): optionale Funktion, die mit der Projektion P(x,y,z) Overlays zeichnet."""
    occupied = {(x, y, z): t for x, y, z, t in blocks}
    ex, ey, ez = (u, u / 2), (0, -u), (-u, u / 2)

    def P(x, y, z):
        return (x * ex[0] + y * ey[0] + z * ez[0], x * ex[1] + y * ey[1] + z * ez[1])

    xs, ys = [], []
    for x, y, z, _ in blocks:
        for dx in (0, 1):
            for dy in (0, 1):
                for dz in (0, 1):
                    p = P(x + dx, y + dy, z + dz)
                    xs.append(p[0])
                    ys.append(p[1])
    minx, miny = min(xs) - pad, min(ys) - pad
    W, H = int(max(xs) - minx + pad), int(max(ys) - miny + pad)
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    def Q(x, y, z):
        p = P(x, y, z)
        return (p[0] - minx, p[1] - miny)

    shaded = {}
    n = max(4, min(16, int(u)))
    for x, y, z, t in sorted(blocks, key=lambda b: (b[0] + b[1] + b[2], b[1], b[0])):
        if (t, "t") not in shaded:
            top, side = (im.resize((n, n), Image.BOX) for im in TEX[t])
            shaded[(t, "t")] = top
            shaded[(t, "l")] = _shade(side, 0.82)
            shaded[(t, "r")] = _shade(side, 0.64)
        top = shaded[(t, "t")]
        transparent = t in ("glass", "water")
        nb = lambda dx, dy, dz: occupied.get((x + dx, y + dy, z + dz))  # noqa: E731
        hide = lambda n: n is not None and (n not in ("glass", "water") or n == t)  # noqa: E731
        if not hide(nb(0, 1, 0)) or transparent:
            _face(d, top, Q(x, y + 1, z), ex, ez)
        if not hide(nb(0, 0, 1)) or transparent:
            _face(d, shaded[(t, "l")], Q(x, y + 1, z + 1), ex, (0, u))
        if not hide(nb(1, 0, 0)) or transparent:
            _face(d, shaded[(t, "r")], Q(x + 1, y + 1, z), ez, (0, u))
    img.alpha_composite(layer)
    if extra:
        extra(ImageDraw.Draw(img), Q)
    return img


def scene(name, u=None):
    """Fertige Szenen für das Handbuch (u = Kantenlänge eines Blocks in Pixeln)."""
    B = []
    if name == "selection":
        for x in range(4):
            for z in range(4):
                B.append((x, 0, z, "grass"))
        for x, y, z in [(1, 1, 1), (2, 1, 1), (1, 1, 2), (2, 1, 2), (1, 2, 1), (2, 2, 2)]:
            B.append((x, y, z, "stone"))

        def extra(d, Q):
            a, b = (1, 1, 1), (3, 3, 3)
            corners = [(x, y, z) for x in (a[0], b[0]) for y in (a[1], b[1]) for z in (a[2], b[2])]
            for p in corners:
                for q in corners:
                    if sum(p[i] != q[i] for i in range(3)) == 1 and p < q:
                        n = 14
                        for k in range(n + 1):
                            s = [p[i] + (q[i] - p[i]) * k / n for i in range(3)]
                            pt = Q(*s)
                            d.rectangle([pt[0] - 2, pt[1] - 2, pt[0] + 2, pt[1] + 2], fill=(250, 90, 250))
            for p, c in ((Q(1, 1, 3), (70, 230, 70)), (Q(3, 3, 1), (80, 150, 255))):
                d.rectangle([p[0] - 6, p[1] - 6, p[0] + 6, p[1] + 6], fill=c, outline=(20, 20, 30), width=2)

        return render_scene(B, u=u or 11, extra=extra)
    if name == "house":
        for x in range(-1, 7):
            for z in range(-1, 6):
                B.append((x, 0, z, "grass"))
        for x in range(0, 6):
            for z in range(0, 5):
                for y in range(1, 4):
                    edge = x in (0, 5) or z in (0, 4)
                    if not edge:
                        continue
                    t = "log" if x in (0, 5) and z in (0, 4) else "planks"
                    if y == 2 and ((z == 4 and x in (1, 4)) or (x == 5 and z == 2)):
                        t = "glass"
                    if z == 4 and x == 2 and y in (1, 2):
                        continue
                    B.append((x, y, z, t))
        for k in range(3):
            for x in range(-1, 7):
                for z in (k - 1, 5 - k):
                    if z <= 5 - k:
                        B.append((x, 4 + k, z, "roof"))
        for x in range(0, 6):
            for k in range(1, 3):
                for z in range(k, 5 - k):
                    if x in (0, 5):
                        B.append((x, 3 + k, z, "planks"))
        return render_scene(B, u=u or 9)
    if name == "terrain":
        for x in range(8):
            for z in range(6):
                h = int(2.5 + 2.2 * math.sin(x / 2.2) * math.cos(z / 2.6) + (x == 3 and z == 2) * 1)
                for y in range(max(1, h)):
                    t = "grass" if y == h - 1 else ("dirt" if y >= h - 2 else "stone")
                    B.append((x, y, z, t))
        B += [(6, y, 4, "log") for y in range(2, 5)]
        for dx in (-1, 0, 1):
            for dz in (-1, 0, 1):
                B.append((6 + dx, 5, 4 + dz, "leaves"))
        B.append((6, 6, 4, "leaves"))
        return render_scene(B, u=u or 9)
    if name == "bridge":
        # Fluss in x-Richtung, Brücke führt quer darüber (z)
        for x in range(8):
            for z in range(7):
                if 2 <= z <= 4:
                    B.append((x, 0, z, "sand"))
                    B.append((x, 1, z, "water"))
                else:
                    B.append((x, 0, z, "dirt"))
                    B.append((x, 1, z, "grass"))
        for z in range(7):
            y = 2 if z in (0, 6) else 3
            for x in (3, 4):
                B.append((x, y, z, "planks"))
            if 1 <= z <= 5:
                B.append((2, y + 1, z, "dark"))
                B.append((5, y + 1, z, "dark"))
        for x in (3, 4):
            B.append((x, 2, 3, "cobble"))
        return render_scene(B, u=u or 9)
    if name == "heart":
        # Pixel-Art von vorne: Wand aus Quarz mit rotem Herz (flach, damit man das Bild erkennt)
        rows = [".........", ".XX...XX.", "XWXX.XXXX", "XXXXXXXXX", ".XXXXXXX.", "..XXXXX..", "...XXX...",
                "....X...."]
        u = u or 9
        img = Image.new("RGBA", (9 * u + 4, 8 * u + 4), (60, 40, 25, 255))
        for r, row in enumerate(rows):
            for c, ch in enumerate(row):
                t = {"X": "red", "W": "quartz"}.get(ch, "quartz")
                tex = TEX[t][0].resize((u, u), Image.BOX)
                if ch == ".":
                    tex = _shade(tex, 0.9)
                img.alpha_composite(tex, (2 + c * u, 2 + r * u))
        return img
    if name == "sphere":
        r = 3.3
        for x in range(-3, 4):
            for y in range(-3, 4):
                for z in range(-3, 4):
                    if x * x + y * y + z * z <= r * r:
                        B.append((x, y + 4, z, "gold" if (x + y + z) % 3 else "quartz"))
        for x in range(-4, 5):
            for z in range(-4, 5):
                B.append((x, 0, z, "grass"))
        return render_scene(B, u=u or 7)
    if name == "copy":
        for x in range(9):
            for z in range(3):
                B.append((x, 0, z, "grass"))
        for ox in (0, 6):
            for y in range(1, 5):
                B.append((ox + 1, y, 1, "bricks"))
            B.append((ox, 1, 1, "bricks"))
            B.append((ox + 2, 1, 1, "bricks"))
            B.append((ox + 1, 5, 1, "gold"))

        def extra(d, Q):
            a, b = Q(3.2, 4, 1.5), Q(5.6, 4, 1.5)
            d.line([a, b], fill=(250, 220, 60), width=7)
            d.polygon([(b[0] + 12, b[1] + 6), (b[0] - 10, b[1] - 12), (b[0] - 4, b[1] + 16)], fill=(250, 220, 60))

        return render_scene(B, u=u or 9, extra=extra)
    raise KeyError(name)


# ---------------------------------------------------------------------------
# Buch-Verzierungen
# ---------------------------------------------------------------------------
GOLD = (222, 178, 70)
GOLD_DARK = (150, 105, 35)


def parchment(w, h, seed=1):
    """Pergament mit Flecken, dunklerem Rand und leichter Maserung."""
    rnd = random.Random(seed)
    img = Image.new("RGBA", (w, h), (243, 230, 200, 255))
    px = img.load()
    for y in range(h):
        for x in range(w):
            dx = min(x, w - 1 - x) / (w / 2)
            dy = min(y, h - 1 - y) / (h / 2)
            edge = max(0.0, 1 - min(dx, dy) * 6)
            n = rnd.randint(-6, 6)
            r, g, b, _ = px[x, y]
            k = edge * 38
            px[x, y] = (int(r - k + n), int(g - k * 1.15 + n), int(b - k * 1.5 + n), 255)
    d = ImageDraw.Draw(img)
    for _ in range(int(w * h / 900)):
        x, y = rnd.randrange(w), rnd.randrange(h)
        r = rnd.randint(1, 2)
        d.ellipse([x - r, y - r, x + r, y + r], fill=(228, 210, 172, 255))
    return img


def banner(d, cx, y, text, font, width_pad=14, color=(118, 52, 168)):
    """Überschrift auf einem Stoffbanner mit eingekerbten Enden."""
    tw = d.textlength(text, font=font)
    w = tw + width_pad * 2
    x0, x1 = cx - w / 2, cx + w / 2
    h = 18
    dark = tuple(int(c * 0.65) for c in color)
    # Enden
    for sx, dirn in ((x0, -1), (x1, 1)):
        tip = sx + dirn * 10
        d.polygon([(sx, y + 4), (tip, y + 4), (tip - dirn * 4, y + 4 + h / 2), (tip, y + 4 + h), (sx, y + 4 + h)], fill=dark)
    d.rectangle([x0, y, x1, y + h], fill=color)
    d.line([x0, y + 1, x1, y + 1], fill=tuple(min(255, c + 50) for c in color))
    d.line([x0, y + h, x1, y + h], fill=dark)
    d.text((cx - tw / 2 + 1, y + 3), text, font=font, fill=(40, 15, 55))
    d.text((cx - tw / 2, y + 2), text, font=font, fill=(255, 245, 220))
    return h + 8


def slot(img, x, y, icon, size=24):
    """Inventar-Slot wie in Minecraft mit Icon."""
    d = ImageDraw.Draw(img)
    d.rectangle([x, y, x + size, y + size], fill=(139, 139, 139))
    d.line([x, y, x + size, y], fill=(55, 55, 55))
    d.line([x, y, x, y + size], fill=(55, 55, 55))
    d.line([x + size, y, x + size, y + size], fill=(255, 255, 255))
    d.line([x, y + size, x + size, y + size], fill=(255, 255, 255))
    ic = icon.resize((size - 4, size - 4), Image.NEAREST)
    img.alpha_composite(ic, (x + 2, y + 2))


def mc_button(d, x, y, label, font):
    """Grauer Minecraft-Knopf."""
    w = d.textlength(label, font=font) + 10
    d.rectangle([x, y, x + w, y + 13], fill=(110, 110, 110), outline=(20, 20, 20))
    d.line([x + 1, y + 1, x + w - 1, y + 1], fill=(170, 170, 170))
    d.line([x + 1, y + 12, x + w - 1, y + 12], fill=(70, 70, 70))
    d.text((x + 6, y + 2), label, font=font, fill=(40, 40, 40))
    d.text((x + 5, y + 1), label, font=font, fill=(255, 255, 255))
    return w


def gem(d, x, y, n, font, color=(118, 52, 168)):
    """Nummerierter Edelstein als Aufzählungszeichen."""
    pts = [(x + 6, y), (x + 12, y + 6), (x + 6, y + 12), (x, y + 6)]
    d.polygon(pts, fill=color, outline=(40, 15, 55))
    d.line([(x + 6, y + 1), (x + 10, y + 5)], fill=(210, 170, 240))
    s = str(n)
    tw = d.textlength(s, font=font)
    d.text((x + 6 - tw / 2, y + 1), s, font=font, fill=(255, 255, 255))


def corner(d, x, y, fx, fy):
    """Kleine goldene Eckverzierung (fx/fy = ±1 für die Spiegelung)."""
    pts = [(0, 0), (9, 0), (9, 1), (2, 1), (2, 2), (1, 2), (1, 9), (0, 9)]
    d.polygon([(x + px * fx, y + py * fy) for px, py in pts], fill=GOLD)
    d.point([(x + 4 * fx, y + 4 * fy)], fill=GOLD)
    d.point([(x + 5 * fx, y + 4 * fy), (x + 4 * fx, y + 5 * fy)], fill=GOLD_DARK)
