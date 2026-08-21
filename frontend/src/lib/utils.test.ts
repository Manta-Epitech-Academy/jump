import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { cn } from './utils';

const CSS = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../routes/layout.css',
);

describe('cn', () => {
  it('should keep a custom display size next to a text colour', () => {
    // Arrange / Act: tailwind-merge only knows the font sizes Tailwind ships,
    // so without the extension it reads `text-display-2xl` as a text colour and
    // drops it. That shipped once: every KPI figure rendered at 16px.
    const merged = cn('font-heading text-display-2xl', 'text-muted-foreground');

    // Assert
    expect(merged).toContain('text-display-2xl');
    expect(merged).toContain('text-muted-foreground');
  });

  it('should still let one display size override another', () => {
    // Arrange / Act
    const merged = cn('text-display-s', 'text-display-xl');

    // Assert
    expect(merged).toBe('text-display-xl');
  });

  it('should know every display and overline size declared in layout.css', () => {
    // Arrange: the theme is the source of truth; this test is what stops a new
    // `--text-*` key from silently losing its size at every merge site.
    const css = readFileSync(CSS, 'utf8');
    const declared = [
      ...css.matchAll(/^\s*--text-((?:display-[a-z0-9]+|overline)):/gm),
    ].map((m) => m[1]);

    // Act / Assert
    expect(declared.length).toBeGreaterThan(0);
    for (const key of declared) {
      expect(
        cn(`text-${key}`, 'text-foreground'),
        `text-${key} is not registered in cn()'s font-size group`,
      ).toContain(`text-${key}`);
    }
  });
});
