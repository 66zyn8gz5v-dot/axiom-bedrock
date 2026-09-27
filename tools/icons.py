# 16x16-Pixel-Icons für die Axiom-Werkzeuge (ASCII-Art, ein Zeichen = ein Pixel).
# Die dunkle Umrandung wird beim Bauen automatisch um jede Form gezogen (siehe outline() in build.py),
# daher enthalten die Zeichnungen nur die Füllfarben mit Licht (hell) und Schatten (dunkel).
PALETTE = {
    ".": None,
    "k": (27, 27, 47),  # Umriss
    "w": (255, 255, 255),
    "x": (205, 150, 95),  # Holz Licht
    "b": (160, 104, 52),  # Holz
    "B": (100, 62, 28),  # Holz Schatten
    "h": (230, 185, 255),  # Lila Licht
    "p": (190, 90, 240),  # Lila
    "P": (110, 40, 160),  # Lila Schatten
    "l": (205, 250, 255),  # Cyan Licht
    "c": (90, 220, 240),  # Cyan
    "C": (30, 140, 170),  # Cyan Schatten
    "q": (255, 247, 170),  # Gelb Licht
    "y": (255, 220, 70),  # Gelb
    "Y": (200, 150, 0),  # Gelb Schatten
    "n": (240, 240, 250),  # Metall Licht
    "g": (190, 190, 205),  # Metall
    "G": (110, 110, 125),  # Metall Schatten
    "m": (255, 160, 160),  # Rot Licht
    "r": (235, 80, 80),  # Rot
    "R": (150, 30, 30),  # Rot Schatten
    "v": (170, 235, 130),  # Grün Licht
    "e": (100, 200, 80),  # Grün
    "E": (45, 120, 40),  # Grün Schatten
    "i": (255, 210, 140),  # Orange Licht
    "o": (245, 160, 60),  # Orange
    "O": (170, 95, 20),  # Orange Schatten
    "a": (170, 200, 255),  # Blau Licht
    "u": (80, 130, 235),  # Blau
    "U": (35, 65, 160),  # Blau Schatten
    "d": (140, 100, 65),  # Erde
    "D": (95, 65, 40),  # Erde Schatten
    "s": (150, 150, 150),  # Stein
    "S": (100, 100, 100),  # Stein Schatten
}

