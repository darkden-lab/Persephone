#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const SIGNAL_DIR = join(homedir(), '.claude', 'persephone');

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

  // Find any pending signal files
  let files;
  try {
    files = readdirSync(SIGNAL_DIR).filter(f => f.startsWith('pending-') && f.endsWith('.json'));
  } catch {
    process.exit(0); // Directory doesn't exist
  }

  if (files.length === 0) {
    process.exit(0);
  }

  // Read the most recent signal file
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
    decision: 'block',
    reason: `[PERSEPHONE] ${msg} — Use check_messages to read them and respond via send_message.`,
  }));
} catch {
  process.exit(0);
}
