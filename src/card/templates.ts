import type { SessionDetail } from '../project/types';

interface ButtonSpec {
  text: string;
  value: Record<string, unknown>;
  style?: 'primary' | 'danger' | 'default';
}

function button(spec: ButtonSpec): object {
  return {
    tag: 'button',
    text: { tag: 'plain_text', content: spec.text },
    type: spec.style ?? 'default',
    value: spec.value,
  };
}

function divMd(content: string): object {
  return { tag: 'div', text: { tag: 'lark_md', content } };
}

function actions(buttons: ButtonSpec[]): object {
  return { tag: 'action', actions: buttons.map(button) };
}

const HR: object = { tag: 'hr' };

function shell(title: string, elements: object[]): object {
  return {
    config: { wide_screen_mode: true, update_multi: true },
    header: { title: { tag: 'plain_text', content: title } },
    elements,
  };
}

export function welcomeCard(): object {
  return shell('Codex 项目助手', [
    divMd('选择一个项目后，在项目群管理会话；进入话题后，直接用中文向 Codex 提交需求。'),
    HR,
    actions([
      { text: '选择项目', value: { cmd: 'projects' }, style: 'primary' },
      { text: '已绑定项目', value: { cmd: 'projects.bound' } },
    ]),
    actions([
      { text: '连接状态', value: { cmd: 'status' } },
      { text: '使用帮助', value: { cmd: 'help' } },
    ]),
  ]);
}

export interface ProjectCardInfo {
  projectKey: string;
  name: string;
  cwd: string;
  hostId?: string;
  chatId?: string;
}

export function projectsCard(projects: ProjectCardInfo[], page = 0, pageSize = 6): object {
  const start = page * pageSize;
  const pageItems = projects.slice(start, start + pageSize);
  const elements: object[] = [divMd(projects.length ? `共 **${projects.length}** 个项目，选择一个开始：` : '暂时没有可用项目。请在 Bridge 配置中添加项目目录。')];
  for (const project of pageItems) {
    elements.push(HR, divMd(`**${escapeMd(project.name)}**\n状态：${project.chatId ? '已绑定项目群' : '尚未绑定项目群'}\n主机：${escapeMd(project.hostId ?? '本机')}`));
    elements.push(actions([
      { text: project.chatId ? '打开项目群' : '创建项目群', value: { cmd: 'project.open', arg: project.projectKey }, style: 'primary' },
      ...(project.chatId ? [{ text: '查看会话', value: { cmd: 'project.sessions', arg: project.projectKey } }] : []),
    ]));
  }
  const nav: ButtonSpec[] = [];
  if (page > 0) nav.push({ text: '上一页', value: { cmd: 'projects.page', arg: String(page - 1) } });
  if (start + pageSize < projects.length) nav.push({ text: '下一页', value: { cmd: 'projects.page', arg: String(page + 1) } });
  if (nav.length) elements.push(HR, actions(nav));
  return shell('本地项目', elements);
}

export interface ProjectWelcomeInfo { name: string; cwd: string; }

export function projectWelcomeCard(info: ProjectWelcomeInfo): object {
  return shell('项目工作台', [
    divMd(`项目：**${escapeMd(info.name)}**\n当前位置：项目群\n\n点击飞书的“新建话题”，发送第一条需求，即可自动创建独立的 Codex 会话。\n\n需要恢复历史对话时，再查看会话列表。`),
    actions([
      { text: '查看会话', value: { cmd: 'sessions' }, style: 'primary' },
      { text: '项目状态', value: { cmd: 'project.status' } },
    ]),
    actions([
      { text: '刷新会话', value: { cmd: 'sessions' } },
      { text: '切换项目', value: { cmd: 'projects' } },
      { text: '使用说明', value: { cmd: 'help' } },
    ]),
  ]);
}

export function projectFeedbackCard(
  title: string,
  detail: string,
  buttons: ButtonSpec[] = [],
): object {
  const elements: object[] = [divMd(detail)];
  if (buttons.length > 0) elements.push(HR, actions(buttons));
  return shell(title, elements);
}

export interface SessionCardInfo {
  threadId: string;
  name?: string;
  preview: string;
  status: string;
  activeFlags?: string[];
  source?: string;
  forkedFromId?: string;
  gitBranch?: string;
  updatedAt: number;
}

export interface SessionDetailCardInfo extends SessionCardInfo {
  turnCount: number;
  recentActivity: Array<{ kind: string; text: string }>;
}

