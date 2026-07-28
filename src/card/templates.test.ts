import { describe, expect, it } from 'vitest';
import { projectWelcomeCard, projectsCard, sessionDetailCard, sessionProgressCard, sessionSearchCard, sessionsCard, topicTitle, topicWelcomeCard, welcomeCard } from './templates';
import type { SessionDetail } from '../project/types';

function text(card: object): string {
  return JSON.stringify(card);
}

describe('project-first Feishu cards', () => {
  it('renders a Chinese welcome card with action buttons', () => {
    const rendered = text(welcomeCard());
    expect(rendered).toContain('选择项目');
    expect(rendered).toContain('使用帮助');
    expect(rendered).not.toContain('chat_id');
  });

  it('renders empty and populated project/session states', () => {
    expect(text(projectsCard([]))).toContain('暂时没有可用项目');
    const unboundProject = text(projectsCard([{ projectKey: 'p1', name: '示例项目', cwd: '/tmp/demo', hostId: '本机' }]));
    expect(unboundProject).toContain('创建项目群');
    expect(unboundProject).not.toContain('查看会话');
    expect(text(projectsCard([{ projectKey: 'p1', name: '示例项目', cwd: '/tmp/demo', hostId: '本机', chatId: 'chat-1' }]))).toContain('查看会话');
    const emptySessions = text(sessionsCard('示例项目', []));
    expect(emptySessions).toContain('新建话题');
    expect(emptySessions).not.toContain('session.new');
    const sessions = text(sessionsCard('示例项目', [{ threadId: 'thread-1', preview: '修复卡片', status: 'idle', updatedAt: Date.now() }], 'cursor-2'));
    expect(sessions).toContain('继续此会话');
    expect(sessions).toContain('加载更多');
    expect(sessions).toContain('搜索会话');
    expect(sessions).not.toContain('"content":"归档"');
    const metadata = text(sessionsCard('示例项目', [{ threadId: 'thread-2', preview: '等待输入', status: 'active', activeFlags: ['waitingOnUserInput'], source: 'vscode', forkedFromId: 'thread-0', updatedAt: Date.now() }]));
    expect(metadata).toContain('等待输入');
    expect(metadata).not.toContain('VS Code');
    expect(metadata).not.toContain('分支会话');
  });

  it('renders a CardKit form for session title search', () => {
    const card = text(sessionSearchCard('示例项目'));
    expect(card).toContain('session_search');
    expect(card).toContain('sessions.search');
    expect(card).toContain('form_action_type');
  });

  it('renders project and topic context without exposing internal ids', () => {
    const project = text(projectWelcomeCard({ name: '示例项目', cwd: '/tmp/demo' }));
    const topic = text(topicWelcomeCard('示例项目', '修复卡片', '/tmp/demo'));
    expect(project).toContain('项目工作台');
    expect(project).toContain('新建话题');
    expect(project).not.toContain('session.new');
    expect(topic).toContain('示例项目 · 修复卡片');
    expect(topic).toContain('当前位置：Codex 工作话题');
    expect(topic).toContain('会话会保存到本机 Codex');
    expect(topic).toContain('按时间排序');
    expect(topic).not.toContain('session.new');
    for (const emoji of ['👋', '📁', '📚', '📊', '🔄', '⏹', '💡']) {
      expect(project).not.toContain(emoji);
      expect(topic).not.toContain(emoji);
    }
    expect(topic).not.toContain('thread_id');
  });

  it('builds useful topic titles for unnamed, generic and long sessions', () => {
    expect(topicTitle('示例项目', '')).toBe('示例项目 · 新会话');
    expect(topicTitle('示例项目', 'omp 会话已连接')).toBe('示例项目 · 新会话');
    expect(topicTitle('示例项目', '  修复   飞书  ')).toBe('示例项目 · 修复 飞书');
    expect(Array.from(topicTitle('项目', '很长的会话名称'.repeat(20))).length).toBeLessThanOrEqual(80);
    expect(topicTitle('项目', '很长的会话名称'.repeat(20)).endsWith('…')).toBe(true);
  });

  it('renders manual and automatic session sync actions', () => {
    const detail: SessionDetail = {
      threadId: 'thread-1', preview: '最新进度', cwd: '/tmp/project', status: 'active', updatedAt: Date.now(),
      turnCount: 2, recentActivity: [{ kind: '助手', text: '正在执行测试' }],
    };
    const card = text(sessionProgressCard('示例项目', detail));
    expect(card).toContain('刷新进度');
    expect(card).toContain('开启自动刷新');
    expect(card).toContain('停止任务');
    expect(text(sessionProgressCard('示例项目', detail, true))).toContain('关闭自动刷新');
    const idle = { ...detail, status: 'idle' as const };
    expect(text(sessionProgressCard('示例项目', idle))).not.toContain('"content":"停止任务"');
  });

  it('moves archive into session details instead of the main list', () => {
    const detail: SessionDetail = {
      threadId: 'thread-1', name: '修复卡片', preview: '最新进度', cwd: '/tmp/project', status: 'idle', updatedAt: Date.now(),
      turnCount: 2, recentActivity: [{ kind: '助手', text: '已完成' }],
    };
    const card = text(sessionDetailCard('示例项目', detail));
    expect(card).toContain('归档会话');
    expect(card).toContain('返回会话列表');
  });
});
