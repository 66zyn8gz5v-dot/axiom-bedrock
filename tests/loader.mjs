const MAP = {
  "@minecraft/server": new URL("./mock/server.js", import.meta.url).href,
  "@minecraft/server-ui": new URL("./mock/server-ui.js", import.meta.url).href,
};
export async function resolve(specifier, context, next) {
  if (MAP[specifier]) return { url: MAP[specifier], shortCircuit: true };
  return next(specifier, context);
}
