export interface BufferedMessage {
  author: string;
  content: string;
  timestamp: string;
  attachments: string[];
  transcription?: string;
  voiceDurationMs?: number;
}

export class MessageBuffer {
  private messages: BufferedMessage[] = [];
  private lastReadIndex = 0;

  constructor(private capacity = 100) {}

  push(message: BufferedMessage): void {
    this.messages.push(message);
    if (this.messages.length > this.capacity) {
      const overflow = this.messages.length - this.capacity;
      this.messages.splice(0, overflow);
      this.lastReadIndex = Math.max(0, this.lastReadIndex - overflow);
    }
  }

  getAll(limit?: number): BufferedMessage[] {
    if (limit !== undefined) {
      if (limit <= 0) return [];
      if (limit < this.messages.length) {
        return this.messages.slice(-limit);
      }
    }
    return [...this.messages];
  }

  getNewSinceLastRead(limit?: number): BufferedMessage[] {
    if (limit !== undefined && limit <= 0) return [];
    const newMessages = this.messages.slice(this.lastReadIndex);
    this.lastReadIndex = this.messages.length;
    if (limit !== undefined && limit < newMessages.length) {
      return newMessages.slice(-limit);
    }
    return newMessages;
  }

  clear(): void {
    this.messages = [];
    this.lastReadIndex = 0;
  }
}
