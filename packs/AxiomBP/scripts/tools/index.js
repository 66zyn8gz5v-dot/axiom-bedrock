// Liste aller Werkzeuge (Reihenfolge = Reihenfolge im Menü).
import { boxSelect, magicSelect, brushSelect } from "./select.js";
import { shapeTool } from "./shape.js";
import { sculptTool } from "./sculpt.js";
import { painterTool } from "./painter.js";
import { terrainTool } from "./terrain.js";
import { extrudeTool } from "./extrude.js";
import { pathTool, textTool } from "./path.js";
import { builderTool } from "./builder.js";
import { rulerTool, tinkerTool, bulldozerTool, undoTool } from "./misc.js";
import { mainMenu } from "../ui/main.js";

/** @type {import("./registry.js").Tool} */
export const menuTool = {
  id: "axiom:menu",
  name: "Axiom-Menü",
  noSneakMenu: true,
  help: "Benutzen: Hauptmenü öffnen (Werkzeuge, Auswahl, Zwischenablage, Verlauf, Fähigkeiten, Welt …).",
  onUse: (ses) => mainMenu(ses),
  hud: () => "Benutzen: Axiom-Menü öffnen",
};

/** @type {import("./registry.js").Tool[]} */
export const TOOL_LIST = [
  menuTool,
  boxSelect,
  magicSelect,
  brushSelect,
  builderTool,
  shapeTool,
  sculptTool,
  painterTool,
  terrainTool,
  extrudeTool,
  pathTool,
  textTool,
  rulerTool,
  tinkerTool,
  bulldozerTool,
  undoTool,
];

/** @type {Map<string, import("./registry.js").Tool>} */
export const TOOLS = new Map(TOOL_LIST.map((t) => [t.id, t]));