ICONS = {
    # Lila Kristallkugel mit „A“ auf goldenem Sockel
    "menu": [
        "................",
        ".....hhhhp......",
        "...hhpppppppp...",
        "..hhppwwwpppPP..",
        "..hpppwppwppPP..",
        ".hppppwppwpppPP.",
        ".hppppwwwwpppPP.",
        ".pppppwppwppPPP.",
        ".pppppwppwpPPPP.",
        "..ppppppppPPPP..",
        "..PpppppPPPPPP..",
        "...PPPPPPPPPP...",
        ".....qyyyyY.....",
        "....qyyyyyyY....",
        "....YYYYYYYY....",
        "................",
    ],
    # Auswahlrahmen mit markierten Ecken und Zeiger
    "box_select": [
        "................",
        ".lll.cc.cc.lll..",
        ".lcc.......ccC..",
        ".lc.........cC..",
        "................",
        ".c...........c..",
        ".c...........c..",
        "................",
        ".c...........c..",
        ".lc....nn...cC..",
        ".lcC..ngG..ccC..",
        ".CCC.ngG.C.CCC..",
        "....xbB.........",
        "...xbB..........",
        "..xbB...........",
        "................",
    ],
    # Zauberstab mit Stern
    "magic_select": [
        "................",
        "..........q.....",
        ".........qyY....",
        "......qqqywyyY..",
        ".......qyyyyY...",
        "........qyYyY...",
        "........yY.yY...",
        ".......hp.......",
        "......hpP.......",
        ".....xbB........",
        "....xbB.........",
        "...xbB..........",
        "..xbB...........",
        ".xbB............",
        ".bB.............",
        "................",
    ],
    # Pinsel mit Cyan-Borsten
    "brush_select": [
        "................",
        "...........l....",
        "..........lcl...",
        ".........lccC...",
        "........lcccC...",
        ".......lcccC....",
        "......ngGCC.....",
        ".....ngG........",
        "....xbB.........",
        "...xbB..........",
        "..xbB...........",
        ".xbB........c...",
        ".bB.......c.....",
        "........c.......",
        "................",
        "................",
    ],
    # Hammer
    "builder": [
        "................",
        "...nnnnnnnng....",
        "..nggggggggGG...",
        "..ngggggggGGG...",
        "..gGGGGGGGGGG...",
        "......xbB.......",
        "......xbB.......",
        "......xbB.......",
        "......xbB.......",
        "......xbB.......",
        "......xbB.......",
        "......xbB.......",
        "......xbB.......",
        "......bBB.......",
        "................",
        "................",
    ],
    # Kugel + Würfel
    "shape": [
        "................",
        "...aauuu........",
        "..awauuuuU......",
        ".auwauuuuuU.....",
        ".auauuuuuuU.....",
        ".uuuuuuuuUU.....",
        ".uuuuuuuUUU.....",
        "..uuuuuiiiiiio..",
        "..UuuUUioooooO..",
        "...UUUUioooooO..",
        ".......ioooooO..",
        ".......ioooooO..",
        ".......ioooOOO..",
        ".......OOOOOOO..",
        "................",
        "................",
    ],
    # Kelle über Erdhügel
    "sculpt": [
        "................",
        "...........nn...",
        "..........nggG..",
        ".........nggGG..",
        "........nggGG...",
        ".......nggGG....",
        "........GG......",
        "......xbB.......",
        ".....xbB........",
        "....xbB.........",
        "...xbB..........",
        "..bB............",
        ".......xddd.....",
        ".....xdddddDD...",
        "...xdddDDdddDD..",
        "................",
    ],
    # Pinsel mit roter Farbe und Tropfen
    "painter": [
        "................",
        "...........mr...",
        "..........mrrR..",
        ".........mrrrR..",
        "........mrrrR...",
        ".......nggRR....",
        "......ngG.......",
        ".....xbB........",
        "....xbB.........",
        "...xbB..........",
        "..xbB.......m...",
        ".xbB.......mrR..",
        ".bB........rrR..",
        "............R...",
        "................",
        "................",
    ],
    # Berg mit Gras, Erde, Stein
    "terrain": [
        "................",
        "................",
        ".....vv.........",
        "....veeE........",
        "...veddEE.......",
        "..veddddEE.vv...",
        ".veddddddEveeE..",
        ".eddddDDddddddE.",
        ".ddddDDDDDddddd.",
        ".dDDDDsDDDDDddd.",
        ".DDDssssDDDDDDd.",
        ".DsssssssDDDDDD.",
        ".ssssSSsssssDDD.",
        ".sSSSSSSSSSssss.",
        "................",
        "................",
    ],
    # Block mit Pfeil nach oben
    "extrude": [
        "................",
        ".......qy.......",
        "......qyyY......",
        ".....qyyyyY.....",
        "....qyyyyyyY....",
        ".......yY.......",
        ".......yY.......",
        "................",
        "..vvvvvvvvvvve..",
        "..eeeeeeeeeeeE..",
        "..dddddddddddD..",
        "..ddDddddDdddD..",
        "..dddddDddddDD..",
        "..DDDDDDDDDDDD..",
        "................",
        "................",
    ],
    # Kurvenpfad zwischen zwei Punkten
    "path": [
        "................",
        "...........qy...",
        "..........qyyY..",
        "..........yyYY..",
        "...........YY...",
        "..........o.....",
        ".........o......",
        "........o.......",
        ".......o........",
        "......o.........",
        ".....o..........",
        "...qy...........",
        "..qyyY..........",
        "..yyYY..........",
        "...YY...........",
        "................",
    ],
    # Großes T
    "text": [
        "................",
        "................",
        ".lllllllllllllc.",
        ".lcccccccccccCC.",
        ".CCCCCccccCCCCC.",
        "......lccC......",
        "......lccC......",
        "......lccC......",
        "......lccC......",
        "......lccC......",
        "......lccC......",
        "......lccC......",
        ".....lcccCC.....",
        ".....CCCCCC.....",
        "................",
        "................",
    ],
    # Lineal mit Strichen
    "ruler": [
        "................",
        "...........qy...",
        "..........qyyY..",
        ".........qOyyY..",
        "........qyyyY...",
        ".......qOyyY....",
        "......qyyyY.....",
        ".....qOyyY......",
        "....qyyyY.......",
        "...qOyyY........",
        "..qyyyY.........",
        "..yyyY..........",
        "..YYY...........",
        "................",
        "................",
        "................",
    ],
    # Schraubenschlüssel
    "tinker": [
        "................",
        "...........ng...",
        "..........ng....",
        ".........ngG.nG.",
        ".........nggngG.",
        "........nggggG..",
        ".......nggGGG...",
        "......nggG......",
        ".....nggG.......",
        "....nggG........",
        "...nggG.........",
        "..nggG..........",
        "..ngG...........",
        "..GG............",
        "................",
        "................",
    ],
    # Spitzhacke mit Warnstreifen
    "bulldozer": [
        "................",
        "....qyyyyyyY....",
        "..qyySSyySSyyY..",
        ".qyY...xb...yyY.",
        ".yY....xbB...yY.",
        ".Y.....xbB....Y.",
        ".......xbB......",
        ".......xbB......",
        ".......xbB......",
        ".......xbB......",
        ".......xbB......",
        ".......xbB......",
        ".......bBB......",
        "................",
        "................",
        "................",
    ],
    # Runder Pfeil (Rückgängig)
    "undo": [
        "................",
        "................",
        "......lccccC....",
        ".....lcCCCCcC...",
        "...l.cC....CcC..",
        "..lc.cC.....CcC.",
        ".lcccccC....CcC.",
        "..lcccC.....CcC.",
        "...lcC......CcC.",
        "....C......CcC..",
        "..........CcC...",
        ".......lcccC....",
        ".......CCCC.....",
        "................",
        "................",
        "................",
    ],
}
