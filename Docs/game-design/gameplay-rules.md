# AiPoker 玩法规则（Gameplay Rules）— 权威文档

> 版本：v1.2 | 日期：2026-03-03 | 范围：玩法与规则实现（不含 UI 细节、不含分布式扩展）
>
> **本文档是游戏规则的唯一权威来源。** 其他文档（PRD、data-models 等）的术语和规则以本文为准。
> 目标读者：实现 `game-engine` / `server` 的开发者（可直接按本文落地状态机与校验逻辑）
>
> **MVP 标记说明：** `[MVP]` = 必须在 MVP 中实现，`[Phase 2]` = 规则已定义、MVP 后实现。

---

## 0. 核心目标与约束

### 0.1 产品目标（玩法视角）

- 提供两种玩法：
  1. **锦标赛模式（Tournament / SNG 单桌）**：标准锦标赛规则，淘汰制，盲注递增，不能随意加筹码。
  2. **自由模式（Free / Cash-like 练习桌）**：固定盲注，允许补码（加筹码）以持续练习；可选择开启可选旁注玩法（Squid Game）。
- 游戏内的“筹码”默认是训练筹码（非真钱）。
- 服务器权威（Server-authoritative）：客户端只提交意图，服务端校验、推进状态并广播。
- 单实例部署（个人服务器）：**不做**多实例房间迁移、sticky session、跨进程一致性。

### 0.2 规则基线（“锦标赛级别”）

- 锦标赛规则以 **TDA（Tournament Directors Association）规则体系**为参考基线（尤其是 all-in 翻牌亮牌、min-raise、re-open betting 等）。  
  参考：`https://www.pokertda.com/view-poker-tda-rules/`
- 本文属于“线上训练产品的 house rules”，遇到线下模糊规则（口头宣告、过量筹码、string bet）一律用线上确定性输入替代（玩家必须选择明确动作与金额）。

---

## 1. 名词与统一约定（非常重要）

### 1.1 基本名词

- **Hand（手牌/一手）**：从发两张底牌到结算底池的一次完整过程。
- **Street（街）**：`preflop / flop / turn / river` 四个下注回合。
- **Betting Round（下注回合）**：每条街的行动循环。
- **Orbit（转一圈）**：按钮（Button）前进一次到下一座位号所对应的一手。
- **Button（庄位/按钮位）**：决定行动顺序（翻牌后最后行动）。
- **Dead Button（死按钮）**：锦标赛允许按钮 marker “落在空座位”；在空座存在时，可能出现 dead button 或 dead small blind，以保证盲注顺序合理。
- **BBA（Big Blind Ante）**：由大盲位代全桌支付的单人前注格式。

### 1.2 牌桌规模与座位

- 支持 `2–9` 人（MVP 推荐默认 `6-max`）。
- Seat 编号固定为 `0..(maxSeats-1)`，顺时针递增。
- “左侧”指顺时针方向（从 Button 往 SB/BB 的方向）。

### 1.3 牌局可见性（信息安全）

- 任何时刻：玩家仅能看到自己的底牌；其他人的底牌默认隐藏。
- 进入摊牌（Showdown）后：默认展示参与摊牌的底牌。
- **锦标赛**：一旦出现 all-in 且之后不再可能发生下注（行动结束），则按 TDA “Face Up for All-Ins” 将相关底牌立即翻开（不等到河牌再翻）。

---

## 2. 两种玩法的 Feature 与配置（Room Config）

### 2.1 通用 Feature（两种玩法共享）

- 创建房间 / 加入房间 / 选择座位（或自动分配）。
- Bot 对手（2–5 个）：
  - 规则驱动（Phase 1）为主，确保引擎稳定后再做复杂 AI。
  - Bot 与真人使用同一套 `Action` API（服务端仍需校验 Bot 行为）。
- 行动计时器：
  - 默认 `30s`。
  - 超时自动动作（见 6.6）。
- 行动历史（hand history）与回放（replay）：
  - 记录 **每一步状态变更** 或记录 action 并可确定性重放（推荐“action log + 可复现随机种子”）。

### 2.2 锦标赛模式（SNG 单桌）Feature [Phase 2]

- 单桌淘汰：从开赛到剩 1 名玩家结束。
- 盲注结构（Levels）：
  - level 时长（分钟）
  - SB/BB
  - Ante 格式：`none | bba | per_player`（MVP 推荐 `bba`）
