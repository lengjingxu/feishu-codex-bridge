import type { FooterStatus, Terminal } from './run-state';

export function runStatusText(terminal: Terminal, footer: FooterStatus): string {
  if (terminal === 'done') return '已完成';
  if (terminal === 'error') return '执行失败';
  if (terminal === 'interrupted') return '已中断';
  if (terminal === 'idle_timeout') return '已超时';
  if (footer === 'tool_running') return '调用工具';
  if (footer === 'waiting_input') return '等待用户交互';
  if (footer === 'streaming') return '输出中';
  return '进行中';
}
