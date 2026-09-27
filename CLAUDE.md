# Hinweise für die Weiterentwicklung

Axiom Bedrock ist ein Minecraft-Bedrock-Add-on, das die Java-Mod „Axiom“ nachbildet. Der Nutzer spielt auf
**Konsole mit Controller** und installiert über einen **Realm** – daraus folgen feste Regeln:

- Nur **stabile** Skript-APIs verwenden: `@minecraft/server` 2.4.0 und `@minecraft/server-ui` 2.0.0
  (keine Beta-APIs, keine Experimente – sonst lässt sich die Welt nicht auf einen Realm hochladen).
- Bedienung muss mit Controller gehen: Benutzen / Schleichen+Benutzen / Schlagen + Formular-Menüs.
- Alle Texte im Spiel auf **Deutsch**.
- In `beforeEvents` nichts schreiben (nur lesen, `ev.cancel` setzen, Arbeit per `system.run` verschieben).
- Keine nativen API-Aufrufe auf oberster Modulebene (Early Execution) – z.B. `air()` statt Konstante.
- Blockänderungen immer über `runEdit`/`EditSession` (Maske, Symmetrie, Verlauf). Änderungen, die an der
  `EditSession` vorbei laufen (Strukturen, `fillBlocks`), brauchen `forceRegion: true`.

Vor jedem Commit:
```bash
npm run check   # Typprüfung
npm test        # alle Werkzeuge inkl. Rückgängig/Wiederherstellen gegen die Attrappe
npm run build   # erzeugt dist/AxiomBedrock.mcaddon (wird mit eingecheckt, damit der Nutzer es herunterladen kann)
```
Neue Werkzeuge: Modul in `packs/AxiomBP/scripts/tools/`, in `tools/index.js` eintragen, Item + Icon in
`tools/build.py` / `tools/icons.py` ergänzen, Test in `tests/run.mjs` hinzufügen, README + ROADMAP aktualisieren.
Versionsnummer in beiden `manifest.json` (Header, Module, Abhängigkeit) gemeinsam erhöhen.