- 开赛前等待：玩家 ready 后开赛。
- 记分板：剩余人数、名次、盲注级别、下一次升盲倒计时。
- 不能加筹码、不能 mid-hand 离座规避盲注（断线会被“盲走”）。

### 2.3 自由模式（Cash-like 练习桌）Feature [MVP]

- 固定盲注（不升盲）。
- 允许补码（Top-up）：
  - 默认规则：**仅在手与手之间生效**（避免 mid-hand 影响公平性与回放一致性）。
  - 可配置：`autoTopUpToBB`（例如自动补到 `100BB`）。
- 允许随时离桌/换座（同样建议只在 hand boundary 生效）。
- 可选旁注玩法：**Squid Game（stand-up 变体）**（见第 7 节）。

### 2.4 推荐默认配置（可直接做 MVP）

- 桌型：`6-max`
- 锦标赛：
  - 起始筹码：`10,000`
  - Level 1：`50/100 + BBA 100`
  - Level 时长：`8 min`
  - 结构示例：`(50/100) -> (75/150) -> (100/200) -> (150/300) -> ...`
  - 说明：结构可调，MVP 先做 8–12 个 level 即可。
- 自由模式：
  - 固定盲注：`50/100`
  - 默认买入：`10,000`（=100BB）
  - 允许补码：开启
  - Squid Game：默认关闭

---

## 3. 引擎抽象与数据模型（建议实现形态）

> 这里不是代码实现，但建议数据结构按此设计，能显著减少规则 bug。

### 3.1 核心状态拆分建议

- `TableState`（桌级）：
  - 房间配置、玩家列表（含 seated / spectating）、按钮 marker 位置、盲注级别、当前 hand 指针。
  - 锦标赛：额外保存 `prevBbSeat`（用于 dead button / dead SB 计算）。
- `HandState`（手级）：
  - 牌堆（可复现 RNG）、底牌、公共牌、各玩家本手投入、底池结构、行动顺序。
- `StreetBettingState`（街级下注）：
  - `currentBetToMatch`：本街最高下注额（需要跟到的目标）。
  - `lastFullRaiseSize`：本街“上一手完整加注增量”（min-raise 关键）。
  - `hasActedThisStreet[playerId]`：玩家是否在本街做出过“选择性动作”（不含强制盲注）。
  - `matchedBetToMatchAtLastAction[playerId]`：玩家上次行动后所匹配的 `currentBetToMatch`（用于判断 re-open）。
  - `lastAggressorId`：最后一次使 `currentBetToMatch` 上升的玩家（用于判定回合结束）。

### 3.2 玩家状态（建议字段）

- `stack`：当前可用筹码
- `status`：
  - `active`：在手且可行动
  - `folded`：已弃牌
  - `all_in`：已 all-in（不能再行动）
  - `out`：锦标赛中筹码为 0 且已淘汰（不再发牌）
  - `sitting_out`：自由模式可用（暂离，不参与发牌/盲注）
- `streetCommitted`：本街已投入
- `handCommitted`：本手总投入（用于边池）

---

## 4. 发牌与行动顺序（标准 NLHE）

### 4.1 一手的标准流程（状态机）

1. `hand_init`
2. `post_forced_bets`（SB/BB/Ante）
3. `deal_hole`（每人 2 张）
4. `betting_preflop`
5. `deal_flop`（烧牌+翻 3 张）
6. `betting_flop`
7. `deal_turn`（烧牌+翻 1 张）
8. `betting_turn`
9. `deal_river`（烧牌+翻 1 张）
10. `betting_river`
11. `showdown`（或全员弃牌提前结束）
12. `settle_pots`
13. `hand_end`（推进按钮、淘汰处理、进入下一手/结束比赛）

### 4.1.1 强制下注（Blinds/Antes）如何计入 committed

为了避免 toCall/min-raise 计算混乱，本文区分两类投入：

- `streetCommitted`：只用于“本街下注匹配”（决定 `toCall`）
- `handCommitted`：只用于“本手底池/边池计算”（决定 pot amount 与 eligible）

建议规则：

- Ante（含 BBA）：
  - 只增加 `handCommitted`，不增加 `streetCommitted`（它不是可跟注的 bet）。
- SB/BB：
  - 同时增加 `handCommitted` 与 `streetCommitted`（它们是 preflop 的强制 bet）。

preflop 开始时初始化：

- `currentBetToMatch = max(streetCommitted)`（以“实付盲注”作为当前可跟注的 betToMatch）
- `lastFullRaiseSize = currentBetToMatch`（preflop 的 min-raise 增量基准 = 当前最大盲注实付额）

