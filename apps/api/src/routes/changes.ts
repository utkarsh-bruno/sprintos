import type { FastifyInstance } from 'fastify';
import { filterChangeEventsForScope } from '@sprintos/shared';
import { readAppConfig } from '../lib/config.js';
import { ticketMatchesJiraFilters } from '../integrations/jira.js';
import {
  getLatestSprint,
  loadAllChangeEvents,
  loadPreviousSnapshotTickets,
  loadTicketsForSprint,
} from '../persistence/tickets.js';

export async function changesRoutes(app: FastifyInstance) {
  app.get('/api/changes', async () => {
    const config = await readAppConfig();
    const sprint = getLatestSprint();
    if (!sprint) {
      return { events: [] };
    }

    const tickets = loadTicketsForSprint(sprint.id).filter((t) =>
      ticketMatchesJiraFilters(t, config.jira),
    );
    const previousScoped = loadPreviousSnapshotTickets(sprint.id).filter((t) =>
      ticketMatchesJiraFilters(t, config.jira),
    );
    const events = filterChangeEventsForScope(loadAllChangeEvents(), tickets, previousScoped);

    return { events };
  });
}
