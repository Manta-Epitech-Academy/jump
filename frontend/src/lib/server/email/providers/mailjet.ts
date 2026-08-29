/**
 * Mailjet provider. Uses the v3.1 Send API via `fetch`, no SDK.
 *
 * The Resend SDK swallowed per-call errors, which is why this codebase
 * keeps a `SendEmailResult` wrapper. Mailjet's REST API is small enough
 * that hand-rolling it gives us a tighter contract: we own the parsing
 * and decide explicitly which cases are retryable.
 *
 * Auth: HTTP Basic with `MAILJET_API_KEY:MAILJET_API_SECRET`.
 * Endpoint: `POST https://api.mailjet.com/v3.1/send`.
 *
 * Response shape (success): each entry in `Messages[]` has
 * `Status: "success"` and a `To[]` array with `{ MessageID, MessageUUID }`.
 * On per-message failure the entry has `Status: "error"` with an `Errors[]`
 * detail. Transport-level failures surface as 4xx/5xx HTTP responses.
 */

import { env } from '$env/dynamic/private';
import type { MailMessage, MailProvider, SendEmailResult } from '../types';

/**
 * Mailjet v3.1 Send caps the TOTAL number of recipients (summed `To` across
 * every Message) per call at 50 (*not* the message count). Most broadcast
 * messages carry a single recipient, so message-count and recipient-count
 * chunking coincide in prod. But the dev-redirect rewrites each message's
 * `to` to the tester's list (see `dev-redirect.ts`), so 50 single-recipient
 * messages can balloon to 50 × listSize recipients in one call and trip the
 * cap. `sendBatch` therefore chunks by cumulative recipient count, splitting
 * into as many HTTP calls as needed. Used as `batchMax` too: an outer bound of
 * 50 messages is always at least as tight as 50 recipients.
 */
const MAILJET_RECIPIENTS_PER_CALL = 50;

const ENDPOINT = 'https://api.mailjet.com/v3.1/send';

interface MailjetAddress {
  Email: string;
  Name?: string;
}

interface MailjetMessage {
  From: MailjetAddress;
  To: MailjetAddress[];
  Subject: string;
  TextPart?: string;
  HTMLPart?: string;
  Attachments?: {
    ContentType: string;
    Filename: string;
    Base64Content: string;
  }[];
}

interface MailjetResponseEntry {
  Status?: 'success' | 'error';
  To?: { Email: string; MessageID: number; MessageUUID: string }[];
  Errors?: { ErrorMessage?: string; ErrorCode?: string }[];
}

interface MailjetResponse {
  Messages?: MailjetResponseEntry[];
  ErrorMessage?: string;
  ErrorInfo?: string;
}

/** Parse `"Name <email@x>"` or bare `"email@x"` into Mailjet's shape. */
function parseAddress(raw: string): MailjetAddress {
  const trimmed = raw.trim();
  const m = trimmed.match(/^(.+?)\s*<([^>]+)>\s*$/);
  if (m) return { Name: m[1].trim(), Email: m[2].trim() };
  return { Email: trimmed };
}

function toMailjetMessage(msg: MailMessage): MailjetMessage {
  const toList = Array.isArray(msg.to) ? msg.to : [msg.to];
  return {
    From: parseAddress(msg.from),
    To: toList.map(parseAddress),
    Subject: msg.subject,
    TextPart: msg.text,
    HTMLPart: msg.html,
    Attachments: msg.attachments?.map((a) => ({
      ContentType: a.contentType,
      Filename: a.filename,
      Base64Content: a.content,
    })),
  };
}

function authHeader(): string {
  const key = env.MAILJET_API_KEY ?? '';
  const secret = env.MAILJET_API_SECRET ?? '';
  return `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`;
}

function entryToResult(
  entry: MailjetResponseEntry | undefined,
): SendEmailResult {
  if (!entry) {
    return {
      ok: false,
      reason: 'api_error',
      message: 'Mailjet returned no Message entry for this payload',
    };
  }
  if (entry.Status === 'success') {
    // One entry can have multiple `To` addresses (single MailMessage with an
    // array `to`); we expose only the first MessageUUID. The orchestrator
    // tracks per-recipient state at the BroadcastRecipient row, so any
    // surplus IDs would be dropped on the floor anyway.
    const first = entry.To?.[0];
    if (!first?.MessageUUID) {
      return {
        ok: false,
        reason: 'api_error',
        message: 'Mailjet success entry without MessageUUID',
      };
    }
    return { ok: true, id: first.MessageUUID };
  }
  const msg =
    entry.Errors?.map((e) => e.ErrorMessage)
      .filter(Boolean)
      .join('; ') || 'Mailjet rejected this message';
  return { ok: false, reason: 'api_error', message: msg };
}

async function postSend(
  messages: MailjetMessage[],
): Promise<SendEmailResult[]> {
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: authHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ Messages: messages }),
    });
  } catch (err) {
    // Pre-response throw (DNS, TLS, abort). Always transient: caller
    // marks recipients retryable.
    return messages.map(() => ({
      ok: false as const,
      reason: 'network_error' as const,
      message: err instanceof Error ? err.message : String(err),
    }));
  }

  let body: MailjetResponse | null = null;
  const text = await response.text();
  if (text) {
    try {
      body = JSON.parse(text) as MailjetResponse;
    } catch {
      // Non-JSON body on an error response (Mailjet sometimes returns HTML
      // on 5xx). Fall through to the HTTP-status path below.
    }
  }

  // Transport-level failure: every message in the batch is uniformly failed.
  // 429 / 5xx are retryable; 4xx is not (caller's `isRetryableFailure`
  // inspects `statusCode`).
  if (!response.ok) {
    const message =
      body?.ErrorMessage ||
      body?.ErrorInfo ||
      `Mailjet HTTP ${response.status} ${response.statusText}`;
    return messages.map(() => ({
      ok: false as const,
      reason: 'api_error' as const,
      message,
      statusCode: response.status,
    }));
  }

  const entries = body?.Messages ?? [];
  return messages.map((_, i) => entryToResult(entries[i]));
}

async function send(msg: MailMessage): Promise<SendEmailResult> {
  const [result] = await postSend([toMailjetMessage(msg)]);
  return result;
}

async function sendBatch(payloads: MailMessage[]): Promise<SendEmailResult[]> {
  if (payloads.length === 0) return [];
  const messages = payloads.map(toMailjetMessage);
  const results: SendEmailResult[] = [];
  let chunk: MailjetMessage[] = [];
  let chunkRecipients = 0;
  for (const message of messages) {
    // A single message that alone exceeds the cap (a >50-address redirect
    // list, absurd config) still ships solo so Mailjet rejects only it,
    // rather than starving its neighbours' slots; one message's recipients
    // can't be split across calls.
    const count = Math.max(message.To.length, 1);
    if (
      chunk.length > 0 &&
      chunkRecipients + count > MAILJET_RECIPIENTS_PER_CALL
    ) {
      results.push(...(await postSend(chunk)));
      chunk = [];
      chunkRecipients = 0;
    }
    chunk.push(message);
    chunkRecipients += count;
  }
  if (chunk.length > 0) results.push(...(await postSend(chunk)));
  return results;
}

export const mailjetProvider: MailProvider = {
  name: 'mailjet',
  batchMax: MAILJET_RECIPIENTS_PER_CALL,
  send,
  sendBatch,
};
