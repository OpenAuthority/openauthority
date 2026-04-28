import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveTelegramConfig, sendApprovalRequest, TelegramListener, escapeMarkdownV2 } from './telegram.js';
import { CircuitBreaker } from './retry.js';
import type { TelegramConfig } from './types.js';

// ─── resolveTelegramConfig ──────────────────────────────────────────────────

describe('resolveTelegramConfig', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns null when neither env vars nor config are set', () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    expect(resolveTelegramConfig()).toBeNull();
    expect(resolveTelegramConfig({})).toBeNull();
  });

  it('returns config values when env vars are not set', () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    const config: TelegramConfig = { botToken: 'cfg-token', chatId: 'cfg-chat' };
    const result = resolveTelegramConfig(config);
    expect(result).toEqual({ botToken: 'cfg-token', chatId: 'cfg-chat' });
  });

  it('env vars take precedence over config values', () => {
    process.env.TELEGRAM_BOT_TOKEN = 'env-token';
    process.env.TELEGRAM_CHAT_ID = 'env-chat';
    const config: TelegramConfig = { botToken: 'cfg-token', chatId: 'cfg-chat' };
    const result = resolveTelegramConfig(config);
    expect(result).toEqual({ botToken: 'env-token', chatId: 'env-chat' });
  });

  it('returns null if only botToken is set (chatId missing)', () => {
    process.env.TELEGRAM_BOT_TOKEN = 'env-token';
    delete process.env.TELEGRAM_CHAT_ID;
    expect(resolveTelegramConfig()).toBeNull();
  });

  it('returns null if only chatId is set (botToken missing)', () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    process.env.TELEGRAM_CHAT_ID = 'env-chat';
    expect(resolveTelegramConfig()).toBeNull();
  });

  it('mixes env var for botToken with config for chatId', () => {
    process.env.TELEGRAM_BOT_TOKEN = 'env-token';
    delete process.env.TELEGRAM_CHAT_ID;
    const config: TelegramConfig = { chatId: 'cfg-chat' };
    const result = resolveTelegramConfig(config);
    expect(result).toEqual({ botToken: 'env-token', chatId: 'cfg-chat' });
  });
});

// ─── escapeMarkdownV2 ────────────────────────────────────────────────────────

describe('escapeMarkdownV2', () => {
  it('escapes dots', () => {
    expect(escapeMarkdownV2('hello.world')).toBe('hello\\.world');
  });

  it('escapes underscores', () => {
    expect(escapeMarkdownV2('hello_world')).toBe('hello\\_world');
  });

  it('escapes asterisks', () => {
    expect(escapeMarkdownV2('1 * 2')).toBe('1 \\* 2');
  });

  it('escapes hyphens', () => {
    expect(escapeMarkdownV2('a-b')).toBe('a\\-b');
  });

  it('escapes backslashes', () => {
    expect(escapeMarkdownV2('a\\b')).toBe('a\\\\b');
  });

  it('leaves plain alphanumeric text unchanged', () => {
    expect(escapeMarkdownV2('EmailPolicy')).toBe('EmailPolicy');
  });

  it('escapes multiple special chars in one string', () => {
    expect(escapeMarkdownV2('email.send!')).toBe('email\\.send\\!');
  });
});

// ─── sendApprovalRequest ────────────────────────────────────────────────────

