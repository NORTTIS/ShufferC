import { createApp } from './api';
import { createGameSession } from './session';
import { createMemoryStore } from './store/memoryStore';
import { createMemoryRouteStore } from './store/memoryRouteStore';
import { createFakeProvider } from './ai/provider';
import { createGeminiProvider } from './ai/gemini';
import { createAuth } from './auth';
import { BACKGROUNDS } from '../shared/backgrounds';
import { SKILL_DB, ITEM_DB, ENEMY_DB, SAMPLE_BUNDLE } from '../shared/fixtures';
import { config } from './config';

// One RouteStore instance is shared between the player session (reads routes) and
// the admin endpoints (write routes), so a freshly generated+published route is
// immediately playable.
const routes = createMemoryRouteStore([SAMPLE_BUNDLE]);

const provider = config.gemini.apiKey
  ? createGeminiProvider(config.gemini)
  : createFakeProvider([]); // no key → AI generation endpoints report 503

const session = createGameSession(createMemoryStore(), {
  backgrounds: BACKGROUNDS, itemDb: ITEM_DB, skillDb: SKILL_DB, enemyDb: ENEMY_DB, routes,
});

const app = createApp(session, {
  provider,
  routes,
  registries: { itemDb: ITEM_DB, skillDb: SKILL_DB, enemyDb: ENEMY_DB },
  auth: createAuth(config.admin),
});

app.listen(config.port, () => {
  console.log(`ShufferC server listening on http://localhost:${config.port}`);
  console.log(`Admin console: http://localhost:${config.port}/admin`);
  console.log(`AI provider available: ${provider.available}`);
});
