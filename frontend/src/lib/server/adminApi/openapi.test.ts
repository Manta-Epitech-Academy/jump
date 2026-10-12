import { describe, it, expect } from 'vitest';
import { buildOpenApiDocument } from './openapi';
import { httpOperations } from './httpCatalogue';
import { ADMIN_API_OPERATIONS } from './operations';

const origin = 'https://jump.example.invalid';

type Document = Awaited<ReturnType<typeof buildOpenApiDocument>>;
type PathItem = Record<
  string,
  {
    operationId: string;
    parameters?: { name: string; in: string }[];
    requestBody?: unknown;
  }
>;

/** Each documented operation's name, with its verb. */
function documented(document: Document) {
  return Object.values(document.paths as Record<string, PathItem>).flatMap(
    (item) =>
      Object.entries(item).map(([method, op]) => ({
        name: op.operationId as keyof typeof ADMIN_API_OPERATIONS,
        method,
        op,
      })),
  );
}

describe('the HTTP reference', () => {
  it('documents every mounted operation at its own path for a write-enabled core token', async () => {
    const document = await buildOpenApiDocument({
      tier: 'core',
      writeEnabled: true,
      origin,
    });
    const mounted = await httpOperations();

    expect(
      Object.entries(document.paths).flatMap(([path, item]) =>
        Object.entries(item as PathItem).map(
          ([method, op]) => `${method.toUpperCase()} ${path} ${op.operationId}`,
        ),
      ),
    ).toEqual(mounted.map((r) => `${r.method} ${r.path} ${r.name}`));
    expect(document.servers).toEqual([{ url: origin }]);
  });

  it('shows a read-only token no write, the rule the MCP tool list follows', async () => {
    const document = await buildOpenApiDocument({
      tier: 'core',
      writeEnabled: false,
      origin,
    });
    const kinds = documented(document).map(
      ({ name }) => ADMIN_API_OPERATIONS[name].kind,
    );

    expect(kinds).not.toContain('write');
    expect(kinds.length).toBeGreaterThan(0);
  });

  it('shows a leadership token the steering figures only', async () => {
    const document = await buildOpenApiDocument({
      tier: 'leadership',
      writeEnabled: false,
      origin,
    });

    for (const { name } of documented(document)) {
      expect(ADMIN_API_OPERATIONS[name].leadership, name).toBe(true);
    }
  });

  it('puts a read in the query string and a write in the body, as the routes take them', async () => {
    const document = await buildOpenApiDocument({
      tier: 'core',
      writeEnabled: true,
      origin,
    });
    const byName = new Map(documented(document).map((d) => [d.name, d]));

    const read = byName.get('config_events');
    expect(read?.method).toBe('get');
    expect(read?.op.parameters?.map((p) => [p.name, p.in])).toContainEqual([
      'campus',
      'query',
    ]);

    const write = byName.get('write_workshop_instance');
    expect(write?.method).toBe('post');
    expect(write?.op.requestBody).toMatchObject({
      content: {
        'application/json': {
          schema: { required: ['instance', 'baseUrl'] },
        },
      },
    });
  });

  // A named sub-schema is emitted under `$defs`, which only resolves inside the
  // one schema that carries it: every reference must point at a component the
  // document actually holds.
  it('leaves no reference pointing outside the document', async () => {
    const document = await buildOpenApiDocument({
      tier: 'core',
      writeEnabled: true,
      origin,
    });
    const refs = [
      ...JSON.stringify(document).matchAll(/"\$ref":"([^"]+)"/g),
    ].map(([, ref]) => ref);
    const schemas = document.components.schemas as Record<string, unknown>;
    const responses = document.components.responses as Record<string, unknown>;

    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      const [, , kind, id] = ref.split('/');
      expect((kind === 'schemas' ? schemas : responses)[id], ref).toBeDefined();
    }
  });
});
