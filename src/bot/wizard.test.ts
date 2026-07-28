import { beforeEach, describe, expect, it, vi } from 'vitest';

const { registerApp, generateQr } = vi.hoisted(() => ({
  registerApp: vi.fn(),
  generateQr: vi.fn(),
}));

vi.mock('@larksuiteoapi/node-sdk', () => ({ registerApp }));
vi.mock('qrcode-terminal', () => ({ default: { generate: generateQr } }));

import {
  BRIDGE_APP_ADDONS,
  BRIDGE_APP_PRESET,
  runRegistrationWizard,
} from './wizard';

describe('runRegistrationWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerApp.mockImplementation(async (opts) => {
      opts.onQRCodeReady({ url: 'https://accounts.feishu.cn/device', expireIn: 600 });
      return {
        client_id: 'cli_created',
        client_secret: 'secret-created',
        user_info: { open_id: 'ou_operator', tenant_brand: 'feishu' },
      };
    });
  });

  it('creates a new app with the full bridge manifest', async () => {
    const cfg = await runRegistrationWizard();

    expect(registerApp).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'feishu-codex-bridge',
        appPreset: BRIDGE_APP_PRESET,
        addons: BRIDGE_APP_ADDONS,
        createOnly: true,
      }),
    );
    expect(generateQr).toHaveBeenCalledWith('https://accounts.feishu.cn/device', { small: true });
    expect(cfg.accounts.app.id).toBe('cli_created');
    expect(cfg.preferences?.access?.admins).toEqual(['ou_operator']);
  });

  it('updates an existing app without createOnly and preserves preferences', async () => {
    const cfg = await runRegistrationWizard({
      appId: 'cli_existing',
      preferences: { agentBackend: 'codex', maxConcurrentRuns: 4 },
    });

    const call = registerApp.mock.calls[0]?.[0];
    expect(call).toMatchObject({ appId: 'cli_existing', addons: BRIDGE_APP_ADDONS });
    expect(call).not.toHaveProperty('createOnly');
    expect(cfg.preferences).toMatchObject({
      agentBackend: 'codex',
      maxConcurrentRuns: 4,
      access: { admins: ['ou_operator'] },
    });
  });

  it('keeps existing administrators when re-authorizing', async () => {
    const cfg = await runRegistrationWizard({
      appId: 'cli_existing',
      preferences: { access: { admins: ['ou_existing'], allowedUsers: ['ou_allowed'] } },
    });

    expect(cfg.preferences?.access).toEqual({
      admins: ['ou_existing', 'ou_operator'],
      allowedUsers: ['ou_allowed'],
    });
  });
});
