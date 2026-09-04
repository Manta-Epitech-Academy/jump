/**
 * The Content-Security-Policy as a real server actually emits it.
 *
 * `src/lib/security/csp.test.ts` covers what the source may not contain. This
 * file covers the half no source scan can see: the per-request nonce, which only
 * exists once kit has rendered a page, and the fact that the three classes of
 * response Jump produces each end up with the right policy.
 *
 * That last part is the subtle one and the reason this suite exists rather than a
 * single spot check. `kit.csp` sets its header on a RENDERED PAGE only, so a
 * guard redirect and a `+server.ts` endpoint reach `setSecurityHeaders` with no
 * header at all; before #277 they were handed the permissive policy written for
 * pages, and it would be entirely invisible if they went back to carrying none.
 *
 * Assertions are on headers and on the served HTML, so nothing here depends on
 * timing, layout or seeded state beyond the sessions.
 */
import { test, expect } from '@playwright/test';
import { E2E, storageStatePath } from './fixtures/identities';

/** The directives of one policy header, split on `;` and trimmed. */
function directives(header: string | undefined): Map<string, string> {
  expect(header, 'no Content-Security-Policy header at all').toBeTruthy();
  const map = new Map<string, string>();
  for (const part of header!.split(';')) {
    const [name, ...rest] = part.trim().split(/\s+/);
    if (name) map.set(name, rest.join(' '));
  }
  return map;
}

/**
 * What every rendered page owes, whoever is looking at it. Asserted per space
 * rather than once, because `hooks.server.ts` is one code path but the guards it
 * runs first are not: a space whose guard returned its own response would skip
 * kit's renderer and silently drop to the locked-down policy.
 */
async function expectHardenedPage(
  header: string | undefined,
  where: string,
): Promise<void> {
  const csp = directives(header);
  const scriptSrc = csp.get('script-src');

  expect(scriptSrc, `${where}: no script-src`).toBeTruthy();
  // The nonce is the whole point of the move to `kit.csp`, and its absence is
  // what would make the two assertions below pass while protecting nothing.
  expect(scriptSrc, `${where}: no per-request nonce`).toMatch(/'nonce-[^']+'/);
  expect(scriptSrc, where).not.toContain('unsafe-inline');
  expect(scriptSrc, where).not.toContain('unsafe-hashes');

  // Appended by `hooks.server.ts` onto the header kit already set. Both being
  // present is what proves the append, since `kit.csp` declares no `frame-src`
  // and `hooks.server.ts` declares no `script-src`.
  expect(csp.get('frame-src'), `${where}: frame-src not appended`).toContain(
    'https://*.epiboost.eu',
  );

  expect(csp.get('object-src'), where).toBe("'none'");
  expect(csp.get('frame-ancestors'), where).toBe("'none'");
}

test.describe('une page rendue, hors session', () => {
  test('est servie sous une CSP à nonce, sans concession inline', async ({
    request,
  }) => {
    const response = await request.get('/login');
    expect(response.status()).toBe(200);
    await expectHardenedPage(
      response.headers()['content-security-policy'],
      '/login',
    );
  });
});

test.describe("une page rendue dans l'espace staff", () => {
  test.use({ storageState: storageStatePath(E2E.dev.email) });

  test('porte la même politique', async ({ request }) => {
    const response = await request.get(
      `/staff/dev/events/${E2E.eventId}/emargement`,
    );
    expect(response.status()).toBe(200);
    await expectHardenedPage(
      response.headers()['content-security-policy'],
      'staff dev',
    );
  });
});

test.describe("une page rendue dans l'espace talent", () => {
  test.use({ storageState: storageStatePath(E2E.talentReady.email) });

  test('porte la même politique', async ({ request }) => {
    const response = await request.get('/');
    expect(response.status()).toBe(200);
    await expectHardenedPage(
      response.headers()['content-security-policy'],
      'talent',
    );
  });
});

test.describe('une réponse que kit n’a pas rendue', () => {
  /**
   * A guard redirect. `applyRouteGuards` returns before `resolve()`, so kit's
   * renderer never runs and there is no header to append to.
   */
  test('verrouille tout sur une redirection de garde', async ({ request }) => {
    const response = await request.get('/staff/dev', {
      maxRedirects: 0,
    });
    expect(response.status()).toBeGreaterThanOrEqual(300);
    expect(response.status()).toBeLessThan(400);

    const csp = directives(response.headers()['content-security-policy']);
    expect(csp.get('default-src')).toBe("'none'");
    expect(csp.has('script-src')).toBe(false);
  });

  test('verrouille tout sur un endpoint JSON', async ({ request }) => {
    // Unauthenticated on purpose: the point is the response CLASS, and a refusal
    // is a `+server.ts` response like any other. The curated admin API audits
    // every call including this one, which is its documented behaviour.
    const response = await request.get('/api/admin/people');
    expect(response.status()).toBeGreaterThanOrEqual(400);

    const csp = directives(response.headers()['content-security-policy']);
    expect(csp.get('default-src')).toBe("'none'");
    expect(csp.has('script-src')).toBe(false);
  });
});

