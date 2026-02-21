import {
  Client,
  Events,
  GatewayIntentBits,
  TextChannel,
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  type Message,
} from 'discord.js';
import { MessageBuffer, type BufferedMessage } from './message-buffer.js';
import { signalPending, clearPending } from './pending-signal.js';

export class DiscordClient {
  private client: Client;
  private activeChannel: TextChannel | null = null;
  readonly buffer: MessageBuffer;
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
        this.buffer.push({
          author,
          content: message.content,
          timestamp: message.createdAt.toISOString(),
          attachments: message.attachments.map((a) => a.url),
        });
        signalPending(author, message.content);
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

  async setChannel(channelId: string): Promise<{ channel_name: string; guild_name: string }> {
    await this.readyPromise;
    const channel = await this.client.channels.fetch(channelId);
    if (!channel || !(channel instanceof TextChannel)) {
      throw new Error(`Channel ${channelId} not found or is not a text channel`);
    }
    this.activeChannel = channel;
    this.buffer.clear();
    return {
      channel_name: channel.name,
      guild_name: channel.guild.name,
    };
  }

  getActiveChannel(): TextChannel {
    if (!this.activeChannel) {
      throw new Error('No active channel. Call set_channel first.');
    }
    return this.activeChannel;
  }

  async sendMessage(content: string): Promise<{ message_id: string; timestamp: string }> {
    const channel = this.getActiveChannel();
    // Auto-split messages exceeding 2000 chars
    if (content.length <= 2000) {
      const msg = await channel.send(content);
      return { message_id: msg.id, timestamp: msg.createdAt.toISOString() };
    }
    const chunks = this.splitMessage(content, 2000);
    let lastMsg: Message | null = null;
    for (const chunk of chunks) {
      lastMsg = await channel.send(chunk);
    }
    return { message_id: lastMsg!.id, timestamp: lastMsg!.createdAt.toISOString() };
  }

  async sendEmbed(embed: EmbedBuilder): Promise<{ message_id: string }> {
    const channel = this.getActiveChannel();
    const msg = await channel.send({ embeds: [embed] });
    return { message_id: msg.id };
  }

  async sendFile(
    filePath: string,
    message?: string,
  ): Promise<{ message_id: string; file_url: string }> {
    const channel = this.getActiveChannel();
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
    timeoutSeconds = 120,
  ): Promise<{ selected: string; respondent: string }> {
    const channel = this.getActiveChannel();

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

    // Discord allows max 5 buttons per row
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
        time: timeoutSeconds * 1000,
      });

      const selectedIndex = parseInt(interaction.customId.replace('persephone_opt_', ''), 10);
      const selected = Number.isNaN(selectedIndex) ? options[0] : (options[selectedIndex] ?? options[0]);
      const respondent = interaction.user.displayName ?? interaction.user.username;

      // Update message to show selection and remove buttons
      await interaction.update({
        content: `${question}\n\n**${respondent}** selected: **${selected}**`,
        components: [],
      });

      return { selected, respondent };
    } catch {
      // Timeout — disable buttons
      const disabledRows = rows.map((row) => {
        const disabledRow = new ActionRowBuilder<ButtonBuilder>();
        disabledRow.addComponents(
          row.components.map((btn) => ButtonBuilder.from(btn.toJSON()).setDisabled(true)),
        );
        return disabledRow;
      });
      await msg.edit({ content: `${question}\n\n*(timed out)*`, components: disabledRows });
      throw new Error(`No response within ${timeoutSeconds} seconds`);
    }
  }

  async waitForMessage(timeoutSeconds = 120): Promise<BufferedMessage> {
    const channel = this.getActiveChannel();

    // Check buffer first for unread messages
    const existing = this.buffer.getNewSinceLastRead(1);
    if (existing.length > 0) {
      clearPending();
      return existing[0];
    }

    // Wait for a new message — the constructor's MessageCreate handler
    // already pushes to buffer and calls signalPending, so we just poll
    // the buffer to avoid double-processing.
    this.pendingWaitAbort?.abort();
    const abortController = new AbortController();
    this.pendingWaitAbort = abortController;

    return new Promise<BufferedMessage>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout);
        this.client.off(Events.MessageCreate, handler);
        this.pendingWaitAbort = null;
      };

      abortController.signal.addEventListener('abort', () => {
        cleanup();
        reject(new Error('Wait aborted due to client shutdown'));
      });

      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`No message received within ${timeoutSeconds} seconds`));
      }, timeoutSeconds * 1000);

      const handler = (message: Message) => {
        if (message.author.bot) return;
        if (message.channel.id !== channel.id) return;

        cleanup();

        // Read from buffer instead of creating a duplicate object
        const newMessages = this.buffer.getNewSinceLastRead(1);
        clearPending();
        if (newMessages.length > 0) {
          resolve(newMessages[0]);
        } else {
          // Fallback: construct from message (should not happen normally)
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
      // Try to split at a newline
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
