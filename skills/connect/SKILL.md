---
description: Connect to a Discord channel for messaging, notifications, and file sharing
---

The user wants to connect Claude Code to a Discord channel. Extract the channel ID from their message and establish the connection.

## Instructions

1. Extract the channel ID from the user's message. It should be a numeric string (e.g., "1234567890123456789"). If they mention a channel name instead, ask them for the channel ID.

2. Call the `set_channel` tool with the channel ID:
   - If successful, confirm the connection showing the channel name and server name
   - If it fails, show the error and ask the user to verify the channel ID and bot permissions

3. After connecting, send a test notification to the channel using `send_notification`:
   - title: "Persephone Connected"
   - description: "Claude Code is now connected to this channel."
   - type: "info"

4. Inform the user that the connection is active and they can now:
   - Send messages from Claude to Discord
   - Receive messages sent in the Discord channel
   - Send notifications and files
