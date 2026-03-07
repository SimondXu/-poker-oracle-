# AiPoker — 当前开发计划（Free 模式联机 MVP）

> 版本：2026-03-05
> 目标：收敛到“用户名 + 房间号”的自由模式联机训练室。

---

## 1. 当前范围（MVP）

- 入口仅两种：
  - 用户名创建房间
  - 用户名 + 房间号加入房间
- 不做数据库持久化（房间/手牌状态以内存运行）
- 不做登录/注册页面（仅 guest session cookie）
- 不做回放页面/统计页面（Phase 2+）

---

## 2. 核心任务拆分

### Task A：Realtime 语义收紧

- `room:create`：重复房间号返回 `room_already_exists`
- `room:join`：不存在房间返回 `room_not_found`，不再隐式建房
- 同房不同名：房间内用户名唯一（大小写不敏感）
- 进行中加入：仅观战当前手，下一手进入玩家池

### Task B：首页双入口重构

- 创建入口：用户名 -> 生成 6 位房间号 -> 进入等待室（create intent）
- 加入入口：用户名 + 房间号 -> 进入等待室（join intent）
- 房间号规则：自动大写、去空格、格式校验、错误提示清晰

### Task C：等待室 intent 流

- create intent：`room:create` 成功后再 `room:join`
- join intent：只发 `room:join`
- `room_not_found` / `player_name_taken`：前端直接提示并回首页

### Task D：文档同步

- PRD / sprint-plan / ui-spec / data-models / README 与现状一致
- 将 replay / stats / 账号体系明确下调到后续阶段

---

## 3. Definition of Done（本阶段）

- [ ] 用户 A 输入用户名创建房间并进入等待室
- [ ] 用户 B 输入用户名 + 房间号成功加入同房
- [ ] 输入不存在房间号时返回 `room_not_found`，并在前端明确提示
- [ ] 同房间不允许同名（返回 `player_name_taken`）
- [ ] 进行中加入仅观战当前手，下一手可参与
- [ ] ready/start/action/hand_result/next-hand 完整链路可跑通
- [ ] 断线后同浏览器身份稳定，可恢复房间视图

---

## 4. 验证命令

```bash
pnpm --filter @aipoker/server test
pnpm test
pnpm typecheck
```

---

## 5. 后续阶段（不在本轮）

- 回放系统（Replay Viewer + action log）
- 个人统计与历史对局
- 登录/注册与账号升级
- 数据库持久化与多实例部署
