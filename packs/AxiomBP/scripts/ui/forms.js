// Kleine Helfer rund um @minecraft/server-ui, damit Menüs kompakt bleiben.
import { system } from "@minecraft/server";
import { ActionFormData, FormCancelationReason, ModalFormData } from "@minecraft/server-ui";

/**
 * Formular anzeigen; wartet, falls der Spieler gerade den Chat o.ä. offen hat.
 * @template {{cancelationReason?: string, canceled: boolean}} R
 * @param {import("@minecraft/server").Player} player
 * @param {{show:(p:import("@minecraft/server").Player)=>Promise<R>}} form
 * @returns {Promise<R|undefined>}
 */
export async function showForm(player, form) {
  for (let i = 0; i < 40; i++) {
    const r = await form.show(player);
    if (r.canceled && r.cancelationReason === FormCancelationReason.UserBusy) {
      await system.waitTicks(5);
      continue;
    }
    return r;
  }
  return undefined;
}

/**
 * Button-Menü: Einträge mit Aktion.
 * @param {import("@minecraft/server").Player} player
 * @param {string} title
 * @param {string} body
 * @param {{text:string, icon?:string, run:()=>any}[]} buttons
 * @returns {Promise<boolean>} ob etwas gewählt wurde
 */
export async function menu(player, title, body, buttons) {
  const f = new ActionFormData().title(title);
  if (body) f.body(body);
  for (const b of buttons) f.button(b.text, b.icon);
  const r = await showForm(player, f);
  if (!r || r.canceled || r.selection === undefined) return false;
  await buttons[r.selection].run();
  return true;
}

/** Ja/Nein-Abfrage. @param {import("@minecraft/server").Player} player @param {string} title @param {string} body */
export async function confirm(player, title, body) {
  let yes = false;
  await menu(player, title, body, [
    { text: "§aJa", run: () => (yes = true) },
    { text: "§cNein", run: () => (yes = false) },
  ]);
  return yes;
}

/**
 * Formular mit benannten Feldern.
 * Nutzung: const r = await new Modal("Titel").slider("radius","Radius",1,16,1,4).show(player)
 */
export class Modal {
  /** @param {string} title */
  constructor(title) {
    this.form = new ModalFormData().title(title);
    /** @type {{key:string, kind:string, options?:string[]}[]} */
    this.fields = [];
  }
  /** @param {string} key @param {string} label @param {number} min @param {number} max @param {number} step @param {number} def */
  slider(key, label, min, max, step, def) {
    this.form.slider(label, min, max, { valueStep: step, defaultValue: Math.min(max, Math.max(min, def)) });
    this.fields.push({ key, kind: "slider" });
    return this;
  }
  /** @param {string} key @param {string} label @param {boolean} def */
  toggle(key, label, def) {
    this.form.toggle(label, { defaultValue: !!def });
    this.fields.push({ key, kind: "toggle" });
    return this;
  }
  /**
   * Auswahlliste. options: [[wert, beschriftung], ...]
   * @param {string} key @param {string} label @param {[any, string][]} options @param {any} current
   */
  dropdown(key, label, options, current) {
    const idx = Math.max(
      0,
      options.findIndex((o) => o[0] === current)
    );
    this.form.dropdown(
      label,
      options.map((o) => o[1]),
      { defaultValueIndex: idx }
    );
    this.fields.push({ key, kind: "dropdown", options: options.map((o) => o[0]) });
    return this;
  }
  /** @param {string} key @param {string} label @param {string} placeholder @param {string} def */
  text(key, label, placeholder, def) {
    this.form.textField(label, placeholder, { defaultValue: def ?? "" });
    this.fields.push({ key, kind: "text" });
    return this;
  }
  /** @param {string} t */
  submit(t) {
    this.form.submitButton(t);
    return this;
  }
  /**
   * @param {import("@minecraft/server").Player} player
   * @returns {Promise<Record<string, any> | null>}
   */
  async show(player) {
    const r = await showForm(player, this.form);
    if (!r || r.canceled || !r.formValues) return null;
    /** @type {Record<string, any>} */
    const out = {};
    // Werte der Reihe nach zuordnen (eventuelle Nicht-Eingabe-Elemente überspringen)
    const vals = r.formValues.filter((x) => x !== undefined);
    this.fields.forEach((f, i) => {
      const val = vals[i];
      out[f.key] = f.kind === "dropdown" && f.options ? f.options[/** @type {number} */ (val)] : val;
    });
    return out;
  }
}
