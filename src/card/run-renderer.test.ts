import { describe, expect, it } from 'vitest';
import { renderCard } from './run-renderer';
import { initialState, reduce } from './run-state';

describe('run completion evidence card', () => {
  it('shows context warning while running and acceptance actions after completion', () => {
    let state = reduce(initialState, { type: 'system', sessionId: 'thread-1' });
    state = reduce(state, {
      type: 'usage',
      inputTokens: 100,
      outputTokens: 20,
      totalTokens: 90_000,
      contextTokens: 90_000,
      modelContextWindow: 100_000,
    });
    expect(JSON.stringify(renderCard(state, { sessionActions: true }))).toContain('上下文使用率高');
    expect(JSON.stringify(renderCard(state, { sessionActions: true }))).toContain('session.compact');

    state = reduce(state, { type: 'ui_status', status: { key: '代码改动', text: '已生成改动（20 行）' } });
    state = reduce(state, { type: 'tool_use', id: 'test-1', name: '运行命令', input: { command: 'pnpm test' } });
    state = reduce(state, { type: 'tool_result', id: 'test-1', output: 'passed', isError: false });
    state = reduce(state, { type: 'done', sessionId: 'thread-1' });
    const completed = JSON.stringify(renderCard(state, { sessionActions: true }));
    expect(completed).toContain('验收证据');
    expect(completed).toContain('刷新进度');
    expect(completed).toContain('20 行');
    expect(completed).toContain('1 成功');
    expect(completed).toContain('session.review');
    expect(completed).toContain('session.fork');
  });

  it('shows the run status without exposing the Codex title or stale session status', () => {
    let state = reduce(initialState, { type: 'ui_title', title: '只回复“P0 UI 验证完成”，不要修改文件。' });
    state = reduce(state, { type: 'ui_status', status: { key: '会话状态', text: '空闲' } });
    state = reduce(state, { type: 'done' });

    const rendered = JSON.stringify(renderCard(state));

    expect(rendered).toContain('状态');
    expect(rendered).toContain('已完成');
    expect(rendered).not.toContain('只回复“P0 UI 验证完成”');
    expect(rendered).not.toContain('会话状态');
    expect(rendered).not.toContain('空闲');
  });
});
