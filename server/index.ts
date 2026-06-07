import { createApp } from './api';
import { createGameSession } from './session';
import { createMemoryStore } from './store/memoryStore';
import { config } from './config';

const app = createApp(createGameSession(createMemoryStore()));
app.listen(config.port, () => {
  console.log(`ShufferC server listening on http://localhost:${config.port}`);
});
