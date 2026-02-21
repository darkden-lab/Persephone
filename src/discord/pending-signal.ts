import { writeFileSync, unlinkSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// Use a user-scoped directory instead of world-readable tmpdir
const SIGNAL_DIR = join(homedir(), '.claude', 'persephone');
const SIGNAL_FILE = join(SIGNAL_DIR, `pending-${process.pid}.json`);

export interface PendingInfo {
  count: number;
  latest: { author: string; preview: string };
}

export function signalPending(author: string, content: string): void {
  try {
    mkdirSync(SIGNAL_DIR, { recursive: true });

    // Read existing count — single readFileSync in try/catch avoids TOCTOU race
    let count = 1;
    try {
      const existing = JSON.parse(readFileSync(SIGNAL_FILE, 'utf8'));
      count = (existing.count ?? 0) + 1;
    } catch {
      // File doesn't exist or is invalid — start fresh
    }

    const info: PendingInfo = {
      count,
      latest: { author, preview: content.slice(0, 100) },
    };
    writeFileSync(SIGNAL_FILE, JSON.stringify(info), { mode: 0o600 });
  } catch {
    // Silently fail — signal is best-effort
  }
}

export function clearPending(): void {
  try {
    unlinkSync(SIGNAL_FILE);
  } catch {
    // File may not exist — that's fine
  }
}

export function getSignalFilePath(): string {
  return SIGNAL_FILE;
}
