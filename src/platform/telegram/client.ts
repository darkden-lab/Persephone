import { Telegraf, type Context } from 'telegraf';
import { message } from 'telegraf/filters';
import { MessageBuffer, type BufferedMessage } from '../message-buffer.js';
import type {
  MessagingClient,
  ChannelInfo,
  SendMessageResult,
  SendNotificationResult,
  NotificationOptions,
  SendFileResult,
  AskQuestionResult,
} from '../messaging-client.js';
import {
  isAudioAttachment,
  processAudioAttachment,
  type DiscordAttachment,
} from '../../audio/voice-message-handler.js';
import { isSupportedAudioType } from '../../audio/decoder.js';
import { createReadStream } from 'node:fs';

const NOTIFICATION_EMOJIS = {
  success: '\u2705',
  error: '\u274C',
  warning: '\u26A0\uFE0F',
  info: '\u2139\uFE0F',
} as const;

export class TelegramClient implements MessagingClient {
  readonly platform = 'telegram';
  readonly maxMessageLength = 4096;
  readonly maxFileSize = 50 * 1024 * 1024; // 50 MB
  readonly buffer: MessageBuffer;

  private bot: Telegraf;
  private activeChatId: string | null = null;
  private activeChatName: string | null = null;
  private readyResolve!: () => void;
  private readyPromise: Promise<void>;
  private pendingWaitResolve: ((msg: BufferedMessage) => void) | null = null;
  private pendingCallbacks = new Map<string, (answer: string, respondent: string) => void>();

  constructor(token: string) {
    this.buffer = new MessageBuffer(100);
    this.bot = new Telegraf(token);

    this.readyPromise = new Promise<void>((resolve) => {
      this.readyResolve = resolve;
    });

    // Text messages
    this.bot.on(message('text'), (ctx) => {
      this.handleTextMessage(ctx);
    });

    // Voice messages (Telegram native voice = .oga = OGG Opus)
    this.bot.on(message('voice'), (ctx) => {
      this.handleVoiceMessage(ctx);
    });

    // Audio files (MP3, etc. sent as "audio" type)
    this.bot.on(message('audio'), (ctx) => {
      this.handleAudioMessage(ctx);
    });

    // Documents (could be audio files sent as documents)
    this.bot.on(message('document'), (ctx) => {
      this.handleDocumentMessage(ctx);
    });

    // Callback queries for inline keyboard buttons
    this.bot.on('callback_query', (ctx) => {
      if (!('data' in ctx.callbackQuery)) return;
      const data = ctx.callbackQuery.data;
      if (!data?.startsWith('persephone_')) return;

      const callback = this.pendingCallbacks.get(data);
      if (callback) {
        const respondent = ctx.callbackQuery.from.first_name ??
          ctx.callbackQuery.from.username ?? 'User';
        // Parse the selected label from data
        const label = data.replace(/^persephone_\d+_/, '');
        callback(label, respondent);
        ctx.answerCbQuery(`Selected: ${label}`).catch(() => {});
      }
    });

    // Launch the bot
    this.bot.launch().then(() => {
      this.readyResolve();
    }).catch(() => {
      this.readyResolve();
    });
  }

  private handleTextMessage(ctx: Context) {
    try {
      if (!ctx.message || !('text' in ctx.message)) return;
      const chatId = ctx.message.chat.id.toString();
      if (this.activeChatId && chatId !== this.activeChatId) return;
      if (ctx.message.from?.is_bot) return;

      const author = ctx.message.from?.first_name ?? ctx.message.from?.username ?? 'User';
      const buffered: BufferedMessage = {
        author,
        content: ctx.message.text,
        timestamp: new Date(ctx.message.date * 1000).toISOString(),
        attachments: [],
      };

      this.buffer.push(buffered);
      this.pendingWaitResolve?.(buffered);
      this.pendingWaitResolve = null;
    } catch {
      // Silently ignore
    }
  }

  private handleVoiceMessage(ctx: Context) {
    try {
      if (!ctx.message || !('voice' in ctx.message)) return;
      const chatId = ctx.message.chat.id.toString();
      if (this.activeChatId && chatId !== this.activeChatId) return;
      if (ctx.message.from?.is_bot) return;

      const author = ctx.message.from?.first_name ?? ctx.message.from?.username ?? 'User';
      const voice = ctx.message.voice;

      const buffered: BufferedMessage = {
        author,
        content: '',
        timestamp: new Date(ctx.message.date * 1000).toISOString(),
        attachments: [],
        transcription: '[transcribing...]',
        voiceDurationMs: voice.duration * 1000,
      };

      this.buffer.push(buffered);

      // Get file URL and transcribe
      ctx.telegram.getFileLink(voice.file_id).then((url) => {
        processAudioAttachment(url.href, 'audio/ogg', buffered).catch(() => {});
      }).catch(() => {
        buffered.transcription = '[download failed]';
      });

      this.pendingWaitResolve?.(buffered);
      this.pendingWaitResolve = null;
    } catch {
      // Silently ignore
    }
  }

