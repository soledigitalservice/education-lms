/**
 * Convert any string to a URL-safe slug.
 *
 *   "Hola Mundo!"        → "hola-mundo"
 *   "  Two   Spaces  "   → "two-spaces"
 *   "Mañana es Lunes"    → "manana-es-lunes"
 *
 * Strips diacritics (NFD + remove combining marks), lowercases, replaces
 * any run of non-alphanumeric chars with a single hyphen, trims leading
 * and trailing hyphens, and caps at 80 chars.
 */
// U+0300 to U+036F is the "Combining Diacritical Marks" Unicode block.
// After NFD normalisation, "á" becomes "a" + U+0301; this regex deletes the U+0301.
const COMBINING_MARKS = /[̀-ͯ]/g;

export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * Given a base slug and an async availability check, find a free slug.
 * If `base` is taken, tries `base-2`, `base-3`, … up to 50 attempts.
 *
 *   const slug = await ensureUniqueSlug(
 *     slugify(title),
 *     async (s) => (await prisma.course.count({ where: { slug: s } })) === 0,
 *   );
 *
 * After 50 collisions (extremely unlikely), falls back to `base-<random>`.
 */
export async function ensureUniqueSlug(
  base: string,
  isAvailable: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const safeBase = base.length > 0 ? base : 'item';
  if (await isAvailable(safeBase)) return safeBase;
  for (let i = 2; i <= 50; i++) {
    const candidate = `${safeBase}-${i}`;
    if (await isAvailable(candidate)) return candidate;
  }
  return `${safeBase}-${Math.random().toString(36).slice(2, 8)}`;
}
