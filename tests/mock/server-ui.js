// Formular-Attrappe: Antworten werden vorab in eine Warteschlange gelegt.
export const FormCancelationReason = { UserBusy: "UserBusy", UserClosed: "UserClosed" };

export const answers = [];
export const shown = [];

function next(kind, form) {
  shown.push({ kind, form });
  const a = answers.shift();
  if (a === undefined) return { canceled: true, cancelationReason: "UserClosed" };
  if (typeof a === "function") return a(form);
  return a;
}

export class ActionFormData {
  constructor() {
    this.buttons = [];
  }
  title(t) {
    this._title = t;
    return this;
  }
  body(b) {
    this._body = b;
    return this;
  }
  button(t) {
    this.buttons.push(t);
    return this;
  }
  divider() {
    return this;
  }
  header() {
    return this;
  }
  label() {
    return this;
  }
  async show() {
    const a = next("action", this);
    if (typeof a.selectText === "string") {
      const i = this.buttons.findIndex((b) => String(b).includes(a.selectText));
      if (i < 0) throw new Error(`Button „${a.selectText}“ nicht gefunden in ${this._title}: ${this.buttons.join(" | ")}`);
      return { canceled: false, selection: i };
    }
    return a;
  }
}

export class ModalFormData {
  constructor() {
    this.fields = [];
  }
  title(t) {
    this._title = t;
    return this;
  }
  slider(label, min, max, o) {
    this.fields.push({ kind: "slider", label, min, max, def: o?.defaultValue });
    return this;
  }
  toggle(label, o) {
    this.fields.push({ kind: "toggle", label, def: o?.defaultValue ?? false });
    return this;
  }
  dropdown(label, items, o) {
    this.fields.push({ kind: "dropdown", label, items, def: o?.defaultValueIndex ?? 0 });
    return this;
  }
  textField(label, ph, o) {
    this.fields.push({ kind: "text", label, def: o?.defaultValue ?? "" });
    return this;
  }
  submitButton() {
    return this;
  }
  divider() {
    return this;
  }
  header() {
    return this;
  }
  label() {
    return this;
  }
  async show() {
    const a = next("modal", this);
    if (a.set) {
      // Standardwerte übernehmen und einzelne Felder (nach Label-Teiltext) überschreiben
      const vals = this.fields.map((f) => f.def);
      for (const [lbl, val] of Object.entries(a.set)) {
        const i = this.fields.findIndex((f) => f.label.includes(lbl));
        if (i < 0) throw new Error(`Feld „${lbl}“ nicht gefunden in ${this._title}`);
        const f = this.fields[i];
        vals[i] = f.kind === "dropdown" && typeof val === "string" ? f.items.findIndex((x) => x.includes(val)) : val;
        if (vals[i] === -1) throw new Error(`Option „${val}“ nicht gefunden`);
      }
      return { canceled: false, formValues: vals };
    }
    return a;
  }
}
