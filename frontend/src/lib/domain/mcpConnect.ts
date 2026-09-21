/**
 * The commands that connect an MCP client to this Jump, built as strings.
 *
 * They are shown on `/staff/admin/api-tokens` so a token can be pasted straight
 * into a terminal, with the secret already in place. That is not a convenience:
 * a secret shown exactly once is easiest to lose at the moment somebody has to
 * retype it into a command they had to find elsewhere.
 *
 * Built here rather than in the component, and unit-tested, because a command
 * that is wrong by one character is worse than no command at all. Somebody
 * pastes it, gets `Failed to connect`, and now doubts the token rather than the
 * instructions.
 *
 * `$lib/domain` on purpose: no Vite-only import, so the strings stay checkable
 * without a browser.
 */

/**
 * The server's name in the client's configuration, and the one thing that must
 * be identical across all three forms below: `add` registers under it, `remove`
 * addresses it by it, and the Claude Desktop JSON keys on it. It matches the
 * repository's own `.mcp.json`, so an agent working in the repo and a person
 * connecting from their laptop name the same server.
 */
export const MCP_SERVER_NAME = 'jump-admin';

/** The streamable-HTTP endpoint the whole curated tier is reached through. */
export function mcpEndpoint(origin: string): string {
  return `${origin.replace(/\/+$/, '')}/api/mcp`;
}

/**
 * What the reveal panel shows in place of a secret when no token was just
 * minted, so the connection section still reads as a command and not as a gap.
 */
export const MCP_TOKEN_PLACEHOLDER = 'votre-token';

/**
 * `claude mcp add`, at user scope.
 *
 * Scope is deliberate, and it is not the default. `local` attaches the server to
 * one project directory, which is the right default for a developer in a
 * repository and the wrong one for everybody this page is for: they open a chat,
 * not a checkout. `user` puts it in every session on their machine.
 *
 * `--transport http` has to come before the name and the URL. Without it the CLI
 * expects a `stdio` command rather than a URL, and fails in a way that does not
 * name the missing flag.
 *
 * The header travels inside one pair of double quotes. That is enough in bash,
 * fish, zsh and PowerShell alike, and a `jump_` + base64url secret carries only
 * `-` and `_`, so there is nothing to escape and no per-shell variant to offer.
 */
export function mcpAddCommand(origin: string, token: string | null): string {
  const secret = (token ?? MCP_TOKEN_PLACEHOLDER).trim();
  return [
    'claude mcp add --scope user --transport http',
    MCP_SERVER_NAME,
    mcpEndpoint(origin),
    `--header "Authorization: Bearer ${secret}"`,
  ].join(' ');
}

/**
 * `claude mcp remove`, which is not an afterthought.
 *
 * Adding a second server under a name that already exists in the same scope
 * fails with `Server already exists`, and re-minting a token is precisely when
 * somebody runs the add command a second time. So the way to reconnect is on the
 * page, next to the command that needs it, rather than in a note nobody reads.
 */
export function mcpRemoveCommand(): string {
  return `claude mcp remove ${MCP_SERVER_NAME}`;
}

/**
 * The same server for a client that has no CLI. Claude Desktop is configured by
 * editing a file and restarting, so what is useful there is the JSON object, not
 * a command.
 */
export function mcpDesktopConfig(origin: string, token: string | null): string {
  const secret = (token ?? MCP_TOKEN_PLACEHOLDER).trim();
  return JSON.stringify(
    {
      mcpServers: {
        [MCP_SERVER_NAME]: {
          type: 'http',
          url: mcpEndpoint(origin),
          headers: { Authorization: `Bearer ${secret}` },
        },
      },
    },
    null,
    2,
  );
}

/** Where that file lives, per platform, since it has to be found before it is edited. */
export const MCP_DESKTOP_CONFIG_PATHS = [
  {
    os: 'macOS',
    path: '~/Library/Application Support/Claude/claude_desktop_config.json',
  },
  { os: 'Windows', path: '%APPDATA%\\Claude\\claude_desktop_config.json' },
  { os: 'Linux', path: '~/.config/Claude/claude_desktop_config.json' },
] as const;