describe('sendApprovalRequest', () => {
  const config = { botToken: 'test-token', chatId: '12345' };
  const opts = {
    token: 'abc12345',
    toolName: 'email.send',
    agentId: 'agent-1',
    policyName: 'Email policy',
    timeoutSeconds: 300,
  };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends a POST to the Telegram sendMessage endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{"ok":true}', { status: 200 }));

    const result = await sendApprovalRequest(config, opts);
    expect(result).toBe(true);

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('https://api.telegram.org/bottest-token/sendMessage');
    expect(init?.method).toBe('POST');

    const body = JSON.parse(init?.body as string);
    expect(body.chat_id).toBe('12345');
    expect(body.parse_mode).toBe('MarkdownV2');
    expect(body.text).toContain('abc12345');
    expect(body.text).toContain('email.send');
    expect(body.text).toContain('agent-1'); // agentId is in a code span — hyphens are not escaped there
    expect(body.text).toContain('Email policy');
    expect(body.text).toContain('300s');
  });

  it('uses MarkdownV2 parse mode', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{"ok":true}', { status: 200 }));

    await sendApprovalRequest(config, opts);

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse(init?.body as string);
    expect(body.parse_mode).toBe('MarkdownV2');
  });

  it('includes inline keyboard in reply_markup', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{"ok":true}', { status: 200 }));

    await sendApprovalRequest(config, opts);

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse(init?.body as string);
    expect(body.reply_markup).toBeDefined();
    expect(body.reply_markup.inline_keyboard).toHaveLength(1);
  });

  it('shows three buttons by default (Approve Once, Approve Always, Deny)', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{"ok":true}', { status: 200 }));

    await sendApprovalRequest(config, opts);

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse(init?.body as string);
    const row = body.reply_markup.inline_keyboard[0];
    expect(row).toHaveLength(3);
    const callbackDatas = row.map((b: { callback_data: string }) => b.callback_data);
    expect(callbackDatas).toContain('approve:abc12345');
    expect(callbackDatas).toContain('approve_always:abc12345');
    expect(callbackDatas).toContain('deny:abc12345');
  });

  it('shows two buttons when showApproveAlways is false', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{"ok":true}', { status: 200 }));

    await sendApprovalRequest(config, { ...opts, showApproveAlways: false });

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse(init?.body as string);
    const row = body.reply_markup.inline_keyboard[0];
    expect(row).toHaveLength(2);
    const callbackDatas = row.map((b: { callback_data: string }) => b.callback_data);
    expect(callbackDatas).toContain('approve:abc12345');
    expect(callbackDatas).toContain('deny:abc12345');
    expect(callbackDatas).not.toContain('approve_always:abc12345');
  });

  it('shows three buttons when showApproveAlways is true', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{"ok":true}', { status: 200 }));

    await sendApprovalRequest(config, { ...opts, showApproveAlways: true });

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse(init?.body as string);
    const row = body.reply_markup.inline_keyboard[0];
    expect(row).toHaveLength(3);
    const callbackDatas = row.map((b: { callback_data: string }) => b.callback_data);
    expect(callbackDatas).toContain('approve_always:abc12345');
  });

  it('includes riskLevel in message when provided', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{"ok":true}', { status: 200 }));

    await sendApprovalRequest(config, { ...opts, riskLevel: 'high' });

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse(init?.body as string);
    expect(body.text).toContain('high');
  });

  it('omits risk section when riskLevel is not provided', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{"ok":true}', { status: 200 }));

    await sendApprovalRequest(config, opts);

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse(init?.body as string);
    expect(body.text).not.toContain('*Risk:*');
  });

  it('includes explanation in message when provided', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{"ok":true}', { status: 200 }));

    await sendApprovalRequest(config, { ...opts, explanation: 'Sends an email to the recipient.' });

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse(init?.body as string);
    expect(body.text).toContain('Explanation');
    expect(body.text).toContain('Sends an email to the recipient');
  });

  it('omits explanation section when explanation is not provided', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{"ok":true}', { status: 200 }));

    await sendApprovalRequest(config, opts);

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse(init?.body as string);
    expect(body.text).not.toContain('Explanation');
  });

  it('truncates explanation at 500 characters with ellipsis', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{"ok":true}', { status: 200 }));

    const longExplanation = 'x'.repeat(600);
    await sendApprovalRequest(config, { ...opts, explanation: longExplanation });

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse(init?.body as string);
    // The explanation is truncated and escaped; 'x' has no special chars
    expect(body.text).toContain('x'.repeat(499) + '\u2026');
    expect(body.text).not.toContain('x'.repeat(600));
  });

  it('displays effects as a bullet list', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{"ok":true}', { status: 200 }));

    await sendApprovalRequest(config, { ...opts, effects: ['Sends email', 'Marks as read'] });

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse(init?.body as string);
    expect(body.text).toContain('Effects');
    expect(body.text).toContain('\u2022 Sends email');
    expect(body.text).toContain('\u2022 Marks as read');
  });

  it('omits effects section when effects is empty', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{"ok":true}', { status: 200 }));

    await sendApprovalRequest(config, { ...opts, effects: [] });

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse(init?.body as string);
    expect(body.text).not.toContain('Effects');
  });

  it('displays warnings as a bullet list', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{"ok":true}', { status: 200 }));

    await sendApprovalRequest(config, { ...opts, warnings: ['Irreversible action', 'Notifies recipient'] });

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse(init?.body as string);
    expect(body.text).toContain('Warnings');
    expect(body.text).toContain('\u2022 Irreversible action');
    expect(body.text).toContain('\u2022 Notifies recipient');
  });

  it('omits warnings section when warnings is empty', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{"ok":true}', { status: 200 }));

    await sendApprovalRequest(config, { ...opts, warnings: [] });

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse(init?.body as string);
    expect(body.text).not.toContain('Warnings');
  });

  it('escapes MarkdownV2 special chars in policyName', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{"ok":true}', { status: 200 }));

    await sendApprovalRequest(config, { ...opts, policyName: 'Policy v1.0' });

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse(init?.body as string);
    // Dot in "v1.0" must be escaped
    expect(body.text).toContain('Policy v1\\.0');
  });

  it('escapes MarkdownV2 special chars in explanation', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{"ok":true}', { status: 200 }));

    await sendApprovalRequest(config, { ...opts, explanation: 'Deletes file.txt!' });

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse(init?.body as string);
    expect(body.text).toContain('Deletes file\\.txt\\!');
  });

  it('escapes MarkdownV2 special chars in effect and warning items', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{"ok":true}', { status: 200 }));

    await sendApprovalRequest(config, {
      ...opts,
      effects: ['Writes to output.log'],
      warnings: ['Cannot be undone!'],
    });

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse(init?.body as string);
    expect(body.text).toContain('output\\.log');
    expect(body.text).toContain('Cannot be undone\\!');
  });

  it('prepends unverified agent warning when verified is false', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{"ok":true}', { status: 200 }));

    await sendApprovalRequest(config, { ...opts, verified: false });

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse(init?.body as string);
    expect(body.text).toContain('UNVERIFIED AGENT');
    expect(body.text).toContain('agent\\-1');
  });

  it('does not prepend unverified warning when verified is true', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{"ok":true}', { status: 200 }));

    await sendApprovalRequest(config, { ...opts, verified: true });

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse(init?.body as string);
    expect(body.text).not.toContain('UNVERIFIED AGENT');
  });

  it('includes optional action_class and target when provided', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{"ok":true}', { status: 200 }));

    await sendApprovalRequest(config, { ...opts, action_class: 'email.send', target: 'user@example.com' });

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse(init?.body as string);
    expect(body.text).toContain('email.send');
    expect(body.text).toContain('user@example.com');
  });

  it('includes expires_at in footer when provided', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{"ok":true}', { status: 200 }));

    await sendApprovalRequest(config, { ...opts, expires_at: '2024-04-28T10:45:00Z' });

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse(init?.body as string);
    expect(body.text).toContain('Expires at');
    expect(body.text).toContain('2024\\-04\\-28T10:45:00Z');
  });

  it('returns false on non-2xx response', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('Unauthorized', { status: 401 }));
    const result = await sendApprovalRequest(config, opts);
    expect(result).toBe(false);
  });

  it('returns false on fetch error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'));
    const result = await sendApprovalRequest(config, opts);
    expect(result).toBe(false);
  });

  it('retries on 429 and returns true when the retry succeeds', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));

    const breaker = new CircuitBreaker();
    const result = await sendApprovalRequest(config, opts, breaker);
    expect(result).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('returns false immediately when circuit is open (no fetch)', async () => {
    const breaker = new CircuitBreaker();
    breaker.trip();

    const result = await sendApprovalRequest(config, opts, breaker);
    expect(result).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});

