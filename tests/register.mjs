// Leitet @minecraft/server(-ui) auf die Test-Attrappen um.
import { register } from "node:module";
register("./loader.mjs", import.meta.url);
