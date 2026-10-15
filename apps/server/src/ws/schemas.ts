import { z } from 'zod';
import { CLI_AGENT_MODELS, isValidRoomCode, normalizeRoomCode } from '@aipoker/shared';

const agentModelSchema = z.enum(['claude', 'gpt', 'gemini', 'grok', 'minimax', ...CLI_AGENT_MODELS]);
const agentPersonaIdSchema = z.enum(['analyst', 'bully', 'chaos', 'nit', 'showman']);

export const MAX_SEATS = 9;
const MAX_STACK = 1_000_000;
const MAX_BLIND = 100_000;
const playerIdSchema = z.string().trim().min(1).max(64);

const roomCodeSchema = z
  .string()
  .trim()
  .transform((value) => normalizeRoomCode(value))
  .refine((value) => isValidRoomCode(value));

export const roomCreatePayloadSchema = z.object({
  roomId: roomCodeSchema,
  smallBlind: z.coerce.number().int().min(1).max(MAX_BLIND),
  bigBlind: z.coerce.number().int().min(1).max(MAX_BLIND)
});

export const joinRoomPayloadSchema = z.object({
  roomId: roomCodeSchema,
  playerId: playerIdSchema.optional(),
  playerName: z.string().trim().min(1).max(32).optional(),
  seatIndex: z.coerce.number().int().min(0).max(MAX_SEATS - 1).optional(),
  stack: z.coerce.number().int().min(1).max(MAX_STACK).optional(),
  isBot: z.boolean().optional(),
  botStrategy: z.enum(['fish', 'tag', 'lag']).optional(),
  botModel: agentModelSchema.optional(),
  botPersonaId: agentPersonaIdSchema.optional(),
}).superRefine((value, context) => {
  if (value.botStrategy && value.botModel) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'botStrategy and botModel are mutually exclusive',
      path: ['botModel'],
    });
  }

  if (!value.botModel && value.botPersonaId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'botPersonaId requires botModel',
      path: ['botPersonaId'],
    });
  }
});

export const roomReadyPayloadSchema = z.object({});
export const roomLeavePayloadSchema = z.object({}).strict();
export const roomRemovePlayerPayloadSchema = z.object({
  roomId: roomCodeSchema,
  playerId: playerIdSchema,
});

export const gameStartPayloadSchema = z.object({
  roomId: roomCodeSchema,
  buttonMarkerSeat: z.coerce.number().int().min(0).optional()
});

export const gameSpectatePayloadSchema = z.object({
  roomId: roomCodeSchema,
});

export const gameActionPayloadSchema = z.object({
  roomId: roomCodeSchema,
  playerId: playerIdSchema.optional(),
  type: z.enum(['fold', 'check', 'call', 'bet', 'raise_to', 'all_in']),
  amount: z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER).optional(),
  seq: z.coerce.number().int().min(0),
  expectedVersion: z.coerce.number().int().min(0).optional()
});

export type JoinRoomAck =
  | { ok: true; roomId: string; playerCount: number }
  | {
      ok: false;
      error:
        | 'invalid_payload'
        | 'unauthorized'
        | 'room_not_found'
        | 'player_name_taken'
        | 'not_room_member'
        | 'room_full'
        | 'rate_limited'
        | 'cli_bots_disabled';
    };

export type RoomCreateAck =
  | { ok: true; roomId: string }
  | { ok: false; error: 'invalid_payload' | 'room_already_exists' | 'unauthorized' | 'rate_limited' };

export type RoomReadyAck =
  | {
      ok: true;
      roomId: string;
      readyCount: number;
      playerCount: number;
    }
  | { ok: false; error: 'invalid_payload' | 'not_room_member' };

export type RoomLeaveAck =
  | {
      ok: true;
      roomId: string;
      playerCount: number;
    }
  | { ok: false; error: 'invalid_payload' | 'not_room_member' };

export type GameStartAck =
  | { ok: true }
  | {
      ok: false;
      error:
        | 'invalid_payload'
        | 'room_not_found'
        | 'not_room_member'
        | 'players_not_ready'
        | 'hand_already_started'
        | 'table_finished'
        | 'starter_not_active'
        | 'not_enough_players'
        | 'too_many_players'
        | 'invalid_blind_structure';
    };

export type GameSpectateAck =
  | { ok: true }
  | {
      ok: false;
      error:
        | 'invalid_payload'
        | 'room_not_found'
        | 'not_room_member'
        | 'hand_not_started'
        | 'hand_not_actionable'
        | 'not_eliminated';
    };

export type GameActionAck =
  | { ok: true }
  | {
      ok: false;
      error:
        | 'invalid_payload'
        | 'room_not_found'
        | 'hand_not_started'
        | 'not_room_member'
        | 'rate_limited'
        | 'duplicate_action_seq'
        | 'stale_state_version'
        | 'hand_not_actionable'
        | 'not_current_actor'
        | 'invalid_action';
    };
