import type { FastifyInstance } from 'fastify';
import type { Team } from '@sprintos/types';
import { readConfig, writeConfig } from '../lib/storage.js';

export async function teamRoutes(app: FastifyInstance) {
  app.get('/api/teams', async () => {
    const config = await readConfig();
    return config.teams;
  });

  app.post<{ Body: Team }>('/api/teams', async (req, reply) => {
    const config = await readConfig();
    if (config.teams.some((t) => t.name === req.body.name)) {
      return reply.code(409).send({ error: `Team "${req.body.name}" already exists` });
    }
    config.teams.push(req.body);
    await writeConfig(config);
    return req.body;
  });

  app.put<{ Params: { name: string }; Body: Team }>('/api/teams/:name', async (req, reply) => {
    const config = await readConfig();
    const idx = config.teams.findIndex((t) => t.name === req.params.name);
    if (idx === -1) return reply.code(404).send({ error: 'Team not found' });
    config.teams[idx] = req.body;
    await writeConfig(config);
    return req.body;
  });

  app.delete<{ Params: { name: string } }>('/api/teams/:name', async (req) => {
    const config = await readConfig();
    config.teams = config.teams.filter((t) => t.name !== req.params.name);
    await writeConfig(config);
    return { ok: true };
  });
}
