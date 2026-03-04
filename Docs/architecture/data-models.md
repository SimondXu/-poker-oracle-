# AiPoker — 数据模型与接口契约

> 类型定义、DB Schema、Socket 事件、REST API。
> **术语以 [`gameplay-rules.md`](./gameplay-rules.md) 为准。**

---

## 1. 核心类型定义

> 这些是契约（接口），不是实现。实际代码在 `packages/shared/` 和 `packages/game-engine/`。

```typescript
// ── 基础类型 ──

type Suit = 'h' | 'd' | 'c' | 's';
type Rank = '2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'|'T'|'J'|'Q'|'K'|'A';
type Card = `${Rank}${Suit}`;  // "Ah", "Kd", "Tc"

type Brand<T, B extends string> = T & { readonly __brand: B };
type PlayerId = Brand<string, 'PlayerId'>;
type RoomId   = Brand<string, 'RoomId'>;
type GameId   = Brand<string, 'GameId'>;

// ── 游戏阶段（与 gameplay-rules.md §4.1 对齐）──

type Phase =
  | 'hand_init' | 'post_forced_bets'
  | 'deal_hole' | 'betting_preflop'
  | 'deal_flop' | 'betting_flop'
  | 'deal_turn' | 'betting_turn'
  | 'deal_river'| 'betting_river'
  | 'showdown'  | 'settle_pots' | 'hand_end';

// ── 动作类型（与 gameplay-rules.md §5.1 对齐）──

type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise_to' | 'all_in';

// ── 玩家状态 ──

type PlayerStatus = 'active' | 'folded' | 'all_in' | 'out' | 'sitting_out';

interface PlayerState {
  id: PlayerId;
  name: string;
  seatIndex: number;           // 0..(maxSeats-1)
  stack: number;               // 当前可用筹码
  streetCommitted: number;     // 本街已投入
  handCommitted: number;       // 本手总投入（边池计算用）
  status: PlayerStatus;
  holeCards: Card[];           // 只有本人/showdown 时 filled
  isBot: boolean;
  botStrategy?: string;
  // 下注回合状态（gameplay-rules.md §3.1）
  hasActedThisStreet: boolean;
  matchedBetToMatchAtLastAction: number;
}

// ── 底池 ──

interface Pot {
  amount: number;
  eligiblePlayerIds: PlayerId[];  // 未弃牌且投入达到该层的玩家
}

// ── 街级下注状态（gameplay-rules.md §3.1）──

interface StreetBettingState {
  currentBetToMatch: number;
  lastFullRaiseSize: number;
  lastAggressorId: PlayerId | null;
}

// ── 手级状态 ──

interface HandState {
  id: GameId;
  roomId: RoomId;
  handNumber: number;
  phase: Phase;
  buttonMarkerSeat: number;
  sbSeat: number | null;       // null = dead SB
  bbSeat: number;
  players: PlayerState[];
  communityCards: Card[];
  pots: Pot[];
  betting: StreetBettingState;
  currentActorSeat: number | null;
  actions: GameAction[];
}

// ── 行动记录（回放用）──

interface GameAction {
  playerId: PlayerId;
  playerName: string;
  seatIndex: number;
  phase: Phase;
  type: ActionType;
  amount: number;
  stackBefore: number;
  potTotalBefore: number;
  sequenceNum: number;
  timestamp: number;
}

// ── 合法动作（校验用）──

interface ValidActions {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  canBet: boolean;             // currentBetToMatch == 0
  canRaise: boolean;           // currentBetToMatch > 0
  minBetOrRaiseTo: number;     // bet 或 raise_to(to) 的最小值（to = 动作后 streetCommitted）
  maxBetOrRaiseTo: number;     // = streetCommitted + stack（all-in 上限，raise_to(to) 的 to）
  canAllIn: boolean;
}
```

---

## 2. 房间配置

```typescript
type GameMode = 'free' | 'tournament';
type AnteMode = 'none' | 'bba' | 'per_player';

interface RoomConfig {
  id: RoomId;
  name: string;
  creatorId: PlayerId;
  mode: GameMode;
  maxSeats: number;            // 2-9, 默认 6
  // 通用
  actionTimeoutMs: number;     // 默认 30000
  botCount: number;            // 2-5
  botDifficulty: 'fish' | 'tag' | 'lag';
  // 自由模式
  smallBlind: number;
  bigBlind: number;
  minBuyIn: number;            // 默认 50*BB
  maxBuyIn: number;            // 默认 200*BB
  autoTopUpToBB: number | null;
  // 锦标赛模式 [Phase 2]
  startingStack?: number;
  blindStructure?: BlindLevel[];
  anteMode?: AnteMode;
  // Squid Game [Phase 2]
  squid?: SquidConfig;
}

interface SquidConfig {
  enabled: boolean;
  squidValue: number;          // 默认按 BB 倍数配置
  roundHands: number;          // 默认 = roundStartParticipants
  minPlayers: number;          // 默认 4
  minStackBb: number;          // 默认 35
  joinPolicy: 'nextRoundOnly'; // 一轮中途加入/离开仅下轮生效
}

interface BlindLevel {
  sb: number;
  bb: number;
  ante: number;
  durationMinutes: number;
}
```

---

