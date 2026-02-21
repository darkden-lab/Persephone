import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const SIGNAL_FILE = join(tmpdir(), 'persephone-pending.json');

export interface PendingInfo {
  count: number;
  latest: { author: string; preview: string };
}

export function signalPending(author: string, content: string): void {
  let count = 1;
  try {
    if (existsSync(SIGNAL_FILE)) {
      const existing = JSON.parse(readFileSync(SIGNAL_FILE, 'utf8'));
      count = (existing.count ?? 0) + 1;
    }
  } catch {
    // ignore parse errors
  }

  const info: PendingInfo = {
    count,
    latest: { author, preview: content.slice(0, 100) },
  };
  writeFileSync(SIGNAL_FILE, JSON.stringify(info));
}

export function clearPending(): void {
  try {
    if (existsSync(SIGNAL_FILE)) unlinkSync(SIGNAL_FILE);
  } catch {
    // ignore
  }
}

export function getSignalFilePath(): string {
  return SIGNAL_FILE;
}