> 说明：翻牌后各街的 `lastFullRaiseSize` 基准在 4.4 统一重置为“配置 BB”，与某个玩家是否短码无关。

### 4.2 按钮、盲注位置（Tournament vs Free 的差异点）

> 这是“锦标赛级别”最容易被实现成 cash 规则的地方。锦标赛建议允许出现 **dead button / dead small blind**，
> 以避免玩家因空座导致“跳盲/少交盲”。自由模式则更适合用“永远把按钮放在活人身上”的 cash 规则。

#### 4.2.1 锦标赛模式（Dead Button + 可能出现 dead SB）

基本原则：

- Seat 编号固定，玩家淘汰后座位变空，**不压缩座位**。
- **大盲永远由“该轮应当付大盲的下一位活人”支付**；小盲与按钮 marker 按相邻座位推导，因此可能落在空座（dead SB / dead button）。

推荐实现（确定性、可复现，符合“big blind due”思路）：

前置状态：

- `prevBbSeat`：上一手的 `bbSeat`（第一手可由初始化按钮推导得到）

第一手初始化（锦标赛开赛时）建议：

1. 随机选择一个“有筹码的参赛者”作为 `buttonMarkerSeat`（线上无需抽牌定庄）。
2. `sbSeat = nextActiveSeat(buttonMarkerSeat)`，`bbSeat = nextActiveSeat(sbSeat)`（第一手按标准按钮推导盲注）。
3. `prevBbSeat = bbSeat`，用于下一手的 “big blind due” 计算。

每手开始：

- 若本手参与者 `==2`（Heads-up）：
  1. `bbSeat = nextActiveSeat(prevBbSeat)`（大盲由下一位活人支付）
  2. `buttonMarkerSeat = nextActiveSeat(bbSeat)`（按钮永远落在活人身上）
  3. `sbSeat = buttonMarkerSeat`（Heads-up：SB=Button）
- 若本手参与者 `>=3`：
  1. `bbSeat = nextActiveSeat(prevBbSeat)`（大盲由下一位活人支付）
  2. `sbSeat = prevSeat(bbSeat)`（物理相邻座位；若该座无活人则本手没有 SB，dead SB）
  3. `buttonMarkerSeat = prevSeat(sbSeat)`（物理相邻座位；若该座无活人则按钮落空，dead button）

每手结束：

- `prevBbSeat = bbSeat`（为下一手做准备）

Heads-up（仅两名玩家参与该手）：

- **SB/Button preflop 先行动**；翻牌后 SB/Button 最后行动。
  - 参考：TDA 规则 “Heads-up, the small blind is the button… acts first pre-flop and last on all other betting rounds.”

> 说明：该算法在“盲位玩家被淘汰/空座”时会自然产生 HPT/Robert's Rules 里常见的现象：
> - 大盲被淘汰后，下一手可能没有小盲（dead SB）
> - 小盲被淘汰后，按钮 marker 可能落空（dead button），导致同一玩家连续两手最后行动

示例（3 人桌，大盲被淘汰导致 dead SB）：

- 座位：`0=A, 1=B, 2=C`
- Hand N：`button=0, SB=1, BB=2`，且 `C` 在该手被淘汰（seat2 变空），因此 `prevBbSeat=2`
- Hand N+1（本算法）：
  - `bbSeat = nextActiveSeat(2) = 0`（A 付大盲）
  - `sbSeat = prevSeat(0) = 2`（空座，dead SB，本手没有小盲）
  - `buttonMarkerSeat = prevSeat(2) = 1`（B 拿按钮位）

#### 4.2.2 自由模式（Cash-like，按钮永远落在活人）

基本原则：

- 自由模式允许玩家加入/离开/坐出，为了可玩性与直觉，按钮建议总是给“下一位活人”。

推荐实现：

1. `buttonMarkerSeat = nextActiveSeat(buttonMarkerSeat)`（跳过空座、out、sitting_out）
2. `sbSeat = nextActiveSeat(buttonMarkerSeat)`
3. `bbSeat = nextActiveSeat(sbSeat)`

> 自由模式通常不需要 dead SB；若某位玩家离开导致空座，直接跳过即可。

### 4.3 行动顺序（Who acts first）

- Preflop：从 `BB` 左侧第一位活人（active 且非 all-in 且未弃牌）开始，按顺时针。
  - Heads-up 特例见上。
- Flop/Turn/River：从 `buttonMarkerSeat` 左侧第一位活人开始，按顺时针（按钮最后行动）。