export function sessionsCard(projectName: string, sessions: SessionCardInfo[], nextCursor?: string): object {
  const elements: object[] = [divMd(`项目：**${escapeMd(projectName)}**\n当前位置：项目群\n共 **${sessions.length}** 个未归档会话。选择一个可恢复历史对话；新会话请直接使用飞书“新建话题”。`)];
  if (sessions.length === 0) elements.push(HR, divMd('暂无可恢复的会话。点击飞书“新建话题”并发送需求即可开始。'));
  for (const session of sessions) {
    const title = session.name?.trim() || session.preview.slice(0, 40) || '未命名会话';
    const status = sessionStatusText(session.status, session.activeFlags);
    const metadata = [
      `状态：${status}`,
      formatRelative(session.updatedAt),
    ].filter(Boolean).join(' · ');
    elements.push(HR, divMd(`**${escapeMd(title)}**\n${escapeMd(session.preview.slice(0, 120))}\n${metadata}`));
    elements.push(actions([
      { text: '继续此会话', value: { cmd: 'session.open', arg: session.threadId }, style: 'primary' },
      { text: '查看详情', value: { cmd: 'session.detail', arg: session.threadId } },
    ]));
  }
  const footer: ButtonSpec[] = [
    { text: '刷新列表', value: { cmd: 'sessions' }, style: 'primary' },
  ];
  if (nextCursor) footer.splice(1, 0, { text: '加载更多', value: { cmd: 'sessions.page', arg: nextCursor } });
  elements.push(HR, actions(footer));
  return shell('会话列表', elements);
}

export function sessionDetailCard(projectName: string, detail: SessionDetailCardInfo): object {
  const activity = detail.recentActivity.length > 0
    ? detail.recentActivity.slice(-5).map((item) => `· **${escapeMd(item.kind)}**：${escapeMd(item.text.slice(0, 180))}`).join('\n')
    : '暂无可展示的最近活动。';
  return shell('会话详情', [
    divMd(`项目：**${escapeMd(projectName)}**\n会话：**${escapeMd(detail.name?.trim() || detail.preview.slice(0, 40) || '未命名会话')}**\n状态：${sessionStatusText(detail.status, detail.activeFlags)}\n最近使用：${formatRelative(detail.updatedAt)}\n历史轮次：${detail.turnCount}`),
    HR,
    divMd(`最近活动\n${activity}`),
    HR,
    actions([
      { text: '继续此会话', value: { cmd: 'session.open', arg: detail.threadId }, style: 'primary' },
      { text: '归档会话', value: { cmd: 'session.archive', arg: detail.threadId }, style: 'danger' },
      { text: '返回会话列表', value: { cmd: 'sessions' } },
    ]),
  ]);
}

export function sessionProgressCard(projectName: string, detail: SessionDetail, autoSync = false): object {
  const activity = detail.recentActivity.length > 0
    ? detail.recentActivity.slice(-8).map((item) => {
      return `· **${item.kind}**：${escapeMd(item.text.slice(0, 220))}`;
    }).join('\n')
    : '暂无可展示的最新活动。';
  const status = sessionStatusText(detail.status, detail.activeFlags);
  const running = detail.status === 'active';
  const progressActions: ButtonSpec[] = [
    { text: '刷新进度', value: { cmd: 'sync' }, style: 'primary' },
    ...(running ? [{ text: '停止任务', value: { cmd: 'stop' }, style: 'danger' as const }] : []),
    autoSync
      ? { text: '关闭自动刷新', value: { cmd: 'sync.stop' }, style: 'danger' as const }
      : { text: '开启自动刷新', value: { cmd: 'sync.auto' } },
    { text: '查看状态', value: { cmd: 'status' } },
  ];
  return shell('Codex 最新进度', [
    divMd(`项目：**${escapeMd(projectName)}**\n状态：**${status}**\n最近更新：${formatRelative(detail.updatedAt)}${autoSync ? '\n自动刷新：已开启（每 5 秒）' : ''}`),
    HR,
    divMd(activity),
    HR,
    actions(progressActions),
  ]);
}

function sessionStatusText(status: string, activeFlags: string[] | undefined): string {
  if (activeFlags?.includes('waitingOnApproval')) return '等待确认';
  if (activeFlags?.includes('waitingOnUserInput')) return '等待输入';
  if (status === 'active') return '执行中';
  if (status === 'archived') return '已归档';
  return '空闲';
}

export function topicWelcomeCard(projectName: string, sessionTitle: string, cwd: string): object {
  const displayProjectName = cleanTopicPart(projectName, '未命名项目');
  const displaySessionTitle = cleanTopicPart(sessionTitle, '新会话');
  return shell(topicTitle(displayProjectName, displaySessionTitle), [
    divMd(`项目：**${escapeMd(displayProjectName)}**\n会话：**${escapeMd(displaySessionTitle)}**\n\n现在可以直接在这个话题中输入中文需求。`),
    divMd('当前位置：Codex 工作话题。这里用于实际编程对话，之后直接发送需求即可。'),
    actions([
      { text: '刷新进度', value: { cmd: 'sync' }, style: 'primary' },
    ]),
    actions([
      { text: '切换会话', value: { cmd: 'sessions' } },
    ]),
    actions([
      { text: '查看状态', value: { cmd: 'status' } },
      { text: '开启自动刷新', value: { cmd: 'sync.auto' } },
      { text: '使用说明', value: { cmd: 'help' } },
    ]),
  ]);
}

/**
 * Feishu uses the root message title when displaying a topic in the topic
 * list. Keep it useful and compact instead of showing the same connection
 * status for every Codex session.
 */
