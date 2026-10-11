// Axiom-Handbuch: ein 3D-Buch, das vor dem Spieler aufklappt und sich umblättern lässt.
// Die Seiten sind Texturen (tools/guide.py); welche angezeigt wird, steuert die Eigenschaft „axiom:page“.
import { world, system, Player } from "@minecraft/server";
import { getSession } from "../core/state.js";
import { msg } from "../core/util.js";
import { v } from "../core/vec.js";
import { menu } from "./forms.js";
import { GUIDE_PAGES } from "./guide_pages.js";

export const GUIDE_ID = "axiom:guide";
export const PAGE_COUNT = GUIDE_PAGES.length;

/** @type {Map<string, import("@minecraft/server").Entity>} Spieler-ID -> offenes Buch */
const open = new Map();

/** @param {import("@minecraft/server").Player} p */
function bookOf(p) {
  const e = open.get(p.id);
  if (e && e.isValid) return e;
  open.delete(p.id);
  return undefined;
}

/** @param {import("@minecraft/server").Entity} e */
function getPage(e) {
  const v0 = e.getProperty("axiom:page");
  return typeof v0 === "number" ? v0 : 0;
}

/**
 * Buch vor dem Spieler aufklappen (oder ein offenes Buch zu ihm holen).
 * @param {import("@minecraft/server").Player} p
 */
export function openGuide(p) {
  const ses = getSession(p);
  const head = p.getHeadLocation();
  const d = p.getViewDirection();
  const l = Math.hypot(d.x, d.z) || 1;
  const pos = v(head.x + (d.x / l) * 2.2, head.y - 0.75, head.z + (d.z / l) * 2.2);
  const yaw = p.getRotation().y + 180;
  let book = bookOf(p);
  if (book) {
    book.teleport(pos);
    book.setRotation({ x: 0, y: yaw });
    return book;
  }
  book = p.dimension.spawnEntity(/** @type {any} */ (GUIDE_ID), pos);
  book.setRotation({ x: 0, y: yaw });
  book.setProperty("axiom:page", Math.min(PAGE_COUNT - 1, ses.guidePage ?? 0));
  open.set(p.id, book);
  try {
    p.playSound("item.book.page_turn");
  } catch {}
  msg(p, "Handbuch geöffnet – §eSchlagen§r oder §eBenutzen§r auf das Buch = umblättern, §eSchleichen + Schlagen§r = zurück.");
  return book;
}

/** @param {import("@minecraft/server").Player} p */
export function closeGuide(p) {
  const book = bookOf(p);
  if (!book) return false;
  getSession(p).guidePage = getPage(book);
  book.remove();
  open.delete(p.id);
  return true;
}

/**
 * Umblättern.
 * @param {import("@minecraft/server").Player} p
 * @param {import("@minecraft/server").Entity} book
 * @param {number} dir +1 vor, -1 zurück
 */
export function flip(p, book, dir) {
  const cur = getPage(book);
  const next = Math.max(0, Math.min(PAGE_COUNT - 1, cur + dir));
  if (next === cur) {
    msg(p, dir > 0 ? "Das war die letzte Seite. Buch benutzen = schließen." : "Du bist auf der ersten Seite.");
    return;
  }
  book.setProperty("axiom:page", next);
  getSession(p).guidePage = next;
  try {
    p.playSound("item.book.page_turn");
  } catch {}
}

/** @type {import("../tools/registry.js").Tool} */
export const guideTool = {
  id: "axiom:guide",
  name: "Axiom-Handbuch",
  noSneakMenu: true,
  help: "Benutzen: Handbuch vor dir aufklappen bzw. wieder schließen. Auf das Buch schlagen oder es benutzen = umblättern, Schleichen + Schlagen = zurückblättern.",
  onUse(ses) {
    const p = ses.player;
    const book = bookOf(p);
    if (book) {
      const bl = book.location;
      const pl = p.location;
      // Nah dran: schließen. Weit weg: zu mir holen.
      if (Math.hypot(bl.x - pl.x, bl.z - pl.z) < 8 || p.isSneaking) {
        closeGuide(p);
        msg(p, "Handbuch geschlossen.");
        return;
      }
    }
    openGuide(p);
  },
  onHit() {},
  hud: (ses) => (bookOf(ses.player) ? "Buch offen · Benutzen = schließen" : "Benutzen = Handbuch öffnen"),
};

// ---------- Ereignisse ----------
/** Wer welches Buch besitzt (für Umblättern durch andere Spieler egal – jeder darf blättern). */
export function registerGuideEvents() {
  world.afterEvents.entityHitEntity.subscribe((ev) => {
    const book = ev.hitEntity;
    const p = ev.damagingEntity;
    if (book.typeId !== GUIDE_ID || !(p instanceof Player)) return;
    flip(p, book, p.isSneaking ? -1 : 1);
  });
  world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
    if (ev.target.typeId !== GUIDE_ID) return;
    ev.cancel = true;
    const p = ev.player;
    const book = ev.target;
    system.run(() => {
      if (book.isValid) flip(p, book, p.isSneaking ? -1 : 1);
    });
  });
  // Aufräumen: Bücher von Spielern, die weg sind oder sich weit entfernt haben
  system.runInterval(() => {
    for (const [id, book] of open) {
      const p = world.getAllPlayers().find((x) => x.id === id);
      if (!book.isValid) {
        open.delete(id);
        continue;
      }
      const far = !p || p.dimension.id !== book.dimension.id || Math.hypot(p.location.x - book.location.x, p.location.z - book.location.z) > 48;
      if (far) {
        try {
          book.remove();
        } catch {}
        open.delete(id);
      }
    }
  }, 100);
  // Übrig gebliebene Bücher nach einem Neustart entfernen
  world.afterEvents.entityLoad.subscribe((ev) => {
    if (ev.entity.typeId === GUIDE_ID && ![...open.values()].includes(ev.entity)) {
      try {
        ev.entity.remove();
      } catch {}
    }
  });
}

/** Textfassung im Menü (falls man lieber liest oder das 3D-Buch nicht sieht). @param {import("@minecraft/server").Player} p @param {number} [i] */
export async function guideTextMenu(p, i = 0) {
  const n = PAGE_COUNT;
  /** @type {{text:string, run:()=>any}[]} */
  const buttons = [];
  if (i < n - 1) buttons.push({ text: "Weiter ▶", run: () => guideTextMenu(p, i + 1) });
  if (i > 0) buttons.push({ text: "◀ Zurück", run: () => guideTextMenu(p, i - 1) });
  buttons.push({ text: "Schließen", run: () => {} });
  await menu(p, `Axiom-Handbuch (${i + 1}/${n})`, GUIDE_PAGES[i], buttons);
}