### 4.4 Street 切换时的“下注状态重置”

每次从一条街进入下一条街（例如 `betting_preflop -> deal_flop`）需要做一致性的状态重置：

- 对所有未弃牌玩家：
  - `streetCommitted = 0`（本街投入清零）
  - `hasActedThisStreet = false`
  - `matchedBetToMatchAtLastAction = 0`
- `StreetBettingState`：
  - `currentBetToMatch = 0`
  - `lastFullRaiseSize = BB`（下一条街的 min-bet/min-raise 基准）
  - `lastAggressorId = null`

---

## 5. 下注规则（No-Limit 的“实现细节”）

> 这是最容易写错的部分。建议严格按“currentBetToMatch + lastFullRaiseSize”的模型实现。

### 5.1 动作集合（Action Types）

- `fold`
- `check`（仅当 `toCall == 0`）
- `call`（支付 `min(toCall, stack)`；不足则视为 all-in call）
- `bet`（当 `currentBetToMatch == 0` 时）
- `raise_to(to)`（当 `currentBetToMatch > 0` 时；`to` = 本次动作后该玩家的 `streetCommitted` 目标值）
- `all_in`（实现上可统一为 `raise_to(streetCommitted + stack)` 或 `call(all-in)`，但 UI 可给单独按钮）

### 5.2 关键变量定义

对某玩家 P：

- `toCall = currentBetToMatch - streetCommitted[P]`
- `callAmount = clamp(toCall, 0, stack[P])`

### 5.3 最小 bet / 最小 raise

- 本街还没人下注（`currentBetToMatch == 0`）：
  - `minBet = BB`（翻牌后最小下注 = 大盲额；preflop 不存在“bet”，而是对 BB 的 raise）
- 本街已经有下注（`currentBetToMatch > 0`）：
  - `minRaiseTo = currentBetToMatch + lastFullRaiseSize`
  - 其中 `lastFullRaiseSize` 初始值：
    - preflop：`currentBetToMatch`（以本手“实付最大盲注额”作为最小加注增量基准）
    - flop/turn/river：`BB`（最小 bet 视作初始基准，见 4.4）

### 5.3.1 `currentBetToMatch` / `lastFullRaiseSize` 更新规则（实现必须明确）

实现上建议在处理动作前先记录 `oldBetToMatch = currentBetToMatch`，再按动作更新：

- `check / fold / call`：
  - `currentBetToMatch` 不变
  - `lastFullRaiseSize` 不变
- `bet(to)`（当 `oldBetToMatch == 0`）：
  - `currentBetToMatch = to`
  - `lastFullRaiseSize = to - oldBetToMatch`（即 `to`）
- `raise_to(to)`（当 `oldBetToMatch > 0` 且 `to > oldBetToMatch`）：
  - `raiseSize = to - oldBetToMatch`
  - 若 `raiseSize >= lastFullRaiseSize`：这是 **full raise** → `lastFullRaiseSize = raiseSize`
  - 若 `raiseSize < lastFullRaiseSize`：这是 **短 all-in raise** → `lastFullRaiseSize` 保持不变
  - `currentBetToMatch = to`

同时建议在玩家每次“选择性动作”（check/call/bet/raise）后记录：

- `hasActedThisStreet[player] = true`
- `matchedBetToMatchAtLastAction[player] = currentBetToMatch`（用于 §5.4 的 re-open 判断）

### 5.4 “短 all-in”与 re-open betting（锦标赛必须正确）

参考 TDA Rule 47（Re-Opening the Bet）：

- 如果某次 all-in raise 的增量 **小于** `lastFullRaiseSize`，那么：
  - **没有行动过的玩家**：仍然可以 raise（但 minRaiseTo 仍按 `currentBetToMatch + lastFullRaiseSize` 计算）。
  - **已经行动过的玩家**：当行动回到他时，如果他面对的新增额 `< lastFullRaiseSize`，则 **不能再 raise**（只能 fold/call）。
- 多个短 all-in 可能“累计”达到完整加注，从而 re-open（TDA 允许累计重新打开）。实现建议：
  - 对每个玩家记录 `matchedBetToMatchAtLastAction`（该玩家上次行动后所匹配的 betToMatch）。
  - 当轮到他行动时：
    - `delta = currentBetToMatch - matchedBetToMatchAtLastAction`
    - 若 `hasActedThisStreet == true` 且 `delta < lastFullRaiseSize`，则 `canRaise=false`。

例 1（短 all-in 不 re-open）：

