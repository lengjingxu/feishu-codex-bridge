import type { Block, FooterStatus, RunState, ToolEntry, UiState } from './run-state';
import { toolBodyMd, toolHeaderText } from './tool-render';

const REASONING_MAX = 1500;
const COLLAPSE_TOOL_THRESHOLD = 3;

interface ToolGroup {
  kind: 'tools';
  tools: ToolEntry[];
}
interface TextGroup {
  kind: 'text';
  content: string;
}
type Group = ToolGroup | TextGroup;

export interface RunCardOptions {
  sessionActions?: boolean;
  taskId?: string;
}

export function renderCard(state: RunState, options: RunCardOptions = {}): object {
  const elements: object[] = [];

  if (state.reasoning.content) {
    elements.push(reasoningPanel(state.reasoning.content, state.reasoning.active));
  }

  const ui = uiContextPanel(state.ui);
  if (ui) elements.push(ui);

  for (const group of groupBlocks(state.blocks)) {
    if (group.kind === 'text') {
      if (group.content.trim()) {
        elements.push(markdown(group.content));
      }
    } else {
      elements.push(...renderToolGroup(group.tools, state.terminal !== 'running'));
    }
  }

  if (state.terminal === 'interrupted') {
    elements.push(noteMd('_已被中断_'));
  } else if (state.terminal === 'idle_timeout') {
    const mins = state.idleTimeoutMinutes ?? 0;
    elements.push(noteMd(`_⏱ ${mins} 分钟无响应,已自动终止_`));
  } else if (state.terminal === 'error' && state.errorMsg) {
    elements.push(noteMd(`! agent 失败：${state.errorMsg}`));
  } else if (state.terminal === 'done' && elements.length === 0) {
    elements.push(noteMd('_（未返回内容）_'));
  }

  if (state.terminal === 'running') {
    const usage = usagePanel(state, options.sessionActions === true);
    if (usage) elements.push(usage);
    if (state.footer) elements.push(footerStatus(state.footer));
    elements.push(stopButton());
  } else if (state.terminal === 'done') {
    elements.push(completionEvidence(state, options.taskId));
    if (state.sessionId && options.sessionActions) elements.push(completionActions(state));
  } else if (state.sessionId && options.sessionActions) {
    // A terminal card is often the only card a user keeps open in a topic.
    // Keep the sync entry available here rather than requiring a scroll back
    // to the topic welcome card.
    elements.push(refreshAction());
  }

  return {
    schema: '2.0',
    config: {
      streaming_mode: state.terminal === 'running',
      summary: { content: summaryText(state) },
    },
    body: { elements },
  };
}

function* groupBlocks(blocks: Block[]): Generator<Group> {
  let toolBuf: ToolEntry[] = [];
  for (const b of blocks) {
    if (b.kind === 'tool') {
      toolBuf.push(b.tool);
    } else {
      if (toolBuf.length > 0) {
        yield { kind: 'tools', tools: toolBuf };
        toolBuf = [];
      }
      yield { kind: 'text', content: b.content };
    }
  }
  if (toolBuf.length > 0) yield { kind: 'tools', tools: toolBuf };
}

function renderToolGroup(tools: ToolEntry[], finalized: boolean): object[] {
  if (tools.length === 0) return [];
  if (tools.length < COLLAPSE_TOOL_THRESHOLD) {
    return tools.map((t) => toolPanel(t, false));
  }
  if (finalized) {
    return [collapsedToolSummary(tools, true)];
  }
  // Running: collapse prior tools, keep latest visible.
  const prior = tools.slice(0, -1);
  const latest = tools[tools.length - 1];
  const out: object[] = [];
  if (prior.length > 0) out.push(collapsedToolSummary(prior, false));
  if (latest) out.push(toolPanel(latest, true));
  return out;
}

function reasoningPanel(content: string, active: boolean): object {
  const title = active ? '**思考中**' : '**思考完成，点击查看**';
  return collapsiblePanel({
    title,
    expanded: active,
    border: 'grey',
    body: truncate(content, REASONING_MAX),
  });
}