test.describe('le script Umami', () => {
  /**
   * The E2E environment sets no `PUBLIC_UMAMI_WEBSITE_ID`, which is the "leave it
   * empty and nothing loads" contract of `.env.example`. Asserting it here is
   * what makes that contract a check: `Umami.svelte` is rendered unconditionally
   * from the root layout, so the website id is the ONLY thing standing between an
   * unset env var and a third-party script on every page of every space.
   */
  test("ne charge rien quand aucun identifiant n'est configuré", async ({
    request,
  }) => {
    const html = await (await request.get('/login')).text();
    expect(html).not.toContain('jump-umami.epiboost.eu');
  });

  /** Whatever the configuration, the recorder is gone (issue #275). */
  test('ne charge jamais le recorder', async ({ request }) => {
    const html = await (await request.get('/login')).text();
    expect(html).not.toContain('recorder.js');
  });
});

test.describe('le chargement réel d’une page', () => {
  /**
   * `eval`, and only `eval`, is expected.
   *
   * Zod 4 JIT-compiles its validators with `new Function` and probes for it as
   * `try { Function("") } catch { return false }`, then takes its interpreted
   * path when the probe throws. The refusal IS the feature detection, it is
   * caught by the library, and it predates this branch: neither the old policy
   * nor the new one carries `'unsafe-eval'`, and `'unsafe-inline'` never
   * permitted `eval` either. Adding `'unsafe-eval'` to silence it would hand
   * every XSS a code-execution primitive to buy nothing.
   */
  const EXPECTED = new Set(['eval']);

  type Violation = {
    directive: string;
    blockedURI: string;
    sourceFile: string;
  };

  /**
   * Real `securitypolicyviolation` events rather than console text.
   *
   * Console scraping was the first attempt and it was wrong twice over: DevTools
   * emits an advisory mentioning "Content Security Policy" for the `eval` probe
   * above, which is not a bug, and a genuine refusal is easier to classify from
   * the event's own `blockedURI` than from a translated sentence.
   */
  async function violationsOn(
    page: import('@playwright/test').Page,
    path: string,
  ): Promise<Violation[]> {
    await page.addInitScript(() => {
      const w = window as unknown as { __violations: unknown[] };
      w.__violations = [];
      document.addEventListener('securitypolicyviolation', (e) => {
        w.__violations.push({
          directive: e.effectiveDirective || e.violatedDirective,
          blockedURI: e.blockedURI,
          sourceFile: e.sourceFile,
        });
      });
    });
    await page.goto(path);
    // The script this guard was written for is a synchronous one in `<head>`, so
    // it is already refused by the time the document parses; settling the network
    // also catches anything a late module injects.
    await page.waitForLoadState('networkidle');
    return page.evaluate(
      () => (window as unknown as { __violations: Violation[] }).__violations,
    );
  }

  /**
   * The regression this suite was written after, and the one a header assertion
   * cannot see.
   *
   * `<ModeWatcher />` injects its own FOUC-prevention script, and that copy
   * carries no nonce, so moving to `kit.csp` blocked it: the header looked
   * perfect, every page still rendered, and a talent whose mode is dark got a
   * flash of the light theme on every full page load. Nothing in the gate
   * noticed, because nothing read the console.
   *
   * Deliberately not scoped to the theme script: ANY refused inline script or
   * style is a bug here, and naming only the one we hit would let the next one
   * through.
   */
  for (const path of ['/login', '/staff/login']) {
    test(`ne refuse aucun script ni style inline sur ${path}`, async ({
      page,
    }) => {
      const violations = await violationsOn(page, path);
      expect(violations.filter((v) => v.blockedURI === 'inline')).toEqual([]);
    });
  }

  /**
   * And nothing else either. Pinning the known set is what makes a NEW kind of
   * refusal fail here instead of being read as more of the same.
   */
  test('ne produit aucune violation en dehors de la sonde eval', async ({
    page,
  }) => {
    const violations = await violationsOn(page, '/login');
    expect(violations.filter((v) => !EXPECTED.has(v.blockedURI))).toEqual([]);
  });

  /**
   * And the positive half, because a console with no violations is also what you
   * get by deleting the script. `%sveltekit.nonce%` is substituted in
   * `src/app.html` alone, so this is what proves the token was replaced and the
   * nonce applied rather than the theme silently going unmanaged.
   */
  test('sert le script de thème sous un nonce, en un seul exemplaire', async ({
    request,
  }) => {
    const html = await (await request.get('/login')).text();

    expect(html, 'the app.html token was not substituted').not.toContain(
      'jump:theme-init',
    );

    const themeScripts = [
      ...html.matchAll(/<script([^>]*)>\s*\(function setInitialMode/g),
    ];
    // Exactly one: `disableHeadScriptInjection` is what stops the component
    // emitting a second, nonce-less copy that the policy would refuse.
    expect(themeScripts).toHaveLength(1);
    expect(themeScripts[0][1]).toMatch(/nonce="[^"]+"/);
  });

  /** The class it exists to set, applied before any deferred module runs. */
  test('applique le thème sombre avant la fin du parsing', async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(() =>
      localStorage.setItem('mode-watcher-mode', 'dark'),
    );

    // Snapshot taken at the first `readystatechange`: the synchronous head script
    // has run, deferred module scripts have not.
    await page.addInitScript(() => {
      document.addEventListener(
        'readystatechange',
        () => {
          const w = window as unknown as { __atInteractive?: string };
          w.__atInteractive ??= document.documentElement.className;
        },
        true,
      );
    });
    await page.reload();

    const atInteractive = await page.evaluate(
      () => (window as unknown as { __atInteractive?: string }).__atInteractive,
    );
    expect(atInteractive).toContain('dark');
  });
});
