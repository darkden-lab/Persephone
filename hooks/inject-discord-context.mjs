#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const SIGNAL_DIR = join(homedir(), '.claude', 'persephone');

// Read hook input from stdin (required by Claude Code hooks)
let input = '';
for await (const chunk of process.stdin) {
  input += chunk;
}

try {
  // Find any pending signal files
  let files;
  try {
    files = readdirSync(SIGNAL_DIR).filter(f => f.startsWith('pending-') && f.endsWith('.json'));
  } catch {
    process.exit(0);
  }

  if (files.length === 0) {
    process.exit(0);
  }

  let totalCount = 0;
  let latestAuthor = '';
  let latestPreview = '';

  for (const file of files) {
    try {
      const info = JSON.parse(readFileSync(join(SIGNAL_DIR, file), 'utf8'));
      if (info.count > 0) {
        totalCount += info.count;
        latestAuthor = info.latest?.author ?? latestAuthor;
        latestPreview = info.latest?.preview ?? latestPreview;
      }
    } catch {
      // Skip invalid files
    }
  }

  if (totalCount <= 0) {
    process.exit(0);
  }

  const msg = totalCount === 1
    ? `${latestAuthor} sent a Discord message: "${latestPreview}"`
    : `${totalCount} unread Discord messages. Latest from ${latestAuthor}: "${latestPreview}"`;

  console.log(JSON.stringify({
    additionalContext: `[PERSEPHONE] ${msg} — Use check_messages to read them and respond via send_message.`,
  }));
} catch {
  process.exit(0);
}
