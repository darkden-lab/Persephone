#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const SIGNAL_FILE = join(tmpdir(), 'persephone-pending.json');

// Read hook input from stdin
let input = '';
for await (const chunk of process.stdin) {
  input += chunk;
}

try {
  const hookInput = JSON.parse(input);

  // Prevent infinite loops: if we already blocked once, let Claude stop
  if (hookInput.stop_hook_active) {
    process.exit(0);
  }

  if (!existsSync(SIGNAL_FILE)) {
    process.exit(0);
  }

  const info = JSON.parse(readFileSync(SIGNAL_FILE, 'utf8'));
  if (!info.count || info.count <= 0) {
    process.exit(0);
  }

  const msg = info.count === 1
    ? `${info.latest.author} sent a Discord message: "${info.latest.preview}"`
    : `${info.count} unread Discord messages. Latest from ${info.latest.author}: "${info.latest.preview}"`;

  // Block Claude from stopping and tell it to check Discord
  console.log(JSON.stringify({
    decision: 'block',
    reason: `[PERSEPHONE] ${msg} — Use check_messages to read them and respond via send_message.`,
  }));
} catch {
  // If anything fails, allow stop
  process.exit(0);
}
