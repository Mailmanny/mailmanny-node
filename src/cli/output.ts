const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR && process.env.TERM !== "dumb";

const wrap = (open: number, close: number) => (s: string) => (useColor ? `\u001b[${open}m${s}\u001b[${close}m` : s);

export const c = {
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  cyan: wrap(36, 39),
};

export const ok = c.green("✓");
export const fail = c.red("✗");
export const warn = c.yellow("!");

/** Left-aligned columns (ANSI-aware widths). */
export function table(rows: string[][]): string {
  const visible = (s: string) => s.replace(/\u001b\[\d+m/g, "").length;
  const widths: number[] = [];
  for (const row of rows) row.forEach((cell, i) => (widths[i] = Math.max(widths[i] ?? 0, visible(cell))));
  return rows
    .map((row) => row.map((cell, i) => (i === row.length - 1 ? cell : cell + " ".repeat(widths[i]! - visible(cell)))).join("  "))
    .join("\n");
}