- 盲注：`50/100`
- preflop：玩家 A 加注到 `200`（此时 `lastFullRaiseSize=100`）
- 玩家 B all-in 到 `250`（加注增量 `50 < 100`，属于短 all-in）
- 其他人跟注到 `250` 后，行动回到 A：
  - A 面对的新增额 `delta = 250 - 200 = 50 < 100`，因此 A **不能再 raise**，只能 `call 50` 或 `fold`

例 2（多个短 all-in 累计 re-open）：

- 盲注：`50/100`
- preflop：玩家 A 加注到 `200`（`lastFullRaiseSize=100`）
- 玩家 B all-in 到 `250`（短 all-in，增量 50）
- 玩家 C all-in 到 `300`（再次短 all-in，增量 50；但 A 总共被抬高了 100）
- 行动回到 A：
  - A 面对的新增额 `delta = 300 - 200 = 100`，达到 `lastFullRaiseSize`，因此本轮对 A **re-open**，A 可以再 raise
  - 且后续的最小加注增量仍保持为 `100`（不因为短 all-in 变小）

### 5.5 下注回合结束条件

下注回合结束当且仅当：

- 只剩 1 名未弃牌玩家（其他都 fold）→ 直接进入 `settle_pots`（无需摊牌）。
  或
- 所有未弃牌且非 all-in 的玩家都满足：
  - 已经行动过（`hasActedThisStreet=true`），且
  - `streetCommitted == currentBetToMatch`（跟齐），且
  - 行动已经“回到最后一次加注者之后并完成一圈”。

实现建议（确定性、简单）：

- 维护一个 `pendingActors` 集合（本街仍需响应 `currentBetToMatch` 的玩家）。
- 每当出现 **full raise**（或任何 raise 使 `currentBetToMatch` 增加）：
  - 重新生成 `pendingActors`：所有未弃牌且非 all-in 且不是该加注者本人。
- 玩家 `call/check/fold` 后从 `pendingActors` 移除。
- 当 `pendingActors` 为空时，本街结束。

### 5.6 数字化输入与“线下规则”取舍

以下 TDA 里为了解决线下歧义的规则，线上版本默认 **不实现**：

- 口头宣告优先级（raise/call 的歧义）
- 过量筹码（overchip）自动判定
- string bet / 50% raise 等

线上规则统一为：客户端必须提交明确 `actionType` 与（如需要）`amount`，服务端严格校验范围。

---

## 6. 结算逻辑（Side Pots / Showdown / Odd Chips）

### 6.1 何时进入摊牌

- 若在任意下注回合结束时仍有 `>=2` 名未弃牌玩家，则进入摊牌流程：
  - 如果还有街未发完且所有未弃牌玩家都 all-in：直接 runout（发完公共牌）→ showdown。
  - 若仍有两名及以上玩家有筹码可下注：继续正常流程。

### 6.2 “All-in 亮牌”（锦标赛）

按 TDA 的“Face Up for All-Ins”：

- 当出现至少一名玩家 all-in 且之后不再可能产生新的下注（行动结束）时：
  - 立即将所有仍在手中的玩家底牌翻开（包括只参与主池的 all-in 玩家、以及参与边池的玩家）。
  - 然后再发完剩余公共牌并结算。

### 6.2.1 手牌大小（Hand Ranking）与比较规则

Texas Hold'em 用 7 张牌（2 张底牌 + 最多 5 张公共牌）选出 **最强 5 张牌组合** 比大小：

从强到弱：

1. 同花顺（Straight Flush）
2. 四条（Four of a Kind）
3. 葫芦（Full House）
4. 同花（Flush）
5. 顺子（Straight）
6. 三条（Three of a Kind）
7. 两对（Two Pair）
8. 一对（One Pair）
9. 高牌（High Card）

比较原则（需要在 evaluator 中明确实现）：

- 只比较“牌点”，**花色不参与大小**（不存在“黑桃大于红桃”）。
- A2345 是最小顺子（Wheel），其顺子高牌视为 5。
- 葫芦先比三条点数，再比对子点数；两对先比大对，再比小对，再比 kicker。
- 若 5 张组合完全相同则平分（进入分池/odd chip 规则）。

### 6.3 Showdown 亮牌顺序与 Muck 规则

**亮牌顺序（TDA Rule 16 参考）：**

- 若河牌有下注行为：**最后一个加注者（last aggressor）** 先亮牌，然后按顺时针依次亮牌。
- 若河牌全部 check（无下注）：从 **Button 左侧第一个未弃牌玩家** 开始，顺时针亮牌。
- 若所有玩家 all-in 且无更多下注可能：所有参与者同时亮牌（Face Up for All-Ins，见 §6.2）。

