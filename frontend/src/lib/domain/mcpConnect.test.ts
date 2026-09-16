import { describe, it, expect } from 'vitest';
import {
  MCP_SERVER_NAME,
  MCP_TOKEN_PLACEHOLDER,
  mcpAddCommand,
  mcpDesktopConfig,
  mcpEndpoint,
  mcpRemoveCommand,
} from './mcpConnect';

const ORIGIN = 'https://jump.test.invalid';
const TOKEN = 'jump_aZ-09_bY-87_cX';

describe('MCP connection commands', () => {
  it('builds the add command exactly as the CLI expects it', () => {
    expect(mcpAddCommand(ORIGIN, TOKEN)).toBe(
      'claude mcp add --scope user --transport http jump-admin ' +
        'https://jump.test.invalid/api/mcp ' +
        '--header "Authorization: Bearer jump_aZ-09_bY-87_cX"',
    );
  });

  // Without it the CLI reads the URL as a stdio command and fails without
  // naming the missing flag, so its position is part of the contract.
  it('puts the transport flag before the name and the URL', () => {
    const command = mcpAddCommand(ORIGIN, TOKEN);
    expect(command.indexOf('--transport http')).toBeLessThan(
      command.indexOf(MCP_SERVER_NAME),
    );
    expect(command.indexOf(MCP_SERVER_NAME)).toBeLessThan(
      command.indexOf(mcpEndpoint(ORIGIN)),
    );
  });

  // `local` is the CLI's default and attaches the server to one project
  // directory. The people this page is written for open a chat, not a checkout.
  it('asks for user scope rather than taking the default', () => {
    expect(mcpAddCommand(ORIGIN, TOKEN)).toContain('--scope user');
  });

  // A token pasted with a stray newline answers `Failed to connect`, and only
  // recent CLI versions say why. Nothing we hand out may carry one.
  it('carries no stray whitespace, at either end or around the secret', () => {
    const padded = mcpAddCommand(ORIGIN, `\n  ${TOKEN}\t`);
    expect(padded).toBe(mcpAddCommand(ORIGIN, TOKEN));
    expect(padded).toBe(padded.trim());
    expect(mcpRemoveCommand()).toBe(mcpRemoveCommand().trim());
  });

  // The add registers under this name, the remove addresses it by it, and the
  // desktop config keys on it. One of the three drifting is a command that
  // silently does nothing.
  it('names the same server in all three forms', () => {
    expect(mcpRemoveCommand()).toBe(`claude mcp remove ${MCP_SERVER_NAME}`);
    expect(mcpAddCommand(ORIGIN, TOKEN)).toContain(` ${MCP_SERVER_NAME} `);
    expect(
      JSON.parse(mcpDesktopConfig(ORIGIN, TOKEN)).mcpServers,
    ).toHaveProperty(MCP_SERVER_NAME);
  });

  it('shows a placeholder, never an empty header, when no token was just minted', () => {
    expect(mcpAddCommand(ORIGIN, null)).toContain(
      `Bearer ${MCP_TOKEN_PLACEHOLDER}`,
    );
    expect(mcpDesktopConfig(ORIGIN, null)).toContain(MCP_TOKEN_PLACEHOLDER);
  });

  // The origin arrives from `url.origin`, but a proxied deployment can hand one
  // back with a trailing slash, and `//api/mcp` is a different path.
  it('never doubles the slash before the endpoint', () => {
    expect(mcpEndpoint('https://jump.test.invalid/')).toBe(
      'https://jump.test.invalid/api/mcp',
    );
    expect(mcpAddCommand('http://localhost:5173/', TOKEN)).toContain(
      'http://localhost:5173/api/mcp',
    );
  });

  it('emits a desktop config a client can actually parse', () => {
    const parsed = JSON.parse(mcpDesktopConfig(ORIGIN, TOKEN));
    expect(parsed.mcpServers[MCP_SERVER_NAME]).toEqual({
      type: 'http',
      url: 'https://jump.test.invalid/api/mcp',
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
  });
});
