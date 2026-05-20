import { describe, expect, it, vi } from 'vitest';
import { ensureUniqueSlug, slugify } from '@/lib/slug';

describe('slugify', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(slugify('Hola Mundo')).toBe('hola-mundo');
  });

  it('strips diacritics', () => {
    expect(slugify('Mañana es Lunes')).toBe('manana-es-lunes');
    expect(slugify('Aplicación Móvil')).toBe('aplicacion-movil');
    expect(slugify('Crème brûlée')).toBe('creme-brulee');
  });

  it('collapses runs of non-alphanumeric chars into one hyphen', () => {
    expect(slugify('foo!!!bar___baz')).toBe('foo-bar-baz');
    expect(slugify('  two   spaces  ')).toBe('two-spaces');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('---hi---')).toBe('hi');
    expect(slugify('!@#$%')).toBe('');
  });

  it('caps at 80 chars', () => {
    const long = 'a'.repeat(200);
    expect(slugify(long)).toHaveLength(80);
  });
});

describe('ensureUniqueSlug', () => {
  it('returns the base slug when available', async () => {
    const available = vi.fn(async (_s: string) => true);
    expect(await ensureUniqueSlug('hello', available)).toBe('hello');
    expect(available).toHaveBeenCalledOnce();
  });

  it('appends -2, -3, … on collisions', async () => {
    const taken = new Set(['hello', 'hello-2', 'hello-3']);
    const available = vi.fn(async (s: string) => !taken.has(s));
    expect(await ensureUniqueSlug('hello', available)).toBe('hello-4');
    expect(available).toHaveBeenCalledTimes(4);
  });

  it('falls back to base-<random> after 50 collisions', async () => {
    const available = vi.fn(async (_s: string) => false);
    const result = await ensureUniqueSlug('busy', available);
    expect(result).toMatch(/^busy-[a-z0-9]{6}$/);
  });

  it('substitutes empty base with "item"', async () => {
    const available = vi.fn(async (_s: string) => true);
    expect(await ensureUniqueSlug('', available)).toBe('item');
  });
});