**Muck（不亮牌）规则：**

- 本项目作为**训练平台**，**默认强制亮牌**（所有进入 showdown 的玩家必须展示手牌）。
  - 理由：强制亮牌有助于复盘分析和训练提示，这是训练平台的核心价值。
- 可选配置（Could Have）：允许赢家 muck（不亮牌直接拿底池）。
  - 仅当所有其他参与者弃牌或已输牌时生效。
  - 启用后，回放中仍会记录 muck 的手牌（仅回放可见，实时对局中不可见）。

### 6.4 边池（Side Pot）生成算法（推荐实现）

目标：生成一组 pots，每个 pot 有：

- `amount`：该 pot 的筹码总额（包含已弃牌玩家的投入）
- `eligiblePlayerIds`：**有资格争夺该 pot 的玩家**（未弃牌且投入达到该层）

输入：

- 对每个玩家 `handCommitted[player]`
- `isFolded[player]`

推荐算法（按“all-in 层级”切片，保证 pots 最少且正确）：

1. 若本手在摊牌时不存在 all-in 玩家：所有未弃牌玩家的 `handCommitted` 必然相等，直接生成 1 个 main pot 即可。
2. 若存在 all-in（或你希望统一用同一算法）：使用“按投入层级切片”的通用算法：
   - 取所有玩家（含弃牌）的投入层级作为切点：
     - `levels = sort(unique(handCommitted[x] where handCommitted[x] > 0))`
   - 令 `prev=0`，对每个 `level`：
     - `slice = level - prev`（若 `slice<=0` 跳过）
     - `contributors = { x | handCommitted[x] >= level }`（包含已弃牌）
     - `eligible = { x | !folded[x] && handCommitted[x] >= level }`
     - `potAmount = slice * |contributors|`
     - push pot
     - `prev = level`
3. 可选优化：若相邻两个 pot 的 `eligible` 集合完全相同，可以合并为一个 pot（金额相加）。

> 注意：如果一个已弃牌玩家投入很大，他会作为 contributor 进入所有后续 potAmount，但不会出现在 eligible 里（这是正确的）。

示例（含弃牌投入与多边池）：

- 玩家投入（`handCommitted`）：
  - A：`100`（all-in，未弃牌）
  - B：`300`（all-in，未弃牌）
  - C：`500`（未弃牌）
  - D：`200`（已弃牌）
- 切片 levels（所有玩家）：`[100, 200, 300, 500]`
- 生成 pots：
  - Pot#1（level=100, slice=100）：contributors=A,B,C,D 共 4 人 → `400`；eligible=A,B,C
  - Pot#2（level=200, slice=100）：contributors=B,C,D 共 3 人 → `300`；eligible=B,C
  - Pot#3（level=300, slice=100）：contributors=B,C 共 2 人 → `200`；eligible=B,C
  - Pot#4（level=500, slice=200）：contributors=C 共 1 人 → `200`；eligible=C（可直接视为 C 已锁定这部分）
- 总底池：`400+300+200+200=1100`，等于总投入 `100+300+500+200`
- 可选合并：Pot#2 与 Pot#3 的 eligible 相同（B,C），可合并成一个 `500` 的 side pot。

### 6.5 Showdown 比牌与分池

- 对每个 pot（从 main pot 到最后一个 side pot）独立结算：
  - 在 `eligible` 中找最强手牌（Texas Hold’em 标准 5 张组合）。
  - 若多人并列最强，则平分该 pot（整除部分平均分）。
  - 余数（odd chip）处理见 6.6。
- 结算顺序：
  - 建议先算所有 pot 的赢家与金额分配，再一次性更新 stack（减少中间态 bug）。

### 6.6 Odd Chip（不能整除的 1 个最小单位筹码）

锦标赛建议遵循 TDA 常见规则：

- Flop games（含 NLHE）若同一 pot 多人平分且出现奇数最小单位：
  - odd chip 给 **按钮左侧第一位** 的赢家（按座位顺时针顺序找赢家）。

> 实现前提：需要定义“最小单位筹码”（chip denom）。MVP 可用 `1` 作为最小单位。

### 6.7 超时与断线（Action Timer）

统一策略（两种玩法一致，差异只在“是否继续占座/是否扣盲”）：

- 若轮到玩家行动且计时结束：
  - 若 `toCall == 0` → 自动 `check`
  - 若 `toCall > 0` → 自动 `fold`
