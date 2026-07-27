import { describe, expect, it } from 'vitest';
import { projectWelcomeCard, projectsCard, sessionProgressCard, sessionsCard, topicTitle, topicWelcomeCard, welcomeCard } from './templates';
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
    expect(text(projectsCard([{ projectKey: 'p1', name: '示例项目', cwd: '/tmp/demo', hostId: '本机' }]))).toContain('创建项目群');
    expect(text(sessionsCard('示例项目', []))).toContain('新建会话');
    const sessions = text(sessionsCard('示例项目', [{ threadId: 'thread-1', preview: '修复卡片', status: 'idle', updatedAt: Date.now() }], 'cursor-2'));
    expect(sessions).toContain('继续此会话');
    expect(sessions).toContain('加载更多');
    expect(sessions).toContain('归档');
    const metadata = text(sessionsCard('示例项目', [{ threadId: 'thread-2', preview: '等待输入', status: 'active', activeFlags: ['waitingOnUserInput'], source: 'vscode', forkedFromId: 'thread-0', updatedAt: Date.now() }]));
    expect(metadata).toContain('等待输入');
    expect(metadata).not.toContain('VS Code');
    expect(metadata).not.toContain('分支会话');
  });

  it('renders project and topic context without exposing internal ids', () => {
    const project = text(projectWelcomeCard({ name: '示例项目', cwd: '/tmp/demo' }));
    const topic = text(topicWelcomeCard('示例项目', '修复卡片', '/tmp/demo'));
    expect(project).toContain('项目工作台');
    expect(project).toContain('代码需求请进入具体话题后发送');
    expect(topic).toContain('示例项目 · 修复卡片');
    expect(topic).toContain('当前位置：Codex 工作话题');
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
    expect(card).toContain('开始自动同步');
    expect(text(sessionProgressCard('示例项目', detail, true))).toContain('停止自动同步');
  });
});