function toolPanel(tool: ToolEntry, expanded: boolean): object {
  return collapsiblePanel({
    title: toolHeaderText(tool),
    expanded,
    border: tool.status === 'error' ? 'red' : 'grey',
    body: toolBodyMd(tool) || '_无输出_',
  });
}

/**
 * Render N tool calls as a single collapsed panel. **Body content is dropped**
 * — only the per-tool header line (icon + name + short summary) is kept.
 *
 * Why no bodies: with full input/output panels nested, the serialized JSON
 * can easily exceed Feishu's per-element size limit (~30KB), causing 400
 * errors that abort the entire card stream. Tool details are still in the
 * file log; users who really need them can `/doctor` to inspect.
 *
 * The latest-running tool, when applicable, is rendered separately via
 * `toolPanel(latest, true)` so live observation isn't sacrificed.
 */
function collapsedToolSummary(tools: ToolEntry[], finalized: boolean): object {
  const suffix = finalized ? '（已结束）' : '';
  const title = `**${tools.length} 个工具调用${suffix}**`;
  const headerList = tools.map((t) => `- ${toolHeaderText(t)}`).join('\n');
  return {
    tag: 'collapsible_panel',
    expanded: false,
    header: panelHeader(title),
    border: { color: 'blue', corner_radius: '5px' },
    vertical_spacing: '8px',
    padding: '8px 8px 8px 8px',
    elements: [{ tag: 'markdown', content: headerList, text_size: 'notation' }],
  };
}

interface PanelOpts {
  title: string;
  expanded: boolean;
  border: 'grey' | 'red' | 'blue';
  body: string;
}

function collapsiblePanel(opts: PanelOpts): object {
  return {
    tag: 'collapsible_panel',
    expanded: opts.expanded,
    header: panelHeader(opts.title),
    border: { color: opts.border, corner_radius: '5px' },
    vertical_spacing: '8px',
    padding: '8px 8px 8px 8px',
    elements: [{ tag: 'markdown', content: opts.body, text_size: 'notation' }],
  };
}

function panelHeader(titleMd: string): object {
  return {
    title: { tag: 'markdown', content: titleMd },
    vertical_align: 'center',
    icon: { tag: 'standard_icon', token: 'down-small-ccm_outlined', size: '16px 16px' },
    icon_position: 'follow_text',
    icon_expanded_angle: -180,
  };
}

function markdown(content: string): object {
  return { tag: 'markdown', content };
}

function noteMd(content: string): object {
  return { tag: 'markdown', content, text_size: 'notation' };
}

function stopButton(): object {
  return {
    tag: 'button',
    text: { tag: 'plain_text', content: '终止任务' },
    type: 'danger',
    behaviors: [{ type: 'callback', value: { cmd: 'stop' } }],
  };
}

function completionEvidence(state: RunState, taskId?: string): object {
  const tools = state.blocks.filter((block): block is Extract<Block, { kind: 'tool' }> => block.kind === 'tool');
  const passed = tools.filter((block) => block.tool.status === 'done').length;
  const failed = tools.filter((block) => block.tool.status === 'error').length;
  const tests = tools.filter((block) => /\b(?:test|vitest|jest|pytest|cargo test|go test)\b/i.test(JSON.stringify(block.tool.input)));
  const passedTests = tests.filter((block) => block.tool.status === 'done').length;
  const failedTests = tests.filter((block) => block.tool.status === 'error').length;
  const lines = [
    '**验收证据**',
    taskId ? `- 任务：${shortTaskId(taskId)}` : undefined,
    state.ui.statuses['代码改动'] ? `- 代码改动：${state.ui.statuses['代码改动']}` : '- 代码改动：未报告',
    `- 工具执行：${passed} 成功${failed ? `，${failed} 失败` : ''}`,
    tests.length
      ? `- 测试：${passedTests} 通过${failedTests ? `，${failedTests} 失败` : ''}`
      : '- 测试：未报告',
    usageSummary(state),
  ].filter(Boolean);
  return collapsiblePanel({
    title: '**任务已完成 · 查看验收信息**',
    expanded: true,
    border: failed ? 'red' : 'blue',
    body: lines.join('\n'),
  });
}

