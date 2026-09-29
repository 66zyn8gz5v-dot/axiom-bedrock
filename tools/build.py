#!/usr/bin/env python3
"""Erzeugt Item-Definitionen, Texturen, Sprachdateien, Partikel und das fertige .mcaddon.

Aufruf:  python3 tools/build.py
Ergebnis: dist/AxiomBedrock.mcaddon (enthält Verhaltens- und Ressourcenpaket)
"""
import json
import os
import sys
import zipfile

from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from icons import ICONS, PALETTE  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BP = os.path.join(ROOT, "packs", "AxiomBP")
RP = os.path.join(ROOT, "packs", "AxiomRP")
DIST = os.path.join(ROOT, "dist")

# (Kurzname, Deutsch, Englisch, Pinsel?)  – Reihenfolge wie im Spiel-Menü
TOOLS = [
    ("menu", "Axiom-Menü", "Axiom Menu", False),
    ("box_select", "Box-Auswahl", "Box Select", False),
    ("magic_select", "Magische Auswahl", "Magic Select", False),
    ("brush_select", "Pinsel-Auswahl", "Brush Select", True),
    ("builder", "Baumeister (Einfügen)", "Builder (Paste)", False),
    ("shape", "Formen", "Shapes", False),
    ("sculpt", "Modellieren", "Sculpt", True),
    ("painter", "Maler", "Painter", True),
    ("terrain", "Terrain", "Terrain", True),
    ("extrude", "Extrudieren", "Extrude", False),
    ("path", "Pfad", "Path", False),
    ("text", "Text", "Text", False),
    ("ruler", "Lineal", "Ruler", False),
    ("tinker", "Blockzustand-Editor", "Block State Editor", False),
    ("bulldozer", "Bulldozer", "Bulldozer", True),
    ("entity", "Kreaturen", "Entities", False),
    ("undo", "Rückgängig", "Undo", False),
]

PARTICLES = {
    "sel": ((0.95, 0.35, 0.95), 0.07, 0.55),
    "sel_block": ((0.35, 0.95, 1.0), 0.09, 0.55),
    "pos1": ((0.3, 1.0, 0.3), 0.12, 0.55),
    "pos2": ((0.3, 0.55, 1.0), 0.12, 0.55),
    "marker": ((1.0, 0.85, 0.2), 0.09, 0.55),
    "sym": ((1.0, 0.4, 0.3), 0.08, 0.55),
}


def write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


def outline(rows):
    """Zieht eine dunkle Umrandung um alle gefüllten Pixel (4er-Nachbarschaft)."""
    grid = [list(r) for r in rows]
    out = [r[:] for r in grid]
    for y in range(16):
        for x in range(16):
            if grid[y][x] != ".":
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < 16 and 0 <= ny < 16 and grid[ny][nx] not in (".", "k"):
                    out[y][x] = "k"
                    break
    return ["".join(r) for r in out]


def icon_image(name):
    rows = ICONS[name]
    assert len(rows) == 16, f"{name}: {len(rows)} Zeilen"
    for y, row in enumerate(rows):
        assert len(row) == 16, f"{name} Zeile {y}: {len(row)} Zeichen"
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    for y, row in enumerate(outline(rows)):
        for x, ch in enumerate(row):
            col = PALETTE[ch]
            if col:
                img.putpixel((x, y), col + (255,))
    return img


def build_items():
    items_dir = os.path.join(BP, "items")
    for name, _de, _en, brush in TOOLS:
        comps = {
            "minecraft:icon": {"textures": {"default": f"axiom_{name}"}},
            "minecraft:display_name": {"value": f"item.axiom:{name}.name"},
            "minecraft:max_stack_size": 1,
            "minecraft:hand_equipped": True,
            "minecraft:can_destroy_in_creative": False,
        }
        if brush:
            # Ermöglicht "gedrückt halten" (itemStartUse/itemStopUse) für Pinsel-Werkzeuge
            comps["minecraft:use_modifiers"] = {"use_duration": 3600, "movement_modifier": 1.0}
        if name == "menu":
            comps["minecraft:glint"] = True
        write_json(
            os.path.join(items_dir, f"{name}.json"),
            {
                "format_version": "1.21.60",
                "minecraft:item": {
                    "description": {"identifier": f"axiom:{name}", "menu_category": {"category": "equipment"}},
                    "components": comps,
                },
            },
        )


