import {
  Client,
  Events,
  GatewayIntentBits,
  TextChannel,
  EmbedBuilder,
  AttachmentBuilder,
  type Message,
} from 'discord.js';
import { MessageBuffer, type BufferedMessage } from './message-buffer.js';

export class DiscordClient {
  private client: Client;
  private activeChannel: TextChannel | null = null;
  readonly buffer: MessageBuffer;
  private ready = false;

  constructor(token: string) {
    this.buffer = new MessageBuffer(100);
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    this.client.on(Events.MessageCreate, (message: Message) => {
      if (message.author.bot) return;
      if (!this.activeChannel || message.channel.id !== this.activeChannel.id) return;

      this.buffer.push({
        author: message.author.displayName ?? message.author.username,
        content: message.content,
        timestamp: message.createdAt.toISOString(),
        attachments: message.attachments.map((a) => a.url),
      });
    });

    this.client.once(Events.ClientReady, () => {
      this.ready = true;
    });

    this.client.login(token);
  }

  isReady(): boolean {
    return this.ready;
  }

  async setChannel(channelId: string): Promise<{ channel_name: string; guild_name: string }> {
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
