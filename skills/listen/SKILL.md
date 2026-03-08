---
description: Start listening for messages in the active channel
---

Enter a persistent listening loop on the active channel. Messages from the channel are treated as if the user typed them directly in the CLI.

## Prerequisites

The channel must already be set via `set_channel` or `/persephone:connect`. If no channel is active, ask the user for a channel ID and connect first.

## Instructions

1. Verify the channel is active by calling `check_messages` (if it errors with "No active channel", ask the user to connect first).

2. Send a notification to the channel confirming listening mode is active:
   - title: "Listening Mode Active"
   - description: "I'm now listening to this channel. Send me messages and I'll respond automatically. Say **exit**, **salir**, or **stop** to end the loop."
   - type: "success"

3. Tell the user in the CLI that listening mode is active and all interaction will happen via the channel.

4. Enter the listening loop:
   a. Call `wait_for_message` with timeout 300 (5 minutes)
   b. If a message is received:
      - If the content is "salir", "exit", "stop", or "stop listening" (case-insensitive), break the loop and send a goodbye notification
      - Otherwise, treat the message as a user request: process it, execute any needed tools, and respond via `send_message`
      - For decisions with limited options, use `ask_question` with buttons
      - For long code outputs, use `send_message` with format "codeblock"
   c. If the wait times out (no message in 5 minutes):
      - Call `wait_for_message` again (restart the wait silently)
      - Do NOT send a timeout message — just keep waiting
   d. Go back to step (a)

5. When the loop ends (user said exit):
   - Send a notification: title "Listening Mode Ended", type "info"
   - Resume normal CLI interaction

## Important Behavior

- **Process messages like CLI input**: If the user asks to read a file, write code, search the web, etc., do it and respond via `send_message`.
- **Multi-message responses**: For long responses, split them naturally. Use `send_notification` for status updates and `send_message` for content.
- **Errors**: If a tool call fails, report the error via `send_message` and continue listening.
- **Stay in the loop**: Only exit when explicitly told to. Timeouts should silently restart the wait.