- 锦标赛：
  - 断线玩家仍然参与发牌与强制下注（盲走）。
  - 若行动到他，按超时规则自动 check/fold。
- 自由模式：
  - 断线可标记为 `sitting_out`，不再发牌与扣盲（或按房主配置）。

---

## 7. Squid Game（自由模式可选旁注玩法）[Phase 2]

### 7.1 玩法定义（本项目采用“按轮结算”的 Squid）

参考现金桌常见定义（PokerNews 描述）：

- 每当玩家在一手中 **赢下至少一个底池份额**（主池或任一边池，含平分）：
  - 获得 1 个 `squidToken`（按“手”计，不按“pot 数”叠加）。
- Squid 按“轮（round）”进行：
  - 一轮默认长度 = `N hands`（`N` 为本轮开始时的参与人数）
  - 一轮结束后结算并重置 token
- 结算规则（按 PokerNews 示例可落地）：
  - 本轮 `token==0` 的玩家，需向每位 `token>0` 的玩家支付罚金：
    - `payment = squidValue * tokenCount[winner]`
  - 例：`squidValue=$300`，若某玩家本轮赢 8 手拿到 8 token，其他玩家每人支付 `8*$300` 给他。

### 7.2 配置项（UI 作为可选开关）

- `enabled: boolean`（默认 false）
- `squidValue: number`（罚金单位，默认按 BB 的倍数，如 `3*BB`）
- `roundHands: number`（默认 `=participantsAtRoundStart`）
- `minPlayers: number`（默认 4）
- `minStackBb: number`（默认 35BB；低于则不允许开启或不允许加入本轮）
- `joinPolicy: "nextRoundOnly"`（建议固定：一轮进行中不允许新玩家加入/退出生效）

### 7.3 Squid 与补码/离桌的交互（必须定义清楚）

为了确定性与公平性，本项目建议：

- Squid 结算发生在“**本轮结束的那一手**”的 `hand_end`（本手底池结算之后、下一手开始之前）。
- 结算币种：默认使用**桌上筹码**直接结算（即 payer 的 `stack` 扣除、payee 的 `stack` 增加），并作为独立交易记录在 hand history 中。
- 一轮进行中：
  - `topUp` 请求进入队列，**下一轮开始前**（round reset 时）统一应用。
  - `leaveTable` 请求进入队列，**round 结算之后**生效。
- 若玩家在一轮中断线：
  - 仍被视为参与者（仍可能因超时 fold 而拿不到 token 并承担罚金）。
  - 作为可选房规：可允许房主选择“断线即退出 Squid（但本轮仍要结算）”。

支付能力（必须定义，否则会出现负筹码/不一致）：

- 在执行 Squid 结算前，先按自由模式规则应用：
  - `autoTopUp`（若开启）
  - 以及所有排队的 `topUp`（若玩家手动补码）
- 若 payer 的 `stack` 仍不足以支付其应付罚金：
  - payer 先支付其当前 `stack`（支付到 0）
  - 剩余未支付部分记录为 `squidDebt[payer]`
  - 后续任何 `topUp` 先用于清偿 `squidDebt`，再增加 `stack`

### 7.4 Squid 事件与记录（Replay/Stats）

为可回放与可解释性，需要记录：

- `squid:round_start`（participants, roundHands, squidValue）
- `squid:token_awarded`（handNumber, playerId）
- `squid:round_settlement`（每个 payer->payee 的金额明细）
- `squid:round_reset`

---

## 8. 锦标赛模式（单桌）补充规则 [Phase 2]

### 8.1 报名与开赛

- MVP 默认：`Freezeout`（无 rebuy / re-entry / late reg）。
- 开赛条件：
  - 房主点击开始，且 `>= minPlayers`（建议 2）。
  - 未准备的玩家可被踢出或自动转为观战（房规）。

### 8.2 升盲时机

- 盲注级别变化只在 **手与手之间** 生效（下一手的强制下注开始前）。
- 若到点升盲但一手尚未结束：延后到 `hand_end` 应用。

### 8.3 Ante 格式（推荐 BBA）

MVP 推荐：

- `anteMode = bba`
- `anteAmount = BB`（结构表可配置）
- 计算顺序采用 TDA RP-11 推荐的 **big-blind-first calculation**：
  - BB 位优先满足 BB，余下再用于 BBA；不足则 all-in。

### 8.4 淘汰与结束

