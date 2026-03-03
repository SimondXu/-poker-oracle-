# AiPoker — 产品需求文档 (PRD)

> 版本：v2.0 | 日期：2026-03-03
> 本文件只定义**产品范围**。规则细节见 `gameplay-rules.md`，技术方案见 `tech-architecture.md`。

---

## 0. 背景与目标

**这是一个个人训练场，不是休闲娱乐平台。**

- 用户核心诉求：系统性地提升自己的德州扑克水平
- 差异化定位：可回放、有提示、可分析的"个人训练室"
- 当前优先级：核心玩法 + UI/交互 + 房间系统 + 回放/训练功能，AI/ML 延后
- 默认规格：No-Limit Texas Hold'em，桌面网页优先

---

## 1. 核心使用场景

| # | 场景 | 用户目标 | 关键功能 |
|---|------|---------|---------|
| 1 | 新手快速上桌 | "我刚学规则，想练手感" | 自动配 2 个简单 Bot，提示默认开启 |
| 2 | 针对性局面练习 | "我想专练 3-bet 后的处理" | 预设挑战场景，强制进入特定局面 |
| 3 | 自由对局+复盘 | "随便打几局然后复盘" | 自由创建房间，打完立即进回放 |

---

## 2. MVP 功能列表

### Must Have
- 用户注册/登录（邮箱+密码 或 Guest 游客模式）
- 创建房间：盲注 / 人数 / Bot 数量 / Bot 难度
- No-Limit Texas Hold'em 完整规则 → 详见 [`gameplay-rules.md`](./gameplay-rules.md)
- Bot 对手 x 2–5（Phase 1 规则驱动）→ 详见 [`bot-roadmap.md`](./bot-roadmap.md)
- 实时牌桌 UI → 详见 [`ui-spec.md`](./ui-spec.md)
- 计时器（30s 默认）
- 对局行动历史（本手内可查看）
- 对局结算（赢家展示、筹码变化）
- 回放系统（逐步回放）

### Should Have
- 训练提示 HUD（底池赔率、手牌强度、位置建议）
- 个人统计（局数、胜率、最大赢/输）
- 多手连续对局（无需重新进房间）
- 回放标注（在某个动作处添加笔记）
- 快捷键（F=fold, C=call, R=raise, Space=check）

### Could Have
- 预设挑战任务（Challenge 模式）
- Bot 难度可调（新手/中级/进阶）
- 对局历史列表
- 进阶训练提示（GTO 建议、EV 计算）
- 锦标赛模式（SNG 单桌）→ 规则已在 `gameplay-rules.md` 中完整定义
- Squid Game 旁注玩法 → 规则已在 `gameplay-rules.md §7` 定义
- 多人联机（真人 vs 真人）
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
| 训练提示使用率 | 打开提示 HUD 的用户占比 | ≥ 50% |
| 摊牌回放率 | 摊牌后查看回放的频率 | ≥ 30% |
| 会话时长 | 平均单次访问时长 | ≥ 20 min |
| D7 留存 | 7 天后返回的用户占比 | ≥ 25% |

---

## 4. 风险清单

### 技术风险

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| 并发动作竞态 | 中 | 高 | Redis 原子锁 + 状态版本号 |
| 边池计算错误 | 中 | 高 | 独立模块 + 100+ 单测 + 随机压力测试 |
| 断线重连不一致 | 高 | 中 | 全量快照（非 diff），30s 保座 |
| Bot 阻塞游戏 loop | 低 | 中 | BullMQ 异步队列 |

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
