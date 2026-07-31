import { describe, expect, it } from 'vitest';
import { renderText } from './text-renderer';
import { initialState, reduce } from './run-state';

describe('text run status', () => {
  it('renders the terminal status without the Codex title or stale session status', () => {
    let state = reduce(initialState, { type: 'ui_title', title: '只回复“P0 UI 验证完成”，不要修改文件。' });
    state = reduce(state, { type: 'ui_status', status: { key: '会话状态', text: '空闲' } });
    state = reduce(state, { type: 'done' });

    const rendered = renderText(state);

    expect(rendered).toContain('状态');
    expect(rendered).toContain('已完成');
    expect(rendered).not.toContain('只回复“P0 UI 验证完成”');
    expect(rendered).not.toContain('会话状态');
    expect(rendered).not.toContain('空闲');
  });
});