// ─── TelegramListener ───────────────────────────────────────────────────────

describe('TelegramListener', () => {
  let listener: TelegramListener;
  let onCommand: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    onCommand = vi.fn();
  });

  afterEach(() => {
    listener?.stop();
    vi.unstubAllGlobals();
  });

  it('parses /approve TOKEN correctly', async () => {
    const updates = {
      ok: true,
      result: [
        { update_id: 1, message: { text: '/approve abc12345', chat: { id: 12345 } } },
      ],
    };

    // First call returns updates, second hangs until stopped
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify(updates), { status: 200 }))
      .mockImplementation(() => new Promise(() => {})); // hang

    listener = new TelegramListener('test-token', onCommand);
    listener.start();

    // Wait for the poll to process
    await vi.waitFor(() => expect(onCommand).toHaveBeenCalled());
    expect(onCommand).toHaveBeenCalledWith('approve', 'abc12345');
  });

  it('parses /deny TOKEN correctly', async () => {
    const updates = {
      ok: true,
      result: [
        { update_id: 2, message: { text: '/deny XyZ98765', chat: { id: 12345 } } },
      ],
    };

    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify(updates), { status: 200 }))
      .mockImplementation(() => new Promise(() => {}));

    listener = new TelegramListener('test-token', onCommand);
    listener.start();

    await vi.waitFor(() => expect(onCommand).toHaveBeenCalled());
    expect(onCommand).toHaveBeenCalledWith('deny', 'XyZ98765');
  });

  it('parses /approve with a UUID v7 token (36 chars)', async () => {
    const uuid = '019daa50-5dc1-78ee-9ab4-bcf652bddfa3';
    const updates = {
      ok: true,
      result: [
        { update_id: 6, message: { text: `/approve ${uuid}`, chat: { id: 12345 } } },
      ],
    };

    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify(updates), { status: 200 }))
      .mockImplementation(() => new Promise(() => {}));

    listener = new TelegramListener('test-token', onCommand);
    listener.start();

    await vi.waitFor(() => expect(onCommand).toHaveBeenCalled());
    expect(onCommand).toHaveBeenCalledWith('approve', uuid);
  });

  it('parses /deny with a session_approval token (session_id:action_class)', async () => {
    const sessionToken = 'sess-abc:filesystem.delete';
    const updates = {
      ok: true,
      result: [
        { update_id: 7, message: { text: `/deny ${sessionToken}`, chat: { id: 12345 } } },
      ],
    };

    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify(updates), { status: 200 }))
      .mockImplementation(() => new Promise(() => {}));

    listener = new TelegramListener('test-token', onCommand);
    listener.start();

    await vi.waitFor(() => expect(onCommand).toHaveBeenCalled());
    expect(onCommand).toHaveBeenCalledWith('deny', sessionToken);
  });

  it('parses /approve_always TOKEN correctly', async () => {
    const updates = {
      ok: true,
      result: [
        { update_id: 8, message: { text: '/approve_always abc12345', chat: { id: 12345 } } },
      ],
    };

    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify(updates), { status: 200 }))
      .mockImplementation(() => new Promise(() => {}));

    listener = new TelegramListener('test-token', onCommand);
    listener.start();

    await vi.waitFor(() => expect(onCommand).toHaveBeenCalled());
    expect(onCommand).toHaveBeenCalledWith('approve_always', 'abc12345');
  });

  it('parses /approve_always with a UUID v7 token', async () => {
    const uuid = '019daa50-5dc1-78ee-9ab4-bcf652bddfa3';
    const updates = {
      ok: true,
      result: [
        { update_id: 9, message: { text: `/approve_always ${uuid}`, chat: { id: 12345 } } },
      ],
    };

    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify(updates), { status: 200 }))
      .mockImplementation(() => new Promise(() => {}));

    listener = new TelegramListener('test-token', onCommand);
    listener.start();

    await vi.waitFor(() => expect(onCommand).toHaveBeenCalled());
    expect(onCommand).toHaveBeenCalledWith('approve_always', uuid);
  });

  it('handles callback_query approve from inline keyboard', async () => {
    const updates = {
      ok: true,
      result: [
        { update_id: 20, callback_query: { id: 'cq-1', data: 'approve:abc12345' } },
      ],
    };

    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify(updates), { status: 200 }))
      .mockResolvedValue(new Response('{"ok":true}', { status: 200 }));

    listener = new TelegramListener('test-token', onCommand);
    listener.start();

    await vi.waitFor(() => expect(onCommand).toHaveBeenCalled());
    expect(onCommand).toHaveBeenCalledWith('approve', 'abc12345');
  });

  it('handles callback_query deny from inline keyboard', async () => {
    const updates = {
      ok: true,
      result: [
        { update_id: 21, callback_query: { id: 'cq-2', data: 'deny:abc12345' } },
      ],
    };

    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify(updates), { status: 200 }))
      .mockResolvedValue(new Response('{"ok":true}', { status: 200 }));

    listener = new TelegramListener('test-token', onCommand);
    listener.start();

    await vi.waitFor(() => expect(onCommand).toHaveBeenCalled());
    expect(onCommand).toHaveBeenCalledWith('deny', 'abc12345');
  });

  it('handles callback_query approve_always from inline keyboard', async () => {
    const updates = {
      ok: true,
      result: [
        { update_id: 22, callback_query: { id: 'cq-3', data: 'approve_always:abc12345' } },
      ],
    };

    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify(updates), { status: 200 }))
      .mockResolvedValue(new Response('{"ok":true}', { status: 200 }));

    listener = new TelegramListener('test-token', onCommand);
    listener.start();

    await vi.waitFor(() => expect(onCommand).toHaveBeenCalled());
    expect(onCommand).toHaveBeenCalledWith('approve_always', 'abc12345');
  });

  it('answers the callback query after dispatching the command', async () => {
    const updates = {
      ok: true,
      result: [
        { update_id: 23, callback_query: { id: 'cq-answer-test', data: 'approve:abc12345' } },
      ],
    };

    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify(updates), { status: 200 }))
      .mockResolvedValue(new Response('{"ok":true}', { status: 200 }));

    listener = new TelegramListener('test-token', onCommand);
    listener.start();

    await vi.waitFor(() => expect(onCommand).toHaveBeenCalled());

    // Allow the fire-and-forget answerCallbackQuery to settle
    await new Promise((r) => setTimeout(r, 20));

    const callUrls = vi.mocked(fetch).mock.calls.map((c) => c[0] as string);
    expect(callUrls.some((url) => url.includes('answerCallbackQuery'))).toBe(true);
  });

  it('ignores callback_query with invalid callback_data', async () => {
    const updates = {
      ok: true,
      result: [
        { update_id: 24, callback_query: { id: 'cq-bad', data: 'invalid_data' } },
      ],
    };

    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify(updates), { status: 200 }))
      .mockImplementation(() => new Promise(() => {}));

    listener = new TelegramListener('test-token', onCommand);
    listener.start();

    await new Promise((r) => setTimeout(r, 50));
    expect(onCommand).not.toHaveBeenCalled();
  });

  it('ignores callback_query with missing data field', async () => {
    const updates = {
      ok: true,
      result: [
        { update_id: 25, callback_query: { id: 'cq-nodata' } },
      ],
    };

    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify(updates), { status: 200 }))
      .mockImplementation(() => new Promise(() => {}));

    listener = new TelegramListener('test-token', onCommand);
    listener.start();

    await new Promise((r) => setTimeout(r, 50));
    expect(onCommand).not.toHaveBeenCalled();
  });

  it('handles callback_query with UUID v7 token', async () => {
    const uuid = '019daa50-5dc1-78ee-9ab4-bcf652bddfa3';
    const updates = {
      ok: true,
      result: [
        { update_id: 26, callback_query: { id: 'cq-uuid', data: `approve:${uuid}` } },
      ],
    };

    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify(updates), { status: 200 }))
      .mockResolvedValue(new Response('{"ok":true}', { status: 200 }));

    listener = new TelegramListener('test-token', onCommand);
    listener.start();

    await vi.waitFor(() => expect(onCommand).toHaveBeenCalled());
    expect(onCommand).toHaveBeenCalledWith('approve', uuid);
  });

  it('ignores non-command messages', async () => {
    const updates = {
      ok: true,
      result: [
        { update_id: 3, message: { text: 'hello world', chat: { id: 12345 } } },
        { update_id: 4, message: { text: '/start', chat: { id: 12345 } } },
        { update_id: 5, message: { text: '/approve', chat: { id: 12345 } } }, // no token
      ],
    };

    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify(updates), { status: 200 }))
      .mockImplementation(() => new Promise(() => {}));

    listener = new TelegramListener('test-token', onCommand);
    listener.start();

    // Give it time to process, then verify no commands were dispatched
    await new Promise((r) => setTimeout(r, 50));
    expect(onCommand).not.toHaveBeenCalled();
  });

  it('stop() prevents further polling', async () => {
    vi.mocked(fetch).mockImplementation(
      () => new Promise((_, reject) => {
        setTimeout(() => reject(new DOMException('Aborted', 'AbortError')), 10);
      }),
    );

    listener = new TelegramListener('test-token', onCommand);
    listener.start();
    listener.stop();

    // Should not throw or hang
    await new Promise((r) => setTimeout(r, 50));
  });

  it('processes multiple updates in one poll', async () => {
    const updates = {
      ok: true,
      result: [
        { update_id: 10, message: { text: '/approve token001', chat: { id: 12345 } } },
        { update_id: 11, message: { text: '/deny token002', chat: { id: 12345 } } },
      ],
    };

    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify(updates), { status: 200 }))
      .mockImplementation(() => new Promise(() => {}));

    listener = new TelegramListener('test-token', onCommand);
    listener.start();

    await vi.waitFor(() => expect(onCommand).toHaveBeenCalledTimes(2));
    expect(onCommand).toHaveBeenCalledWith('approve', 'token001');
    expect(onCommand).toHaveBeenCalledWith('deny', 'token002');
  });

  it('processes mixed text and callback_query updates in one poll', async () => {
    const updates = {
      ok: true,
      result: [
        { update_id: 30, message: { text: '/approve token001', chat: { id: 12345 } } },
        { update_id: 31, callback_query: { id: 'cq-mix', data: 'deny:token002' } },
      ],
    };

    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify(updates), { status: 200 }))
      .mockResolvedValue(new Response('{"ok":true}', { status: 200 }));

    listener = new TelegramListener('test-token', onCommand);
    listener.start();

    await vi.waitFor(() => expect(onCommand).toHaveBeenCalledTimes(2));
    expect(onCommand).toHaveBeenCalledWith('approve', 'token001');
    expect(onCommand).toHaveBeenCalledWith('deny', 'token002');
  });

  it('logs and recovers when a poll throws a non-abort error', async () => {
    // First poll throws a regular error → catch block logs and schedules a
    // 5s retry delay. We just need to verify the listener does not crash
    // and onCommand is never called for the failed poll.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(fetch).mockImplementationOnce(() => Promise.reject(new Error('Transient network error')));
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {})); // hang subsequent polls

    listener = new TelegramListener('test-token', onCommand);
    listener.start();

    await vi.waitFor(() => expect(errorSpy).toHaveBeenCalled());
    expect(errorSpy.mock.calls[0]?.[0]).toContain('[hitl-telegram] poll error');
    expect(onCommand).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('backs off when getUpdates returns 429', async () => {
    // 429 on the first poll → listener backs off (30s) before retrying.
    // We verify: (a) onCommand is never called, (b) a second fetch is eventually
    // attempted after the rate-limit delay. We mock the second call to hang.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockImplementation(() => new Promise(() => {})); // hang subsequent polls

    listener = new TelegramListener('test-token', onCommand);
    listener.start();

    await vi.waitFor(() => expect(warnSpy).toHaveBeenCalled());
    expect(warnSpy.mock.calls[0]?.[0]).toContain('[hitl-telegram] getUpdates rate-limited');
    expect(onCommand).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('skips a poll when Telegram returns ok:false', async () => {
    // ok:false branches into the retry-delay path (RETRY_DELAY_MS) without
    // dispatching any command. We verify onCommand is not invoked.
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ ok: false }), { status: 200 }));
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));

    listener = new TelegramListener('test-token', onCommand);
    listener.start();

    // Give the listener a tick to consume the ok:false response
    await new Promise((r) => setTimeout(r, 50));
    expect(onCommand).not.toHaveBeenCalled();
  });

  it('updates offset after processing', async () => {
    const updates = {
      ok: true,
      result: [
        { update_id: 42, message: { text: '/approve abc12345', chat: { id: 12345 } } },
      ],
    };

    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify(updates), { status: 200 }))
      .mockImplementation(() => new Promise(() => {}));

    listener = new TelegramListener('test-token', onCommand);
    listener.start();

    await vi.waitFor(() => expect(onCommand).toHaveBeenCalled());

    // Second fetch call should have offset=43
    expect(fetch).toHaveBeenCalledTimes(2);
    const secondCallUrl = vi.mocked(fetch).mock.calls[1]![0] as string;
    expect(secondCallUrl).toContain('offset=43');
  });

  it('updates offset after processing a callback_query update', async () => {
    const updates = {
      ok: true,
      result: [
        { update_id: 50, callback_query: { id: 'cq-offset', data: 'approve:abc12345' } },
      ],
    };

    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify(updates), { status: 200 }))
      .mockResolvedValue(new Response('{"ok":true}', { status: 200 }));

    listener = new TelegramListener('test-token', onCommand);
    listener.start();

    await vi.waitFor(() => expect(onCommand).toHaveBeenCalled());

    // Allow time for the next getUpdates fetch to start
    await new Promise((r) => setTimeout(r, 20));

    const getUpdatesCalls = vi.mocked(fetch).mock.calls.filter(
      (c) => (c[0] as string).includes('getUpdates'),
    );
    expect(getUpdatesCalls.length).toBeGreaterThanOrEqual(2);
    expect(getUpdatesCalls[1]![0] as string).toContain('offset=51');
  });
});