  private handleAudioMessage(ctx: Context) {
    try {
      if (!ctx.message || !('audio' in ctx.message)) return;
      const chatId = ctx.message.chat.id.toString();
      if (this.activeChatId && chatId !== this.activeChatId) return;
      if (ctx.message.from?.is_bot) return;

      const author = ctx.message.from?.first_name ?? ctx.message.from?.username ?? 'User';
      const audio = ctx.message.audio;
      const mimeType = audio.mime_type ?? 'audio/mpeg';

      const buffered: BufferedMessage = {
        author,
        content: ctx.message.caption ?? '',
        timestamp: new Date(ctx.message.date * 1000).toISOString(),
        attachments: [],
      };

      if (isSupportedAudioType(mimeType)) {
        buffered.transcription = '[transcribing...]';
        this.buffer.push(buffered);

        ctx.telegram.getFileLink(audio.file_id).then((url) => {
          buffered.attachments = [url.href];
          processAudioAttachment(url.href, mimeType, buffered).catch(() => {});
        }).catch(() => {
          buffered.transcription = '[download failed]';
        });
      } else {
        this.buffer.push(buffered);
      }

      this.pendingWaitResolve?.(buffered);
      this.pendingWaitResolve = null;
    } catch {
      // Silently ignore
    }
  }

  private handleDocumentMessage(ctx: Context) {
    try {
      if (!ctx.message || !('document' in ctx.message)) return;
      const chatId = ctx.message.chat.id.toString();
      if (this.activeChatId && chatId !== this.activeChatId) return;
      if (ctx.message.from?.is_bot) return;

      const author = ctx.message.from?.first_name ?? ctx.message.from?.username ?? 'User';
      const doc = ctx.message.document;
      const mimeType = doc.mime_type ?? '';

      const buffered: BufferedMessage = {
        author,
        content: ctx.message.caption ?? '',
        timestamp: new Date(ctx.message.date * 1000).toISOString(),
        attachments: [],
      };

      if (isSupportedAudioType(mimeType)) {
        buffered.transcription = '[transcribing...]';
        this.buffer.push(buffered);

        ctx.telegram.getFileLink(doc.file_id).then((url) => {
          buffered.attachments = [url.href];
          processAudioAttachment(url.href, mimeType, buffered).catch(() => {});
        }).catch(() => {
          buffered.transcription = '[download failed]';
        });
      } else {
        this.buffer.push(buffered);
      }

      this.pendingWaitResolve?.(buffered);
      this.pendingWaitResolve = null;
    } catch {
      // Silently ignore
    }
  }

  async waitUntilReady(): Promise<void> {
    return this.readyPromise;
  }

  async destroy(): Promise<void> {
    this.activeChatId = null;
    this.activeChatName = null;
    this.buffer.clear();
    this.pendingCallbacks.clear();
    this.bot.stop('shutdown');
  }

  validateChannelId(channelId: string): boolean {
    // Telegram chat IDs can be negative (groups/supergroups)
    return /^-?\d+$/.test(channelId);
  }

  async setChannel(channelId: string): Promise<ChannelInfo> {
    await this.readyPromise;
    const chat = await this.bot.telegram.getChat(channelId);
    this.activeChatId = channelId;

    let channelName = 'Unknown';
    if ('title' in chat) {
      channelName = chat.title ?? 'Unknown';
    } else if ('first_name' in chat) {
      channelName = chat.first_name ?? 'Unknown';
    }
    this.activeChatName = channelName;

    this.buffer.clear();
    return { channel_name: channelName };
  }

  getActiveChannelName(): string {
    if (!this.activeChatId) {
      throw new Error('No active channel. Call set_channel first.');
    }
    return this.activeChatName ?? 'Unknown';
  }

  private getChatId(): string {
    if (!this.activeChatId) {
      throw new Error('No active channel. Call set_channel first.');
    }
    return this.activeChatId;
  }

