import type { FastifyInstance } from 'fastify';
import { loadAllChangeEvents } from '../persistence/tickets.js';

export async function changesRoutes(app: FastifyInstance) {
  app.get('/api/changes', async () => {
    const events = loadAllChangeEvents();
    return { events };
  });
}