export function topicTitle(projectName: string, sessionTitle: string): string {
  const project = cleanTopicPart(projectName, '未命名项目');
  const session = cleanTopicPart(sessionTitle, '新会话');
  return truncateTopicTitle(`${project} · ${session}`, 80);
}

function cleanTopicPart(value: string, fallback: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized || /^(?:omp\s*)?(?:✅\s*)?会话已连接$/i.test(normalized)) return fallback;
  return normalized;
}

function truncateTopicTitle(value: string, maxLength: number): string {
  const chars = Array.from(value);
  return chars.length <= maxLength ? value : `${chars.slice(0, maxLength - 1).join('')}…`;
}

function formatRelative(timestamp: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return '刚刚';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`;
  return `${Math.floor(seconds / 86400)} 天前`;
}

export function workspacesCard(current: string | undefined, named: Record<string, string>): object {
  const entries = Object.entries(named);
  const elements: object[] = [];

  elements.push(divMd(`当前 cwd：\`${escapeCode(current ?? '(未设置，使用 $HOME)')}\``));

  if (entries.length === 0) {
    elements.push(HR);
    elements.push(divMd('暂无命名工作空间。'));
    elements.push(
      divMd('发送 `/ws save <name>` 把当前工作目录保存为命名工作空间'),
    );
  } else {
    elements.push(HR);
    entries.forEach(([name, path], i) => {
      const marker = path === current ? '  ← 当前' : '';
      elements.push(divMd(`**${escapeMd(name)}** → \`${escapeCode(path)}\`${marker}`));
      elements.push(
        actions([
          { text: '切换到此处', value: { cmd: 'ws.use', name }, style: 'primary' },
          { text: '删除', value: { cmd: 'ws.remove', name }, style: 'danger' },
        ]),
      );
      if (i < entries.length - 1) elements.push(HR);
    });
  }

  return shell('工作空间', elements);
}

export interface StatusInfo {
  cwd: string;
  sessionId?: string;
  sessionStale: boolean;
  agentName: string;
  /** Session scope (= chatId or chatId:threadId in topic groups). */
  scope: string;
  /** Chat mode — used to label scope. */
  chatMode: 'p2p' | 'group' | 'topic';
  projectName?: string;
  sessionTitle?: string;
  hideInternalIds?: boolean;
}

export function statusCard(info: StatusInfo): object {
  if (info.hideInternalIds) {
    return shell('当前状态', [
      divMd([
        info.projectName ? `项目：**${escapeMd(info.projectName)}**` : '',
        `工作目录：\`${escapeCode(info.cwd)}\``,
        info.sessionTitle ? `当前会话：**${escapeMd(info.sessionTitle)}**` : '当前会话：尚未绑定',
        `助手：${escapeMd(info.agentName)}`,
      ].filter(Boolean).join('\n')),
      HR,
      actions([
        { text: '查看会话', value: { cmd: 'sessions' }, style: 'primary' },
        { text: '使用帮助', value: { cmd: 'help' } },
      ]),
    ]);
  }
  const sessionLine = info.sessionId
    ? `\`${info.sessionId.slice(0, 8)}…\`${info.sessionStale ? ' ! 旧工作目录，下一条会新建' : ''}`
    : '(无)';
  // For topic groups, surface that the scope is per-topic so the user
  // knows /cd / /new only affect this topic.
  const scopeLine =
    info.chatMode === 'topic'
      ? `\`${escapeCode(info.scope)}\` _（话题独立 session）_`
      : `\`${escapeCode(info.scope)}\``;
  const lines = [
    `范围：${scopeLine}`,
    `工作目录：\`${escapeCode(info.cwd)}\``,
    `会话：${sessionLine}`,
    `助手：${escapeMd(info.agentName)}`,
  ];
  return shell('当前状态', [
    divMd(lines.join('\n')),
    HR,
    actions([
      { text: '新会话', value: { cmd: 'new' }, style: 'primary' },
      { text: '工作空间', value: { cmd: 'ws.list' } },
      { text: '使用帮助', value: { cmd: 'help' } },
    ]),
  ]);
}

export function helpCard(): object {
  return shell('使用帮助', [
    divMd(
      [
        '**推荐用法**',
        '',
        '在私聊中点击“选择项目”，进入对应项目群。',
        '直接点击飞书“新建话题”并发送需求，Bridge 会自动创建独立的 Codex 会话。',
        '需要恢复历史对话时，点击“查看会话”并选择原会话。',
        '',
        '运行中的任务可以点击卡片上的“停止任务”；需要授权时，直接点击中文确认按钮。',
        '',
        '**高级入口**',
        '也可以发送 `/projects`、`/sessions`、`/status`、`/stop`、`/new`。',
      ].join('\n'),
    ),
    HR,
    actions([
      { text: '状态', value: { cmd: 'status' }, style: 'primary' },
      { text: '选择项目', value: { cmd: 'projects' } },
    ]),
  ]);
}

function escapeMd(s: string): string {
  return s.replace(/([*_`\\])/g, '\\$1');
}

function escapeCode(s: string): string {
  return s.replace(/`/g, "'");
}