  async sendMessage(content: string): Promise<SendMessageResult> {
    const chatId = this.getChatId();

    if (content.length <= this.maxMessageLength) {
      const msg = await this.bot.telegram.sendMessage(chatId, content, { parse_mode: 'Markdown' });
      return {
        message_id: msg.message_id.toString(),
        timestamp: new Date(msg.date * 1000).toISOString(),
      };
    }

    // Split long messages
    const chunks = this.splitMessage(content, this.maxMessageLength);
    let lastMsg: { message_id: number; date: number } | null = null;
    for (const chunk of chunks) {
      lastMsg = await this.bot.telegram.sendMessage(chatId, chunk, { parse_mode: 'Markdown' });
    }
    return {
      message_id: lastMsg!.message_id.toString(),
      timestamp: new Date(lastMsg!.date * 1000).toISOString(),
    };
  }

  async sendNotification(options: NotificationOptions): Promise<SendNotificationResult> {
    const chatId = this.getChatId();
    const emoji = NOTIFICATION_EMOJIS[options.type];

    let text = `${emoji} *${options.title}*\n\n${options.description}`;

    if (options.fields && options.fields.length > 0) {
      text += '\n';
      for (const field of options.fields) {
        text += `\n*${field.name}:* ${field.value}`;
      }
    }

    const msg = await this.bot.telegram.sendMessage(chatId, text, { parse_mode: 'Markdown' });
    return { message_id: msg.message_id.toString() };
  }

  async sendFile(filePath: string, msgText?: string): Promise<SendFileResult> {
    const chatId = this.getChatId();
    const msg = await this.bot.telegram.sendDocument(chatId, {
      source: createReadStream(filePath),
    }, {
      caption: msgText,
    });

    return {
      message_id: msg.message_id.toString(),
      file_url: '',
    };
  }

  async askQuestion(
    question: string,
    options: string[],
    timeout = 120,
  ): Promise<AskQuestionResult> {
    const chatId = this.getChatId();
    const questionId = Date.now().toString(36);

    const inlineKeyboard = options.map((label, i) => [{
      text: label,
      callback_data: `persephone_${questionId}_${label}`.slice(0, 64),
    }]);

    const msg = await this.bot.telegram.sendMessage(chatId, question, {
      reply_markup: { inline_keyboard: inlineKeyboard },
    });

    return new Promise<AskQuestionResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        // Cleanup callbacks
        for (const [key] of this.pendingCallbacks) {
          if (key.startsWith(`persephone_${questionId}_`)) {
            this.pendingCallbacks.delete(key);
          }
        }
        // Remove inline keyboard on timeout
        this.bot.telegram.editMessageText(
          chatId,
          msg.message_id,
          undefined,
          `${question}\n\n_(timed out)_`,
          { parse_mode: 'Markdown' },
        ).catch(() => {});
        reject(new Error(`No response within ${timeout} seconds`));
      }, timeout * 1000);

      for (const option of options) {
        const callbackKey = `persephone_${questionId}_${option}`.slice(0, 64);
        this.pendingCallbacks.set(callbackKey, (selected, respondent) => {
          clearTimeout(timer);
          // Cleanup all callbacks for this question
          for (const [key] of this.pendingCallbacks) {
            if (key.startsWith(`persephone_${questionId}_`)) {
              this.pendingCallbacks.delete(key);
            }
          }
          // Update message to show selection
          this.bot.telegram.editMessageText(
            chatId,
            msg.message_id,
            undefined,
            `${question}\n\n*${respondent}* selected: *${selected}*`,
            { parse_mode: 'Markdown' },
          ).catch(() => {});
          resolve({ selected, respondent });
        });
      }
    });
  }

  async waitForMessage(timeout = 120): Promise<BufferedMessage> {
    this.getChatId(); // Validate active chat

    // Check buffer first for unread messages
    const existing = this.buffer.getNewSinceLastRead(1);
    if (existing.length > 0) {
      return existing[0];
    }

    return new Promise<BufferedMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingWaitResolve = null;
        reject(new Error(`No message received within ${timeout} seconds`));
      }, timeout * 1000);

      this.pendingWaitResolve = (msg: BufferedMessage) => {
        clearTimeout(timer);
        // Read from buffer to advance the read pointer
        const newMessages = this.buffer.getNewSinceLastRead(1);
        if (newMessages.length > 0) {
          resolve(newMessages[0]);
        } else {
          resolve(msg);
        }
      };
    });
  }

  private splitMessage(content: string, maxLength: number): string[] {
    const chunks: string[] = [];
    let remaining = content;
    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }
      let splitAt = remaining.lastIndexOf('\n', maxLength);
      if (splitAt <= 0 || splitAt < maxLength * 0.5) {
        splitAt = maxLength;
      }
      chunks.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt).replace(/^\n/, '');
    }
    return chunks;
  }
}
