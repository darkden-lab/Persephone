import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  TextChannel,
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  type Message,
} from 'discord.js';
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
  isVoiceAttachment,
  isAudioAttachment,
  processVoiceMessage,
  processAudioAttachment,
  type DiscordAttachment,
} from '../../audio/voice-message-handler.js';

const NOTIFICATION_COLORS = {
  success: 0x22c55e,
  error: 0xef4444,
  warning: 0xeab308,
  info: 0x3b82f6,
} as const;

export class DiscordClient implements MessagingClient {
  readonly platform = 'discord';
  readonly maxMessageLength = 2000;
  readonly maxFileSize = 25 * 1024 * 1024; // 25 MB
  readonly buffer: MessageBuffer;

  private client: Client;
  private activeChannel: TextChannel | null = null;
  private readyPromise: Promise<void>;
  private pendingWaitAbort: AbortController | null = null;

  constructor(token: string) {
    this.buffer = new MessageBuffer(100);
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    this.readyPromise = new Promise<void>((resolve) => {
      this.client.once(Events.ClientReady, () => resolve());
    });

    this.client.on(Events.MessageCreate, (message: Message) => {
      try {
        if (message.author.bot) return;
        if (!this.activeChannel || message.channel.id !== this.activeChannel.id) return;

        const author = message.author.displayName ?? message.author.username;
        const isVoice = message.flags.has(MessageFlags.IsVoiceMessage);

        // Find voice attachment if this is a voice message
        let voiceAttachment: DiscordAttachment | undefined;
        if (isVoice) {
          for (const [, att] of message.attachments) {
            const da: DiscordAttachment = {
              url: att.url,
              contentType: att.contentType,
              duration: att.duration,
              waveform: att.waveform,
            };
            if (isVoiceAttachment(da)) {
              voiceAttachment = da;
              break;
            }
          }
        }

        // Check for regular audio file attachments (MP3, WAV, OGG without waveform)
        let audioAttachment: DiscordAttachment | undefined;
        if (!isVoice) {
          for (const [, att] of message.attachments) {
            const da: DiscordAttachment = {
              url: att.url,
              contentType: att.contentType,
              duration: att.duration,
              waveform: att.waveform,
            };
            if (isAudioAttachment(da)) {
              audioAttachment = da;
              break;
            }
          }
        }

        const buffered: BufferedMessage = {
          author,
          content: message.content,
          timestamp: message.createdAt.toISOString(),
          attachments: message.attachments.map((a) => a.url),
        };

        if (voiceAttachment) {
          buffered.transcription = '[transcribing...]';
          buffered.voiceDurationMs = typeof voiceAttachment.duration === 'number'
            ? voiceAttachment.duration * 1000
            : undefined;
        } else if (audioAttachment) {
          buffered.transcription = '[transcribing...]';
        }

        this.buffer.push(buffered);

        if (voiceAttachment) {
          processVoiceMessage(voiceAttachment.url, buffered).catch(() => {});
        } else if (audioAttachment) {
          processAudioAttachment(
            audioAttachment.url,
            audioAttachment.contentType ?? 'audio/ogg',
            buffered,
          ).catch(() => {});
        }
      } catch {
        // Silently ignore errors in message handler to avoid crashing the bot
      }
    });

    this.client.login(token);
  }

  async waitUntilReady(): Promise<void> {
    return this.readyPromise;
  }

  async destroy(): Promise<void> {
    this.pendingWaitAbort?.abort();
    this.pendingWaitAbort = null;
    this.activeChannel = null;
    this.buffer.clear();
    this.client.destroy();
  }

  validateChannelId(channelId: string): boolean {
    return /^\d+$/.test(channelId);
  }

  async setChannel(channelId: string): Promise<ChannelInfo> {
    await this.readyPromise;
    const channel = await this.client.channels.fetch(channelId);
    if (!channel || !(channel instanceof TextChannel)) {
      throw new Error(`Channel ${channelId} not found or is not a text channel`);
    }
    this.activeChannel = channel;
    this.buffer.clear();
    return {
      channel_name: channel.name,
      context_name: channel.guild.name,
    };
  }

  getActiveChannelName(): string {
    if (!this.activeChannel) {
      throw new Error('No active channel. Call set_channel first.');
    }
    return this.activeChannel.name;
  }

  private getChannel(): TextChannel {
    if (!this.activeChannel) {
      throw new Error('No active channel. Call set_channel first.');
    }
    return this.activeChannel;
  }

