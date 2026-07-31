import { describe, expect, it } from 'vitest';
import {
  getOmpBinary,
  getOmpModel,
  getOmpSessionDir,
  getOmpThinking,
  getOmpTools,
  getAgentBackend,
  getCodexAppServerBinary,
  resolveCodexAppServerBinary,
  getProjectRoots,
  getEnableFeishuAssistantProject,
  isProjectAllowed,
  type AppConfig,
} from './schema';

function cfg(preferences: AppConfig['preferences'] = {}): AppConfig {
  return {
    accounts: { app: { id: 'cli_x', secret: 'secret', tenant: 'feishu' } },
    preferences,
  };
}

describe('OMP preferences', () => {
  it('defaults OMP binary to omp', () => {
    expect(getOmpBinary(cfg())).toBe('omp');
  });

  it('trims configured OMP binary and model', () => {
    expect(getOmpBinary(cfg({ ompBinary: ' /opt/bin/omp ' }))).toBe('/opt/bin/omp');
    expect(getOmpModel(cfg({ ompModel: ' gpt-5.5 ' }))).toBe('gpt-5.5');
  });

  it('falls back to legacy Codex binary and model when OMP fields are absent', () => {
    expect(getOmpBinary(cfg({ codexBinary: ' /opt/bin/codex ' }))).toBe('/opt/bin/codex');
    expect(getOmpModel(cfg({ codexModel: ' gpt-5.1 ' }))).toBe('gpt-5.1');
  });

  it('omits empty optional OMP flags', () => {
    expect(getOmpModel(cfg({ ompModel: '   ' }))).toBeUndefined();
    expect(getOmpThinking(cfg({ ompThinking: '   ' }))).toBeUndefined();
    expect(getOmpTools(cfg({ ompTools: '   ' }))).toBeUndefined();
  });

  it('trims OMP thinking, tools, and session dir', () => {
    expect(getOmpThinking(cfg({ ompThinking: ' xhigh ' }))).toBe('xhigh');
    expect(getOmpTools(cfg({ ompTools: ' read,bash ' }))).toBe('read,bash');
    expect(getOmpSessionDir(cfg({ ompSessionDir: ' /tmp/sessions ' }))).toBe('/tmp/sessions');
  });
});

describe('Codex project preferences', () => {
  it('keeps OMP as the default and trims Codex settings', () => {
    expect(getAgentBackend(cfg())).toBe('omp');
    expect(getAgentBackend(cfg({ agentBackend: 'codex' }))).toBe('codex');
    expect(getCodexAppServerBinary(cfg({ codexAppServerBinary: ' /opt/codex ' }))).toBe('/opt/codex');
    expect(resolveCodexAppServerBinary(cfg({ codexAppServerBinary: ' /opt/codex ' }))).toBe('/opt/codex');
    expect(getProjectRoots(cfg({ projectRoots: [' /tmp/a ', '', 3 as unknown as string] }))).toEqual(['/tmp/a']);
    expect(getEnableFeishuAssistantProject(cfg())).toBe(false);
    expect(getEnableFeishuAssistantProject(cfg({ agentBackend: 'codex' }))).toBe(true);
    expect(getEnableFeishuAssistantProject(cfg({ agentBackend: 'codex', enableFeishuAssistantProject: false }))).toBe(false);
  });

  it('supports optional per-project user allowlists with admin access', () => {
    const projectKey = 'local::/tmp/demo';
    const restricted = cfg({ access: { projectUsers: { [projectKey]: ['user-1'] }, admins: ['admin-1'] } });
    expect(isProjectAllowed(restricted, projectKey, 'user-1')).toBe(true);
    expect(isProjectAllowed(restricted, projectKey, 'user-2')).toBe(false);
    expect(isProjectAllowed(restricted, projectKey, 'admin-1')).toBe(true);
    expect(isProjectAllowed(restricted, 'local::/tmp/other', 'user-2')).toBe(true);
    expect(isProjectAllowed(restricted, undefined, 'user-2')).toBe(true);
  });
});
