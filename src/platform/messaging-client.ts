import type { MessageBuffer, BufferedMessage } from './message-buffer.js';

export interface ChannelInfo {
  channel_name: string;
  context_name?: string;
}

export interface SendMessageResult {
  message_id: string;
  timestamp: string;
}

export interface SendNotificationResult {
  message_id: string;
}

export interface NotificationOptions {
  title: string;
  description: string;
  type: 'success' | 'error' | 'warning' | 'info';
  fields?: { name: string; value: string }[];
}

export interface SendFileResult {
  message_id: string;
  file_url: string;
}

export interface AskQuestionResult {
  selected: string;
  respondent: string;
}

export interface MessagingClient {
  readonly platform: string;
  readonly buffer: MessageBuffer;
  readonly maxMessageLength: number;
  readonly maxFileSize: number;

  waitUntilReady(): Promise<void>;
  destroy(): Promise<void>;
  setChannel(channelId: string): Promise<ChannelInfo>;
  getActiveChannelName(): string;
  validateChannelId(channelId: string): boolean;
  sendMessage(content: string): Promise<SendMessageResult>;
  sendNotification(options: NotificationOptions): Promise<SendNotificationResult>;
  sendFile(filePath: string, message?: string): Promise<SendFileResult>;
  askQuestion(question: string, options: string[], timeout?: number): Promise<AskQuestionResult>;
  waitForMessage(timeout?: number): Promise<BufferedMessage>;
}
