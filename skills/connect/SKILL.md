---
description: Connect to a Discord or Telegram channel for messaging, notifications, and file sharing
---

The user wants to connect Claude Code to a messaging channel. Extract the channel/chat ID from their message and establish the connection.

## Instructions

1. Extract the channel or chat ID from the user's message. It should be a numeric string (e.g., "1234567890123456789" for Discord, or "-100123456789" for Telegram groups). If they mention a channel name instead, ask them for the ID.

2. Call the `set_channel` tool with the channel ID:
   - If successful, confirm the connection showing the channel name and context (server/group name if available)
   - If it fails, show the error and ask the user to verify the ID and bot permissions

3. After connecting, send a test notification to the channel using `send_notification`:
   - title: "Persephone Connected"
   - description: "Claude Code is now connected to this channel."
   - type: "info"

4. Inform the user that the connection is active and they can now:
   - Send messages from Claude to the channel
   - Receive messages sent in the channel
   - Send notifications and files
   - Ask interactive questions with buttons via `ask_question`

## Listening

After connecting, you should periodically check for messages using `check_messages` between tasks. When the user is idle or waiting, use `wait_for_message` to actively listen for input.

Treat messages received from the channel exactly like messages typed in the CLI — process them, respond to them via `send_message`, and continue listening.

To enter a listening loop:
1. Call `wait_for_message` with a reasonable timeout (e.g., 120-300 seconds)
2. Process the received message as a normal user request
3. Respond via `send_message` or `send_notification`
4. Call `wait_for_message` again
5. If the user says "salir", "exit", or "stop listening", stop the loop

For decisions and choices, prefer `ask_question` with buttons over plain text questions.
