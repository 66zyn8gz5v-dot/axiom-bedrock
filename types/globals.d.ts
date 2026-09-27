// Minecraft stellt in Skripten eine einfache Konsole bereit.
declare const console: {
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
};