  async sendMessage(content: string): Promise<SendMessageResult> {
    const channel = this.getChannel();
    if (content.length <= this.maxMessageLength) {
      const msg = await channel.send(content);
      return { message_id: msg.id, timestamp: msg.createdAt.toISOString() };
    }
    const chunks = this.splitMessage(content, this.maxMessageLength);
    let lastMsg: Message | null = null;
    for (const chunk of chunks) {
      lastMsg = await channel.send(chunk);
    }
    return { message_id: lastMsg!.id, timestamp: lastMsg!.createdAt.toISOString() };
  }

  async sendNotification(options: NotificationOptions): Promise<SendNotificationResult> {
    const channel = this.getChannel();
    const embed = new EmbedBuilder()
      .setTitle(options.title)
      .setDescription(options.description)
      .setColor(NOTIFICATION_COLORS[options.type])
      .setTimestamp();

    if (options.fields) {
      for (const field of options.fields) {
        embed.addFields({ name: field.name, value: field.value, inline: true });
      }
    }

    const msg = await channel.send({ embeds: [embed] });
    return { message_id: msg.id };
  }

  async sendFile(
    filePath: string,
    message?: string,
  ): Promise<SendFileResult> {
    const channel = this.getChannel();
    const attachment = new AttachmentBuilder(filePath);
    const msg = await channel.send({
      content: message ?? '',
      files: [attachment],
    });
    const fileUrl = msg.attachments.first()?.url ?? '';
    return { message_id: msg.id, file_url: fileUrl };
  }

  async askQuestion(
    question: string,
    options: string[],
    timeout = 120,
  ): Promise<AskQuestionResult> {
    const channel = this.getChannel();

    const BUTTON_STYLES = [
      ButtonStyle.Primary,
      ButtonStyle.Secondary,
      ButtonStyle.Success,
      ButtonStyle.Danger,
      ButtonStyle.Primary,
    ];

    const buttons = options.map((label, i) =>
      new ButtonBuilder()
        .setCustomId(`persephone_opt_${i}`)
        .setLabel(label)
        .setStyle(BUTTON_STYLES[i % BUTTON_STYLES.length]),
    );

    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    for (let i = 0; i < buttons.length; i += 5) {
      rows.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(i, i + 5)),
      );
    }

    const msg = await channel.send({
      content: question,
      components: rows,
    });

    try {
      const interaction = await msg.awaitMessageComponent({
        componentType: ComponentType.Button,
        time: timeout * 1000,
      });

      const selectedIndex = parseInt(interaction.customId.replace('persephone_opt_', ''), 10);
      const selected = Number.isNaN(selectedIndex) ? options[0] : (options[selectedIndex] ?? options[0]);
      const respondent = interaction.user.displayName ?? interaction.user.username;

      await interaction.update({
        content: `${question}\n\n**${respondent}** selected: **${selected}**`,
        components: [],
      });

      return { selected, respondent };
    } catch {
      const disabledRows = rows.map((row) => {
        const disabledRow = new ActionRowBuilder<ButtonBuilder>();
        disabledRow.addComponents(
          row.components.map((btn) => ButtonBuilder.from(btn.toJSON()).setDisabled(true)),
        );
        return disabledRow;
      });
      await msg.edit({ content: `${question}\n\n*(timed out)*`, components: disabledRows });
      throw new Error(`No response within ${timeout} seconds`);
    }
  }

  async waitForMessage(timeout = 120): Promise<BufferedMessage> {
    const channel = this.getChannel();

    const existing = this.buffer.getNewSinceLastRead(1);
    if (existing.length > 0) {
      return existing[0];
    }

    this.pendingWaitAbort?.abort();
    const abortController = new AbortController();
    this.pendingWaitAbort = abortController;

    return new Promise<BufferedMessage>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        this.client.off(Events.MessageCreate, handler);
        this.pendingWaitAbort = null;
      };

      abortController.signal.addEventListener('abort', () => {
        cleanup();
        reject(new Error('Wait aborted due to client shutdown'));
      });

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`No message received within ${timeout} seconds`));
      }, timeout * 1000);

      const handler = (message: Message) => {
        if (message.author.bot) return;
        if (message.channel.id !== channel.id) return;

        cleanup();

        const newMessages = this.buffer.getNewSinceLastRead(1);
        if (newMessages.length > 0) {
          resolve(newMessages[0]);
        } else {
          resolve({
            author: message.author.displayName ?? message.author.username,
            content: message.content,
            timestamp: message.createdAt.toISOString(),
            attachments: message.attachments.map((a) => a.url),
          });
        }
      };

      this.client.on(Events.MessageCreate, handler);
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
