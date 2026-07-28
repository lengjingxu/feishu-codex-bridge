import { runRegistrationWizard } from '../../bot/wizard';
import { paths } from '../../config/paths';
import { persistRegisteredConfig } from '../../config/registration';
import { isComplete } from '../../config/schema';
import { loadConfig } from '../../config/store';

export interface SetupOptions {
  config?: string;
  newApp?: boolean;
}

/**
 * Create a Feishu app, or re-authorize the configured app, through Feishu's
 * official device flow. Secrets are encrypted locally before this returns.
 */
export async function runSetup(opts: SetupOptions = {}): Promise<void> {
  const configPath = opts.config ?? paths.configFile;
  const existing = await loadConfig(configPath);
  const current = isComplete(existing) ? existing : undefined;

  const fresh = await runRegistrationWizard({
    ...(!opts.newApp && current ? { appId: current.accounts.app.id } : {}),
    ...(current?.preferences ? { preferences: current.preferences } : {}),
  });
  await persistRegisteredConfig(fresh, configPath);
  console.log(`配置与凭据已安全保存到 ${configPath}`);
  console.log('下一步运行：feishu-codex-bridge start\n');
}
