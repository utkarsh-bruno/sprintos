import type { FastifyInstance } from 'fastify';
import { readConfig, writeConfig } from '../lib/storage.js';

export async function configRoutes(app: FastifyInstance) {
  app.get('/api/config', async () => {
    const config = await readConfig();
    return { ...config, jira: { ...config.jira, token: config.jira.token ? '••••••' : '' } };
  });

  app.put<{ Body: { url: string; token: string; teamField: string } }>('/api/config', async (req) => {
    const config = await readConfig();
    config.jira = req.body;
    await writeConfig(config);
    return { ok: true };
  });
}
