import { z } from 'zod';
import { isValidRoomCode, normalizeRoomCode } from '@aipoker/shared';

const roomCodeSchema = z
  .string()
  .trim()
  .transform((value) => normalizeRoomCode(value))
  .refine((value) => isValidRoomCode(value));

export const roomCreatePayloadSchema = z.object({
  roomId: roomCodeSchema,
  smallBlind: z.coerce.number().int().min(1),
  bigBlind: z.coerce.number().int().min(1)
});

export const joinRoomPayloadSchema = z.object({
  roomId: roomCodeSchema,
  playerId: z.string().trim().min(1).optional(),
  playerName: z.string().trim().min(1).optional(),
  seatIndex: z.coerce.number().int().min(0).optional(),
  stack: z.coerce.number().int().min(1).optional(),
  isBot: z.boolean().optional(),
  botStrategy: z.enum(['fish', 'tag', 'lag']).optional(),
});

export const roomReadyPayloadSchema = z.object({});
export const roomLeavePayloadSchema = z.object({}).strict();
export const roomRemovePlayerPayloadSchema = z.object({
  roomId: roomCodeSchema,
  playerId: z.string().trim().min(1),
});

export const gameStartPayloadSchema = z.object({
  roomId: roomCodeSchema,
  buttonMarkerSeat: z.coerce.number().int().min(0).optional()
});

export const gameActionPayloadSchema = z.object({
  roomId: roomCodeSchema,
  playerId: z.string().trim().min(1).optional(),
  type: z.enum(['fold', 'check', 'call', 'bet', 'raise_to', 'all_in']),
  amount: z.coerce.number().int().min(1).optional(),
  seq: z.coerce.number().int().min(0),
  expectedVersion: z.coerce.number().int().min(0).optional()
});

export type JoinRoomAck =
  | { ok: true; roomId: string; playerCount: number }
  | {
      ok: false;
      error: 'invalid_payload' | 'unauthorized' | 'room_not_found' | 'player_name_taken' | 'not_room_owner';
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
        | 'not_room_owner'
        | 'players_not_ready'
        | 'hand_already_started'
        | 'table_finished'
        | 'not_enough_players'
        | 'invalid_blind_structure';
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
