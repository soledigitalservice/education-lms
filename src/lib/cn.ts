import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Concat + dedupe Tailwind classes. Used by every UI component. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
