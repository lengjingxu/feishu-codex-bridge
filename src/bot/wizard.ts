import { registerApp, type AppAddons } from '@larksuiteoapi/node-sdk';
import qrcode from 'qrcode-terminal';
import type { AppConfig, AppPreferences, TenantBrand } from '../config/schema';

/**
 * Everything the bridge consumes at runtime. `registerApp` layers this over
 * Feishu's bot base template and pre-fills the official confirmation page.
 * Keep this list aligned with the event handlers and raw OpenAPI calls used by
 * src/bot/channel.ts and its collaborators.
 */
export const BRIDGE_APP_ADDONS: AppAddons = {
  scopes: {
    tenant: [
      'im:message',
      'im:message.group_at_msg',
      'im:message.group_msg',
      'im:message:recall',
      'im:message.reactions:read',
      'im:message.reactions:write_only',
      'im:resource',
      'im:chat',
      'im:chat:create',
      'im:chat.members:bot_access',
      'cardkit:card:write',
      'docs:document.comment:read',
      'docs:document.comment:create',
      'wiki:wiki:readonly',
    ],
  },
  events: {
    items: {
      tenant: [
        'im.message.receive_v1',
        'im.message.reaction.created_v1',
        'im.message.reaction.deleted_v1',
        'im.chat.member.bot.added_v1',
        'drive.notice.comment_add_v1',
      ],
    },
  },
  callbacks: {
    items: ['card.action.trigger'],
  },
};

export const BRIDGE_APP_PRESET: NonNullable<Parameters<typeof registerApp>[0]['appPreset']> = {
  name: 'Codex Bridge · {user}',
  desc: '在飞书中安全继续本机 Codex 会话：一个项目一个群，一个会话一个话题。',
};

export interface RegistrationWizardOptions {
  /** Existing app to incrementally authorize. Omit to create a new app. */
  appId?: string;
  /** Preserve local preferences while replacing credentials. */
  preferences?: AppPreferences;
}

export async function runRegistrationWizard(
  opts: RegistrationWizardOptions = {},
): Promise<AppConfig> {
  const updating = Boolean(opts.appId);
  console.log(
    updating
      ? '\n正在为当前飞书应用补齐 Codex Bridge 所需权限。\n'
      : '\n未检测到飞书应用配置，进入扫码一键创建向导。\n',
  );

  const result = await registerApp({
    source: 'feishu-codex-bridge',
    appPreset: BRIDGE_APP_PRESET,
    addons: BRIDGE_APP_ADDONS,
    ...(opts.appId ? { appId: opts.appId } : { createOnly: true }),
    onQRCodeReady: (info) => {
      console.log(
        updating
          ? '请用飞书 App 扫描以下二维码，确认新增权限与事件：\n'
          : '请用飞书 App 扫描以下二维码，一键创建机器人并确认权限：\n',
      );
      qrcode.generate(info.url, { small: true });
      const mins = Math.max(1, Math.round(info.expireIn / 60));
      console.log(`\n二维码有效期：约 ${mins} 分钟`);
      console.log(`也可以直接在浏览器打开：${info.url}\n`);
    },
    onStatusChange: (info) => {
      if (info.status === 'domain_switched') {
        console.log('识别到国际版租户，已切换到 larksuite.com 域名。');
      } else if (info.status === 'slow_down') {
        console.log('轮询速度过快，已自动降速。');
      }
    },
  });

  const tenant: TenantBrand = result.user_info?.tenant_brand ?? 'feishu';
  const operatorOpenId = result.user_info?.open_id;

  console.log(updating ? '\n✓ 应用权限更新成功' : '\n✓ 应用创建成功');
  console.log(`  App ID:  ${result.client_id}`);
  console.log(`  Tenant:  ${tenant}`);

  const cfg: AppConfig = {
    accounts: {
      app: {
        id: result.client_id,
        secret: result.client_secret,
        tenant,
      },
    },
    ...(opts.preferences ? { preferences: opts.preferences } : {}),
  };

  // Bootstrap the QR scanner as the initial admin. Without this seed the
  // /config gate stays open to everyone in any chat the bot joins, making
  // it awkward to ever tighten things (the operator would need to hand-edit
  // config.json to set the first admin).
  //
  // `allowedUsers` and `allowedChats` stay empty (unrestricted) by default
  // so the bot remains inviteable and responds anywhere it's invited; the
  // operator can tighten via /config later.
  if (operatorOpenId) {
    const existingAdmins = cfg.preferences?.access?.admins ?? [];
    cfg.preferences = {
      ...cfg.preferences,
      access: {
        ...cfg.preferences?.access,
        admins: [...new Set([...existingAdmins, operatorOpenId])],
      },
    };
    console.log(`  Admin:   ${operatorOpenId} (你自己，已自动加入管理员名单)`);
  } else {
    const hasAdmins = (cfg.preferences?.access?.admins?.length ?? 0) > 0;
    console.log(hasAdmins
      ? '  ⚠️ 未拿到扫码用户的 open_id；已保留现有管理员名单。'
      : '  ⚠️ 未拿到扫码用户的 open_id；管理员列表留空 = 所有用户都能跑敏感命令。' +
        '\n     你可以稍后在飞书发 /config 手动设置管理员。');
  }

  console.log('');
  return cfg;
}
