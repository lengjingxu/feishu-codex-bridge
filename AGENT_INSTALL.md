# Agent 安装说明

本说明供 Codex、Claude Code、Cursor 等本机 Agent 执行。目标是安装最新的
Feishu Codex Bridge，并通过飞书官方确认页创建机器人、申请权限和保存凭据。

## 安全边界

- 只从 `https://github.com/lengjingxu/feishu-codex-bridge` 获取源码。
- 不要求用户复制 App Secret；CLI 会把凭据直接写入本机加密存储。
- 不提交或展示 `~/.feishu-omp-bridge/` 下的配置、日志和凭据。
- 扫码确认、管理员审批等交互必须由用户本人完成。

## 安装

```bash
git clone https://github.com/lengjingxu/feishu-codex-bridge.git
cd feishu-codex-bridge
corepack enable
pnpm install --frozen-lockfile
pnpm build
node bin/feishu-omp-bridge.mjs setup
```

`setup` 会输出飞书官方二维码和确认链接。用户确认后，CLI 自动获得 App ID 与
App Secret，并立即把 Secret 加密保存到本机。确认页会预填 Bridge 所需的机器人权限、
事件订阅和卡片回调。

完成后启动后台服务：

```bash
node bin/feishu-omp-bridge.mjs start
node bin/feishu-omp-bridge.mjs status
```

已有安装更新：

```bash
git pull --ff-only
pnpm install --frozen-lockfile
pnpm build
node bin/feishu-omp-bridge.mjs setup
node bin/feishu-omp-bridge.mjs restart
```

已有配置时，`setup` 会为当前应用增量补齐权限；只有用户明确要求新建应用时才使用
`setup --new-app`。