- 玩家 `stack==0` 且不在本手参与任何 pot 争夺后，标记为 `out`。
- 当除 1 人外其余均 `out`：锦标赛结束，冠军 = 最后存活者。

### 8.5 MVP 运行态终局冻结（当前实现）

- 终局判定（服务端权威）：
  - `handNumber > 0` 且 `stack > 0` 玩家数 `<= 1` 时，`isTableFinished = true`。
  - `canStartNextHand = false`，客户端不得再自动/手动发下一手。
- 发牌权限（服务端权威）：
  - 即使 `canStartNextHand = true`，也仅 `stack > 0 && !isBot` 的请求者可触发 `game:start`。
  - 已淘汰玩家或非真人请求会收到 `starter_not_active`。
- Bot-only 续局分支：
  - 当 `canStartNextHand = true` 且 `activeHumanStackPlayerCount = 0` 且 `activeBotStackPlayerCount >= 2` 时，
    `isBotsOnlyContinuation = true`。
  - 该分支由服务端在 `hand_end` 后自动 `1500ms` 续局，不依赖客户端按钮。
- 冠军定义：
  - 仅在 `isTableFinished = true` 且唯一 `stack > 0` 玩家存在时，认定该玩家为冠军。
- 交互约束：
  - 终局后主路径为“返回大厅”，不再继续发牌。
  - 已淘汰玩家可继续观战，但不再拥有发下一手权限。
  - 若后续有新玩家加入并恢复到 `stack > 0` 玩家数 `>= 2`，可重新开局（重新进入可发牌态）。

---

## 9. 自由模式（练习桌）补充规则 [MVP]

### 9.1 买入与补码（Top-up）

建议 house rule：

- 入座买入：允许 `minBuyIn..maxBuyIn`（默认 `50BB..200BB`，也可放开）。
- 补码生效时机：仅 `hand_end`。
- 若开启 `autoTopUpToBB`：
  - 在 `hand_end` 检查 `stack < targetBB * BB`，自动补到目标值。

### 9.2 坐出（Sitting Out）

- 自由模式允许 `sitting_out`：
  - sitting_out 的玩家不发牌、不扣盲、不参与 Squid（除非房规定义）。
  - 返回需要在 hand boundary 生效。

---

## 10. 必测用例（写引擎前先列测试）

> 这里是“保证逻辑正确”的最低测试清单。建议每条至少 1 个单测 + 1 个回放测试。

- 下注轮：
  - preflop：min-raise = BB（raise_to(to)=2BB 合法）
  - postflop：min-bet = BB
  - 短 all-in 不 re-open：A bet 100，B all-in to 125，回到 A 只能 call/fold
  - 多短 all-in 累计 re-open：按 TDA 示例（累计到完整加注后 A 可再 raise）
- Side pot：
  - 3 人 all-in 不同额度 + 第 4 人弃牌但投入较大（确保 contributor/eligible 正确）
  - 平分 side pot + odd chip 给按钮左侧赢家
- Heads-up：
  - SB=Button preflop 先动；翻牌后最后动
- Dead Button / Dead SB：
  - 大盲位玩家被淘汰后：下一手应出现 dead SB（无小盲），且 BB 由“应付大盲的下一活人”承担
  - 小盲位玩家被淘汰后：按钮 marker 可能落空（dead button），可能导致同一玩家连续两手最后行动
- Showdown 亮牌顺序：
  - 河牌有 bet/raise → last aggressor 先亮
  - 河牌全 check → Button 左侧第一个未弃牌者先亮
  - 全 all-in → 同时翻开
  - 训练模式下强制亮牌（不可 muck）
- 断线/超时：
  - toCall=0 超时 check；toCall>0 超时 fold
  - 锦标赛断线盲走、自由模式可 sitting_out
- Squid：
  - 一轮 N 手结算，0 token 玩家按 tokenCount 支付给赢家（含多人赢家）
  - 轮中 topUp/leave 请求延后到 round 结算后生效
  - payer 筹码不足：产生 `squidDebt`，且后续 topUp 优先清偿 debt

---

## 11. 参考链接（用于规则对齐与争议处理）

- TDA Rules（官方）：`https://www.pokertda.com/view-poker-tda-rules/`
- Dead Button / Dead SB 示例（HPT，引用 Robert's Rules）：`https://www.homepokertourney.org/poker-rules/dead-button.html`
- Squid Game（现金桌常见解释与示例，PokerNews 文章中给出 token/罚金示例）：  
  `https://www.pokernews.com/news/2025/07/venetian-poker-live-cash-game-july-2025-recap-49132.htm`
