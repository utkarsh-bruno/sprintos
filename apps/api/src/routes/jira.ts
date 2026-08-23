import type { FastifyInstance } from 'fastify';
import { readConfig } from '../lib/storage.js';
import { listSprints, listTeams, listUsers } from '../lib/jira.js';

export async function jiraRoutes(app: FastifyInstance) {
  app.get('/api/jira/sprints', async () => {
    const config = await readConfig();
    return listSprints(config.jira);
  });

  app.get('/api/jira/teams', async () => {
    const config = await readConfig();
    return listTeams(config.jira);
  });

  app.get<{ Querystring: { query?: string } }>('/api/jira/users', async (req) => {
    const config = await readConfig();
    return listUsers(config.jira, req.query.query ?? '');
  });
}