def build_textures():
    tex_dir = os.path.join(RP, "textures", "items")
    os.makedirs(tex_dir, exist_ok=True)
    data = {}
    for name, *_ in TOOLS:
        icon_image(name).save(os.path.join(tex_dir, f"axiom_{name}.png"))
        data[f"axiom_{name}"] = {"textures": f"textures/items/axiom_{name}"}
    write_json(
        os.path.join(RP, "textures", "item_texture.json"),
        {"resource_pack_name": "axiom", "texture_name": "atlas.items", "texture_data": data},
    )
    # Partikel-Punkt (weiß, wird eingefärbt)
    pdir = os.path.join(RP, "textures", "particle")
    os.makedirs(pdir, exist_ok=True)
    dot = Image.new("RGBA", (4, 4), (255, 255, 255, 255))
    dot.save(os.path.join(pdir, "axiom_dot.png"))
    # Pack-Icons: Menü-Icon groß auf dunklem Grund
    big = icon_image("menu").resize((112, 112), Image.NEAREST)
    pack = Image.new("RGBA", (128, 128), (32, 24, 48, 255))
    pack.alpha_composite(big, (8, 8))
    pack.save(os.path.join(BP, "pack_icon.png"))
    pack.save(os.path.join(RP, "pack_icon.png"))


def build_particles():
    for name, (col, size, life) in PARTICLES.items():
        write_json(
            os.path.join(RP, "particles", f"{name}.json"),
            {
                "format_version": "1.10.0",
                "particle_effect": {
                    "description": {
                        "identifier": f"axiom:{name}",
                        "basic_render_parameters": {"material": "particles_alpha", "texture": "textures/particle/axiom_dot"},
                    },
                    "components": {
                        "minecraft:emitter_rate_instant": {"num_particles": 1},
                        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
                        "minecraft:emitter_shape_point": {"offset": [0, 0, 0]},
                        "minecraft:particle_lifetime_expression": {"max_lifetime": life},
                        "minecraft:particle_appearance_billboard": {
                            "size": [size, size],
                            "facing_camera_mode": "lookat_xyz",
                            "uv": {"texture_width": 4, "texture_height": 4, "uv": [0, 0], "uv_size": [4, 4]},
                        },
                        "minecraft:particle_appearance_tinting": {"color": [col[0], col[1], col[2], 1.0]},
                    },
                },
            },
        )


def build_lang():
    tdir = os.path.join(RP, "texts")
    os.makedirs(tdir, exist_ok=True)
    write_json(os.path.join(tdir, "languages.json"), ["de_DE", "en_US", "en_GB"])
    for lang, idx in (("de_DE", 1), ("en_US", 2), ("en_GB", 2)):
        lines = [f"pack.name=Axiom Bedrock", "pack.description=Axiom-like building tools"]
        for t in TOOLS:
            lines.append(f"item.axiom:{t[0]}.name={t[idx]}")
        with open(os.path.join(tdir, f"{lang}.lang"), "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")


def zip_dir(zf, folder, arc_root):
    for base, _dirs, files in os.walk(folder):
        for fn in sorted(files):
            full = os.path.join(base, fn)
            rel = os.path.relpath(full, folder)
            zf.write(full, os.path.join(arc_root, rel))


def package():
    os.makedirs(DIST, exist_ok=True)
    out = os.path.join(DIST, "AxiomBedrock.mcaddon")
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        zip_dir(zf, BP, "AxiomBP")
        zip_dir(zf, RP, "AxiomRP")
    # Einzelpakete (für Tools, die nur .mcpack können)
    for folder, name in ((BP, "AxiomBP.mcpack"), (RP, "AxiomRP.mcpack")):
        with zipfile.ZipFile(os.path.join(DIST, name), "w", zipfile.ZIP_DEFLATED) as zf:
            zip_dir(zf, folder, "")
    return out


if __name__ == "__main__":
    build_items()
    build_textures()
    build_particles()
    build_lang()
    print("Fertig:", package())
