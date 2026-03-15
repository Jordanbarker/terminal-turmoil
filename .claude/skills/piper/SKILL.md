---
name: piper
description: "How the Piper team messaging system works — channels, DMs, message delivery, reply options, and the interactive session. Use this skill whenever adding new Piper messages, modifying Piper triggers, working on the piper command, or touching files under src/engine/piper/ or src/story/piper/."
---

# Piper Messaging System

Piper is NexaCorp's Slack-style team chat. It handles casual colleague conversations — quick asks, tool introductions, back-and-forth help requests. Email handles formal/system communications.

## Architecture

```
src/engine/piper/
├── types.ts           # PiperMessage, PiperDelivery, PiperTrigger, PiperChannel, PiperSessionInfo, PiperReplyOption
├── delivery.ts        # checkPiperDeliveries(), seedImmediatePiper(), getConversationHistory(), getPendingReply(), getVisibleChannels()
├── render.ts          # Terminal rendering (header, channel list, conversation, reply menu, footer)
├── PiperSession.ts    # Interactive session (ISession impl, channel list ↔ conversation views)
└── __tests__/
    └── delivery.test.ts

src/story/piper/
├── channels.ts        # PIPER_CHANNELS array (channel/DM definitions)
├── messages.ts        # getPiperDeliveries(username) — re-exports all deliveries from messages/
└── messages/
    ├── home.ts        # Alex Rivera + Olive Borden (home PC)
    ├── onboarding.ts  # Edward, IT, HR (early NexaCorp)
    ├── oscar.ts       # Oscar Diaz
    ├── dana.ts        # Dana Okafor
    ├── auri.ts        # Auri Park
    ├── sarah.ts       # Sarah Knight
    ├── cassie.ts      # Cassie Moreau
    ├── jordan.ts      # Jordan Kessler
    ├── maya.ts        # Maya Johnson
    └── soham.ts       # Soham Parekh

src/engine/commands/builtins/piper.ts  # Command registration
src/state/gameStore.ts                 # deliveredPiperIds state + addDeliveredPiperMessages action
```

## Data Model

### Core Types (`piper/types.ts`)

```ts
interface PiperMessage {
  id: string;              // "oscar_hey_1"
  from: string;            // "Oscar Diaz"
  timestamp: string;       // "9:45 AM"
  body: string;
  isPlayer?: boolean;
}

interface PiperReplyOption {
  label: string;
  messageBody: string;
  triggerEvents?: GameEvent[];
}

interface PiperDelivery {
  id: string;              // unique delivery ID
  channelId: string;       // which channel ("general", "dm_oscar")
  messages: PiperMessage[];
  trigger: PiperTrigger | PiperTrigger[];
  replyOptions?: PiperReplyOption[];
}

type PiperTrigger =
  | { type: "immediate" }
  | { type: "after_file_read"; filePath: string; requireDelivered?: string }
  | { type: "after_email_read"; emailId: string }
  | { type: "after_piper_reply"; deliveryId: string }
  | { type: "after_command"; command: string }
  | { type: "after_objective"; objectiveId: string };
```

## Storage

State-based, not filesystem-based. `deliveredPiperIds: string[]` in Zustand tracks which deliveries have arrived and which replies the player chose. Message content is defined statically in `story/piper/messages.ts`.

### Special IDs in deliveredPiperIds

- `reply:{deliveryId}:{optionIndex}` — Player chose a reply option
- `seen:{channelId}:{count}` — Unread tracking marker

## Delivery Flow

1. Player action triggers a `GameEvent` (file read, command, objective)
2. `computeEffects()` in `applyResult.ts` calls `checkPiperDeliveries(event, deliveredIds, username)`
3. Matching deliveries are added to `newDeliveredPiperIds` in effects
4. `useTerminal.ts` syncs to Zustand and shows toast: "You have new messages on Piper"
5. Player runs `piper` to open the interactive session

## Interactive Session

Two views: **channel list** and **conversation**.

**Navigation**: Arrow keys or number keys, Enter to select, `q` to go back/exit.

**Reply flow**: When the player selects a reply in a conversation, the reply ID is added to `deliveredPiperIds`, trigger events are collected, and the conversation re-renders with the player's message shown inline.

On session exit, collected trigger events and updated `deliveredPiperIds` (replies + seen markers) are synced back to the store via `useSessionRouter`.

## Channels

| Channel | Type | When visible |
|---------|------|-------------|
| `#general` | channel | Always (immediate welcome messages) |
| `#engineering` | channel | Always |
| DM Oscar | dm | After `oscar_log_check` delivered |
| DM Dana | dm | After `dana_welcome` delivered |
| DM Auri | dm | After `auri_hello` delivered |
| DM Jordan | dm | After `jordan_marketing_data` delivered |

## Gating

- Unlocked by `piper_unlocked` story flag (set when player reads `welcome_edward` email)
- Available on NexaCorp only (not home PC, not dev container)
- Gated in `story/commandGates.ts` via `NEXACORP_GATED`

## Adding New Messages

1. Add the message to the **per-character file** in `story/piper/messages/` (e.g., `oscar.ts` for Oscar Diaz messages). Each file exports a `get*Deliveries(username: string): PiperDelivery[]` function. `messages.ts` automatically includes all sub-files; no need to register the new delivery there:
   ```ts
   {
     id: "unique_delivery_id",
     channelId: "dm_oscar",
     messages: [
       { id: "msg_1", from: "Oscar Diaz", timestamp: "2:00 PM", body: "Message text" },
     ],
     trigger: { type: "after_objective", objectiveId: "some_flag" },
     replyOptions: [
       { label: "Sure!", messageBody: "On it.", triggerEvents: [...] },
     ],
   }
   ```
2. If adding a new channel/DM, add it to `PIPER_CHANNELS` in `story/piper/channels.ts`
3. Choose trigger type — same options as email triggers plus `after_piper_reply`
