/**
 * Minimal GitHub client. Wraps fetch around the contents API for both
 * markdown source and binary assets (images live behind the same auth path
 * so private repos work without a separate raw.githubusercontent fallback).
 * Authentication via GITHUB_TOKEN is optional for public repos but
 * recommended to raise the rate limit from 60/h to 5000/h.
 */

import { env } from '$env/dynamic/private';

const API_BASE = 'https://api.github.com';

export type RepoCoords = { owner: string; repo: string };

export type ContentEntry = {
  name: string;
  path: string;
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  sha: string;
  size: number;
};

export class GitHubError extends Error {
  constructor(
    public status: number,
    public url: string,
    message: string,
  ) {
    super(message);
    this.name = 'GitHubError';
  }
}

/**
 * Parse any reasonable repo identifier into `{owner, repo}`.
 * Accepts: full URL, `owner/repo`, with or without `.git` suffix.
 */
export function parseRepoUrl(input: string): RepoCoords {
  const cleaned = input.trim().replace(/\.git$/, '');
  const urlMatch = cleaned.match(/(?:github\.com[/:])([^/]+)\/([^/?#]+)/i);
  if (urlMatch) return { owner: urlMatch[1], repo: urlMatch[2] };
  const shortMatch = cleaned.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (shortMatch) return { owner: shortMatch[1], repo: shortMatch[2] };
  throw new Error(`Unrecognized repo identifier: "${input}"`);
}

function authHeaders(): HeadersInit {
  const token = env.GITHUB_TOKEN;
  return token
    ? { Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' }
    : { 'X-GitHub-Api-Version': '2022-11-28' };
}

async function ghFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      ...authHeaders(),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new GitHubError(
      res.status,
      url,
      `GitHub ${res.status} on ${url}: ${body.slice(0, 200)}`,
    );
  }
  return (await res.json()) as T;
}

/**
 * Resolve a ref (branch / tag / SHA) to a concrete commit SHA.
 */
export async function getCommitSha(
  { owner, repo }: RepoCoords,
  ref = 'main',
): Promise<string> {
  const { sha } = await ghFetch<{ sha: string }>(
    `${API_BASE}/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`,
  );
  return sha;
}

/**
 * Fetch a file at a specific commit SHA via the contents API. Uses the
 * `application/vnd.github.raw+json` accept header so the same code path works
 * for public and private repos (the latter require GITHUB_TOKEN).
 *
 * Returns the raw `Response` so callers can decide between `.text()` for
 * markdown / JSON and streaming the body for binary assets.
 */
export async function getFileResponse(
  { owner, repo }: RepoCoords,
  path: string,
  sha: string,
): Promise<Response> {
  const url = `${API_BASE}/repos/${owner}/${repo}/contents/${path}?ref=${sha}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github.raw+json',
      ...authHeaders(),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new GitHubError(
      res.status,
      url,
      `GitHub ${res.status} on ${url}: ${body.slice(0, 200)}`,
    );
  }
  return res;
}

export async function getFileText(
  coords: RepoCoords,
  path: string,
  sha: string,
): Promise<string> {
  const res = await getFileResponse(coords, path, sha);
  return await res.text();
}

/**
 * List the contents of a directory at a specific commit SHA.
 */
export async function listDirectory(
  { owner, repo }: RepoCoords,
  path: string,
  sha: string,
): Promise<ContentEntry[]> {
  return await ghFetch<ContentEntry[]>(
    `${API_BASE}/repos/${owner}/${repo}/contents/${path}?ref=${sha}`,
  );
}
