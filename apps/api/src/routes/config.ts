import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '@sprintos/types';
import { mergeAppConfig, readAppConfig, redactConfig, writeAppConfig } from '../lib/config.js';

export async function configRoutes(app: FastifyInstance) {
  app.get('/api/config', async () => {
    return redactConfig(await readAppConfig());
  });

  app.put<{ Body: Partial<AppConfig> }>('/api/config', async (req) => {
    const merged = await mergeAppConfig(req.body);
    await writeAppConfig(merged);
    return { ok: true };
  });
}
