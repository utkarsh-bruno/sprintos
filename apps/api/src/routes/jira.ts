import type { FastifyInstance } from 'fastify';
import { readAppConfig } from '../lib/config.js';
import { listSprints, listTeams, listUsers } from '../lib/jira.js';

export async function jiraRoutes(app: FastifyInstance) {
  app.get('/api/jira/sprints', async () => {
    const config = await readAppConfig();
    return listSprints(config.jira);
  });

  app.get('/api/jira/teams', async () => {
    const config = await readAppConfig();
    return listTeams(config.jira);
  });

  app.get<{ Querystring: { query?: string } }>('/api/jira/users', async (req) => {
    const config = await readAppConfig();
    return listUsers(config.jira, req.query.query ?? '');
  });
}
