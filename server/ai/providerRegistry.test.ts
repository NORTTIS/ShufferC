import { createProviderRegistry, createFakeRegistry, PROVIDER_DEFAULTS, ProviderSettings } from './providerRegistry';
import { GeminiConfig } from './gemini';
import { createFakeProvider } from './provider';

const GEMINI: GeminiConfig = {
  apiKey: 'gkey',
  proModel: 'gemini-2.5-pro',
  flashModel: 'gemini-2.5-flash',
  embedModel: 'embed',
};
const NO_KEY: GeminiConfig = { ...GEMINI, apiKey: null };

function mockDb(rows: Array<{ key: string; value: string }>) {
  return {
    select: () => ({ from: (_t: unknown) => Promise.resolve(rows) }),
  } as any;
}

describe('createProviderRegistry', () => {
  it('framework provider is available with default gemini settings + key', () => {
    const reg = createProviderRegistry(GEMINI);
    expect(reg.getFrameworkProvider().available).toBe(true);
  });

  it('live event provider is available with default gemini settings + key', () => {
    const reg = createProviderRegistry(GEMINI);
    expect(reg.getLiveEventProvider().available).toBe(true);
  });

  it('framework provider unavailable when openrouter selected but no API key', () => {
    const s: ProviderSettings = { ...PROVIDER_DEFAULTS, frameworkGenProvider: 'openrouter', openrouterApiKey: null };
    const reg = createProviderRegistry(GEMINI, s);
    expect(reg.getFrameworkProvider().available).toBe(false);
  });

  it('framework provider available when openrouter selected with API key', () => {
    const s: ProviderSettings = { ...PROVIDER_DEFAULTS, frameworkGenProvider: 'openrouter', openrouterApiKey: 'or-key' };
    const reg = createProviderRegistry(GEMINI, s);
    expect(reg.getFrameworkProvider().available).toBe(true);
  });

  it('getSettings returns copy of current settings', () => {
    const s: ProviderSettings = { ...PROVIDER_DEFAULTS, openrouterApiKey: 'secret' };
    const reg = createProviderRegistry(GEMINI, s);
    expect(reg.getSettings().openrouterApiKey).toBe('secret');
    expect(reg.getSettings().frameworkGenProvider).toBe('gemini');
  });

  it('reload swaps providers based on DB rows', async () => {
    const reg = createProviderRegistry(GEMINI);
    expect(reg.getFrameworkProvider().available).toBe(true);

    await reg.reload(mockDb([
      { key: 'framework_gen_provider', value: 'openrouter' },
      // no openrouter_api_key → unavailable
    ]));

    expect(reg.getFrameworkProvider().available).toBe(false);
    expect(reg.getSettings().frameworkGenProvider).toBe('openrouter');
  });

  it('reload with valid openrouter key makes provider available', async () => {
    const reg = createProviderRegistry(NO_KEY); // gemini has no key
    await reg.reload(mockDb([
      { key: 'framework_gen_provider', value: 'openrouter' },
      { key: 'openrouter_api_key', value: 'or-key' },
    ]));
    expect(reg.getFrameworkProvider().available).toBe(true);
  });
});

describe('createFakeRegistry', () => {
  it('returns a registry backed by the provided providers', () => {
    const fw = createFakeProvider([{ a: 1 }]);
    const le = createFakeProvider([{ b: 2 }]);
    const reg = createFakeRegistry(fw, le);
    expect(reg.getFrameworkProvider()).toBe(fw);
    expect(reg.getLiveEventProvider()).toBe(le);
  });

  it('reload is a no-op', async () => {
    const reg = createFakeRegistry(createFakeProvider([]));
    await expect(reg.reload({} as any)).resolves.toBeUndefined();
  });
});
