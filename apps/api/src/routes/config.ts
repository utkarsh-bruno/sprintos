import type { FastifyInstance } from 'fastify';
import type { JiraConfig } from '@sprintos/types';
import { readConfig, writeConfig } from '../lib/storage.js';

export async function configRoutes(app: FastifyInstance) {
  app.get('/api/config', async () => {
    const config = await readConfig();
    return { ...config, jira: { ...config.jira, token: config.jira.token ? '••••••' : '' } };
  });

  app.put<{ Body: JiraConfig }>('/api/config', async (req) => {
    const config = await readConfig();
    // The read endpoint masks the token. A settings client can round-trip that
    // value without accidentally replacing the configured credential.
    config.jira = {
      ...req.body,
      token: req.body.token === '••••••' ? config.jira.token : req.body.token
    };
    await writeConfig(config);
    return { ok: true };
  });
}