function shortTaskId(taskId: string): string {
  const normalized = taskId.replace(/^task_/, '').slice(0, 8).toUpperCase();
  return `#${normalized}`;
}

function completionActions(state: RunState): object {
  const actions: object[] = [
    actionButton('刷新进度', 'primary', { cmd: 'sync' }),
    actionButton('审查当前改动', 'primary', { cmd: 'session.review' }),
    actionButton('从这里创建分支会话', 'default', { cmd: 'session.fork' }),
  ];
  if (contextPercent(state) !== undefined) {
    actions.push(actionButton('压缩上下文', 'default', { cmd: 'session.compact' }));
  }
  return { tag: 'action', actions };
}

function refreshAction(): object {
  return {
    tag: 'action',
    actions: [
      actionButton('刷新进度', 'primary', { cmd: 'sync' }),
      actionButton('查看状态', 'default', { cmd: 'status' }),
    ],
  };
}

function usagePanel(state: RunState, sessionActions: boolean): object | undefined {
  const percent = contextPercent(state);
  if (percent === undefined || percent < 70) return undefined;
  const level = percent >= 90 ? '高' : '较高';
  return {
    tag: 'column_set',
    flex_mode: 'flow',
    columns: [
      {
        tag: 'column',
        width: 'weighted',
        weight: 1,
        elements: [noteMd(`上下文使用率${level}：**${percent}%**。可压缩后继续，避免接近上限。`)],
      },
      ...(state.sessionId && sessionActions ? [{
        tag: 'column',
        width: 'auto',
        elements: [actionButton('压缩上下文', 'default', { cmd: 'session.compact' })],
      }] : []),
    ],
  };
}

function usageSummary(state: RunState): string {
  const usage = state.usage;
  if (!usage) return '- 上下文：未报告';
  const percent = contextPercent(state);
  const total = usage.totalTokens === undefined ? '未知' : usage.totalTokens.toLocaleString('en-US');
  return `- 上下文：${total} tokens${percent === undefined ? '' : `（${percent}%）`}`;
}

function contextPercent(state: RunState): number | undefined {
  const total = state.usage?.contextTokens;
  const window = state.usage?.modelContextWindow;
  if (!total || !window || window <= 0) return undefined;
  return Math.min(100, Math.round(total / window * 100));
}

function actionButton(text: string, type: 'primary' | 'default' | 'danger', value: Record<string, unknown>): object {
  return {
    tag: 'button',
    text: { tag: 'plain_text', content: text },
    type,
    behaviors: [{ type: 'callback', value }],
  };
}

function footerStatus(status: Exclude<FooterStatus, null>): object {
  const text =
    status === 'thinking'
      ? '正在思考'
      : status === 'tool_running'
        ? '正在调用工具'
        : status === 'waiting_input'
          ? '等待用户交互'
          : '正在输出';
  return noteMd(text);
}

function uiContextPanel(ui: UiState): object | undefined {
  const lines: string[] = [];
  if (ui.title) lines.push(`**标题**：${ui.title}`);
  for (const [key, text] of Object.entries(ui.statuses)) {
    lines.push(`**${key}**：${text}`);
  }
  for (const [key, widget] of Object.entries(ui.widgets)) {
    const placement = widget.placement ? `_${widget.placement}_` : '';
    lines.push(`**${key}** ${placement}\n${(widget.lines ?? []).join('\n')}`.trim());
  }
  if (ui.editorText) lines.push(`**编辑器内容**\n\`\`\`\n${truncate(ui.editorText, 1200)}\n\`\`\``);
  if (lines.length === 0) return undefined;
  return collapsiblePanel({
    title: '**执行状态**',
    expanded: true,
    border: 'blue',
    body: lines.join('\n\n'),
  });
}

function summaryText(state: RunState): string {
  if (state.terminal === 'interrupted') return '已中断';
  if (state.terminal === 'idle_timeout') return '已超时';
  if (state.terminal === 'error') return '出错';
  if (state.terminal === 'done') return '已完成';
  if (state.footer === 'tool_running') return '正在调用工具';
  if (state.footer === 'streaming') return '正在输出';
  if (state.footer === 'waiting_input') return '等待用户交互';
  return '思考中';
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
