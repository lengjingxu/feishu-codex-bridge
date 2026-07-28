import { setSecret } from './keystore';
import type { AppConfig } from './schema';
import { secretKeyForApp } from './schema';
import { buildEncryptedAccountConfig, saveConfig } from './store';

/** Encrypt credentials returned by Feishu's registerApp flow before saving. */
export async function persistRegisteredConfig(
  cfg: AppConfig,
  configPath: string,
): Promise<AppConfig> {
  const secret = cfg.accounts.app.secret;
  if (typeof secret !== 'string') {
    await saveConfig(cfg, configPath);
    return cfg;
  }

  const next = await buildEncryptedAccountConfig(
    cfg.accounts.app.id,
    cfg.accounts.app.tenant,
    cfg.preferences,
  );
  await setSecret(secretKeyForApp(cfg.accounts.app.id), secret);
  await saveConfig(next, configPath);
  return next;
}
