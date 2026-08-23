import type { FastifyInstance } from 'fastify';
import { getLatestBrief, getSyncStatus, runSync } from '../services/sync.js';

export async function syncRoutes(app: FastifyInstance) {
  app.post('/api/sync', async () => {
    return runSync();
  });

  app.get('/api/status', async () => {
    return getSyncStatus();
  });

  app.get('/api/brief', async (_req, reply) => {
    const brief = await getLatestBrief();
    if (!brief) {
      return reply.code(404).send({ error: 'No brief available — run POST /api/sync first' });
    }
    return brief;
  });
}