## 3. Database Schema (PostgreSQL)

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(32) UNIQUE NOT NULL,
  is_guest BOOLEAN NOT NULL DEFAULT FALSE,
  email VARCHAR(255) UNIQUE,          -- guest 可为空
  password_hash TEXT,                -- guest 可为空
  default_chips INTEGER DEFAULT 10000,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (
    (is_guest = true  AND email IS NULL AND password_hash IS NULL) OR
    (is_guest = false AND email IS NOT NULL AND password_hash IS NOT NULL)
  )
);

CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(64) NOT NULL,
  creator_id UUID REFERENCES users(id),
  mode VARCHAR(16) NOT NULL DEFAULT 'free',
  config JSONB NOT NULL,         -- RoomConfig
  status VARCHAR(16) DEFAULT 'waiting',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE hands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id),
  hand_number INTEGER NOT NULL,
  button_seat INTEGER NOT NULL,
  sb_seat INTEGER,               -- null = dead SB
  bb_seat INTEGER NOT NULL,
  community_cards TEXT[] DEFAULT '{}',
  pots JSONB DEFAULT '[]',
  winner_info JSONB,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

CREATE TABLE hand_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hand_id UUID REFERENCES hands(id),
  player_id UUID,                -- null for bot
  player_name VARCHAR(32) NOT NULL,
  seat_index INTEGER NOT NULL,
  phase VARCHAR(24) NOT NULL,
  action_type VARCHAR(16) NOT NULL,
  amount INTEGER DEFAULT 0,
  stack_before INTEGER NOT NULL,
  pot_total_before INTEGER NOT NULL,
  sequence_num INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_hand_actions_hand ON hand_actions(hand_id, sequence_num);

CREATE TABLE hand_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hand_id UUID REFERENCES hands(id),
  player_id UUID,
  player_name VARCHAR(32) NOT NULL,
  hole_cards TEXT[] NOT NULL,
  net_chips INTEGER NOT NULL,    -- 正=赢, 负=输
  hand_rank VARCHAR(32),
  went_to_showdown BOOLEAN DEFAULT FALSE
);

CREATE TABLE user_stats (
  user_id UUID REFERENCES users(id) PRIMARY KEY,
  total_hands INTEGER DEFAULT 0,
  total_wins INTEGER DEFAULT 0,
  total_profit INTEGER DEFAULT 0,
  vpip_hands INTEGER DEFAULT 0,  -- 自愿投入底池的手数
  pfr_hands INTEGER DEFAULT 0,   -- preflop 加注的手数
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 4. Socket.io 事件契约

### Client → Server（必须有 ack 回调）

```typescript
interface ClientEvents {
  'room:join':     (data: { roomId: RoomId }, ack: AckFn) => void;
  'room:ready':    (data: {}, ack: AckFn) => void;
  'room:leave':    (data: {}, ack: AckFn) => void;
  'game:action':   (data: {
    type: ActionType;
    amount?: number;
    seq: number;       // 幂等去重
  }, ack: AckFn) => void;
}

type AckFn = (response: { ok: true } | { ok: false; error: string }) => void;
```

### Server → Client（fire-and-forget）

```typescript
interface ServerEvents {
  'room:state':           (state: RoomState) => void;
  'game:state':           (state: ClientHandState) => void;  // 已清空他人手牌
  'game:event':           (event: GameEvent) => void;        // 增量事件（动画用）
  'game:action_required': (data: {
    validActions: ValidActions;
    timeoutMs: number;
  }) => void;
  'game:hand_result':     (result: HandResult) => void;
  'error':                (data: { code: string; message: string }) => void;
}
```

### 事件演进规则
- 添加字段：安全（客户端忽略未知字段）
- 删除字段：禁止直接删，先 `@deprecated` 保留 2 sprint
- Client action 附带 `seq` 做幂等去重

---

## 5. REST API

> 认证策略（MVP）：**Guest-first**。用户无需注册即可进入；服务端签发 guest token 到 **httpOnly cookie**（不返回 `{ token }` 到 JS）。  
> 可选账号升级（Phase 2）：在保留 guest 会话连续性的前提下，支持绑定邮箱/密码。

```
POST   /api/auth/guest        → { username? } → { ok, user } (Set-Cookie)
GET    /api/auth/me           → { ok, user } | 401
POST   /api/auth/logout       → {} → { ok } (Clear-Cookie)

GET    /api/rooms             → RoomSummary[]
POST   /api/rooms             → RoomConfig → { roomId }
GET    /api/rooms/:id         → RoomDetail

GET    /api/hands/:id/replay  → { initialState, actions: GameAction[] }
GET    /api/users/me/stats    → UserStats
GET    /api/users/me/history  → HandSummary[] (paginated)
```

### 5.1 Socket 身份约定（MVP）

- `room number` 负责定位房间；不负责权限。
- 玩家操作权限由 cookie 会话身份决定（服务端映射 `socket -> userId`）。
- 客户端可上传 `playerName` 作为显示名；服务端保留最终裁决权。
- 旁观（view）和入座（join as player）使用同一会话身份，但授权规则不同。

### 5.2 REST 限流（MVP）

- 默认阈值：`100 req/min/identity`（可通过环境变量覆盖）。
- identity 优先使用会话用户标识（guest/user `userId`），无会话时回退到 `IP`。
- 超限返回：`429` + `{ ok: false, error: 'rate_limited' }`，并携带 `Retry-After`。
