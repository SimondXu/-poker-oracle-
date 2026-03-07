# AiPoker — 产品需求文档 (PRD)

> 版本：v2.1 | 日期：2026-03-05
> 本文件只定义**产品范围**。规则细节见 `gameplay-rules.md`，技术方案见 `tech-architecture.md`。

---

## 0. 背景与目标

**这是一个联机训练场，不是休闲娱乐平台。**

- 用户核心诉求：系统性地提升自己的德州扑克水平
- 差异化定位：轻量房间联机 + 高质量实时牌桌 + 连续手局训练
- 当前优先级：核心玩法 + UI/交互 + 房间系统；回放/统计/账号体系延后
- 默认规格：No-Limit Texas Hold'em，桌面网页优先

---

## 1. 核心使用场景

| # | 场景 | 用户目标 | 关键功能 |
|---|------|---------|---------|
| 1 | 自建训练室 | "我想快速开一桌训练" | 输入用户名后创建 6 位房间号 |
| 2 | 邀请联机 | "我想和朋友一起练" | 输入用户名+房间号加入现有房间 |
| 3 | 连续对局训练 | "一局结束后继续下一手" | 同房间内 ready/start/action/结算/下一手循环 |

---

## 2. MVP 功能列表

### Must Have
- Guest 会话（cookie）+ 用户名入场（无登录注册页面）
- 创建房间（用户名 -> 6 位房间号）
- 加入房间（用户名 + 房间号）
- No-Limit Texas Hold'em 完整规则 → 详见 [`gameplay-rules.md`](./gameplay-rules.md)
- Bot 对手 x 2–5（Phase 1 规则驱动）→ 详见 [`bot-roadmap.md`](./bot-roadmap.md)
- 实时牌桌 UI → 详见 [`ui-spec.md`](./ui-spec.md)
- 计时器（30s 默认）
- 对局行动历史（本手内可查看）
- 对局结算（赢家展示、筹码变化）
- 房间内同名冲突拦截（同房不同名）
- 加入不存在房间直接报错（`room_not_found`）
- 进行中加入仅观战当前手，下一手参与

### Should Have
- 训练提示 HUD（底池赔率、手牌强度、位置建议）
- 多手连续对局（无需重新进房间）
- 快捷键（F=fold, C=call, R=raise, Space=check）

### Could Have
- 预设挑战任务（Challenge 模式）
- Bot 难度可调（新手/中级/进阶）
- 回放系统（逐步回放）
- 对局历史/统计面板
- 进阶训练提示（GTO 建议、EV 计算）
- 锦标赛模式（SNG 单桌）→ 规则已在 `gameplay-rules.md` 中完整定义
- Squid Game 旁注玩法 → 规则已在 `gameplay-rules.md §7` 定义
- 移动端适配

### Won't Have（不进任何阶段）
- 真实金钱 / 货币化
- 筹码购买 / 充值
- 好友系统 / 社交

---

## 3. 关键指标（KPIs）

| 指标 | 定义 | MVP 目标 |
|------|------|---------|
| 局数/用户/天 | DAU 平均完整手牌数 | ≥ 5 |
| 房间创建成功率 | create -> join 成功比例 | ≥ 95% |
| 房间加入成功率 | 输入有效房间号后 join 成功比例 | ≥ 95% |
| 训练提示使用率 | 打开提示 HUD 的用户占比 | ≥ 50% |
| 会话时长 | 平均单次访问时长 | ≥ 20 min |
| D7 留存 | 7 天后返回的用户占比 | ≥ 25% |

---

## 4. 风险清单

### 技术风险

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| 并发动作竞态 | 中 | 高 | per-room 串行 action queue + 状态版本号（MVP 不需要 Redis 锁） |
| 边池计算错误 | 中 | 高 | 独立模块 + 100+ 单测 + 随机压力测试 |
| 断线重连不一致 | 高 | 中 | 全量快照（非 diff），30s 保座 |
| Bot 阻塞游戏 loop | 低 | 中 | in-process 队列/worker threads；需要强隔离再引入 BullMQ |

### 产品风险

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| 训练提示感知价值不足 | 高 | 高 | 好/坏决策反馈 + EV 差值可视化 |
| Bot 太强用户放弃 | 中 | 高 | 多难度 + 新手默认 Fish Bot |
| Bot 太弱无训练价值 | 中 | 中 | TAG/LAG Bot 提供挑战 |
| 用户不知道如何训练 | 高 | 中 | Onboarding 引导 + 首次教程 |

---

## 5. 关联文档索引

| 文档 | 内容 | 谁需要读 |
|------|------|---------|
| [`gameplay-rules.md`](./gameplay-rules.md) | 游戏规则权威（TDA、边池、Dead Button、Squid） | Game Engine Agent |
| [`tech-architecture.md`](./tech-architecture.md) | 技术栈、Monorepo、部署、数据库 | Backend Agent |
| [`data-models.md`](./data-models.md) | 类型定义、DB Schema、Socket 事件、API | Engine + Backend + Frontend |
| [`ui-spec.md`](./ui-spec.md) | 页面架构、线框图、颜色、动画 | Frontend Agent |
| [`bot-roadmap.md`](./bot-roadmap.md) | Bot Phase 1/2/3、AIPlayerAdapter | Bot Agent |
| [`sprint-plan.md`](./sprint-plan.md) | Agent 分工、Sprint 计划、DoD | 所有人 |
| [`engineering-styleguide.md`](./engineering-styleguide.md) | 代码规范（按需参考） | 所有人 |
