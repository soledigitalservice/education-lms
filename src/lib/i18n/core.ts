/**
 * Translation core — no message imports, so it is safe to bundle on the client.
 *
 * Strings use the Spanish source text as the key. The active dictionary is an
 * es→en override map (empty for Spanish, so `t` returns the key verbatim).
 * Any key missing from the English map falls back to its Spanish source — so a
 * partially-translated app degrades gracefully (Spanish shows through, never blank).
 *
 * Interpolation: `t('Vence en {h}h', { h: 5 })` → "Vence en 5h".
 */
export type Dict = Record<string, string>;
export type TFunction = (key: string, vars?: Record<string, string | number>) => string;

export function makeT(dict: Dict): TFunction {
  return (key, vars) => {
    let out = dict[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        out = out.split(`{${k}}`).join(String(v));
      }
    }
    return out;
  };
}
