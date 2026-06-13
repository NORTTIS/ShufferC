import { AIProvider } from './provider';
import { createGeminiProvider, GeminiConfig } from './gemini';
import { createOpenRouterProvider } from './openrouter';
import { Db } from '../db/client';
import { serverSettings } from '../db/schema';

export type ProviderType = 'gemini' | 'openrouter';

export interface ProviderSettings {
  openrouterApiKey: string | null;
  frameworkGenProvider: ProviderType;
  frameworkGenModel: string;
  liveEventProvider: ProviderType;
  liveEventModel: string;
}

export const PROVIDER_DEFAULTS: ProviderSettings = {
  openrouterApiKey: null,
  frameworkGenProvider: 'gemini',
  frameworkGenModel: 'google/gemini-2.5-pro',
  liveEventProvider: 'gemini',
  liveEventModel: 'google/gemini-2.5-flash',
};

export interface ProviderRegistry {
  getFrameworkProvider(): AIProvider;
  getLiveEventProvider(): AIProvider;
  getSettings(): Readonly<ProviderSettings>;
  reload(db: Db): Promise<void>;
}

function makeProvider(
  type: ProviderType,
  proModel: string,
  flashModel: string,
  geminiCfg: GeminiConfig,
  openrouterApiKey: string | null,
): AIProvider {
  if (type === 'openrouter') {
    if (!openrouterApiKey) {
      return { available: false, async generateStructured() { throw new Error('OpenRouter API key not configured'); } };
    }
    return createOpenRouterProvider({ apiKey: openrouterApiKey, proModel, flashModel });
  }
  return createGeminiProvider(geminiCfg);
}

const VALID_PROVIDERS: ProviderType[] = ['gemini', 'openrouter'];
function toProviderType(v: string | undefined): ProviderType | undefined {
  return v && VALID_PROVIDERS.includes(v as ProviderType) ? (v as ProviderType) : undefined;
}

export async function loadSettingsFromDb(db: Db): Promise<ProviderSettings> {
  const rows = await db.select().from(serverSettings);
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;
  return {
    openrouterApiKey: map['openrouter_api_key'] ?? PROVIDER_DEFAULTS.openrouterApiKey,
    frameworkGenProvider: toProviderType(map['framework_gen_provider']) ?? PROVIDER_DEFAULTS.frameworkGenProvider,
    frameworkGenModel: map['framework_gen_model'] ?? PROVIDER_DEFAULTS.frameworkGenModel,
    liveEventProvider: toProviderType(map['live_event_provider']) ?? PROVIDER_DEFAULTS.liveEventProvider,
    liveEventModel: map['live_event_model'] ?? PROVIDER_DEFAULTS.liveEventModel,
  };
}

export function createProviderRegistry(
  geminiCfg: GeminiConfig,
  initial: ProviderSettings = PROVIDER_DEFAULTS,
): ProviderRegistry {
  let s: ProviderSettings = { ...initial };
  let fw = makeProvider(s.frameworkGenProvider, s.frameworkGenModel, s.frameworkGenModel, geminiCfg, s.openrouterApiKey);
  let le = makeProvider(s.liveEventProvider, s.liveEventModel, s.liveEventModel, geminiCfg, s.openrouterApiKey);

  function apply(next: ProviderSettings) {
    s = { ...next };
    fw = makeProvider(s.frameworkGenProvider, s.frameworkGenModel, s.frameworkGenModel, geminiCfg, s.openrouterApiKey);
    le = makeProvider(s.liveEventProvider, s.liveEventModel, s.liveEventModel, geminiCfg, s.openrouterApiKey);
  }

  return {
    getFrameworkProvider: () => fw,
    getLiveEventProvider: () => le,
    getSettings: () => ({ ...s }),
    async reload(db: Db) { apply(await loadSettingsFromDb(db)); },
  };
}

/** Test double: wraps pre-built providers in a ProviderRegistry interface. */
export function createFakeRegistry(
  frameworkProvider: AIProvider,
  liveEventProvider: AIProvider = frameworkProvider,
): ProviderRegistry {
  return {
    getFrameworkProvider: () => frameworkProvider,
    getLiveEventProvider: () => liveEventProvider,
    getSettings: () => ({ ...PROVIDER_DEFAULTS }),
    async reload(_db: Db) {},
  };
}
