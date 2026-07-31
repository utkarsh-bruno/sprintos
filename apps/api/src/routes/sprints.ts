import type { FastifyInstance } from 'fastify';
import type { SprintData, Ticket } from '@sprintos/types';
import { effectiveCapacity, sprintPoints } from '@sprintos/shared';
import { readConfig, readSprint, writeSprint } from '../lib/storage.js';
import { fetchSprintIssues } from '../lib/jira.js';

function mergeTickets(existing: Ticket[], imported: Ticket[]): Ticket[] {
  const byId = new Map(existing.map((t) => [t.jiraId, t]));
  return imported.map((fresh) => {
    const local = byId.get(fresh.jiraId);
    return local ? { ...fresh, ...local, summary: fresh.summary, status: fresh.status, storyPoints: fresh.storyPoints } : fresh;
  });
}

export async function sprintRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>('/api/sprints/:id', async (req, reply) => {
    const sprint = await readSprint(req.params.id);
    if (!sprint) return reply.code(404).send({ error: 'Sprint not imported yet' });
    return sprint;
  });

  app.post<{ Params: { id: string }; Body: { jiraSprintId: number } }>(
    '/api/sprints/:id/import',
    async (req) => {
      const config = await readConfig();
      const imported = await fetchSprintIssues(config.jira, req.body.jiraSprintId);
      const existing = await readSprint(req.params.id);
      const sprint: SprintData = {
        sprintId: req.params.id,
        jiraSprintId: req.body.jiraSprintId,
        tickets: mergeTickets(existing?.tickets ?? [], imported),
        capacityOverrides: existing?.capacityOverrides ?? [],
        planningNotes: existing?.planningNotes
      };
      await writeSprint(req.params.id, sprint);
      return sprint;
    }
  );

  app.patch<{ Params: { id: string; jiraId: string }; Body: Partial<Ticket> }>(
    '/api/sprints/:id/tickets/:jiraId',
    async (req, reply) => {
      const sprint = await readSprint(req.params.id);
      if (!sprint) return reply.code(404).send({ error: 'Sprint not imported yet' });
      const idx = sprint.tickets.findIndex((t) => t.jiraId === req.params.jiraId);
      if (idx === -1) return reply.code(404).send({ error: 'Ticket not in sprint' });
      sprint.tickets[idx] = { ...sprint.tickets[idx], ...req.body, jiraId: sprint.tickets[idx].jiraId };
      await writeSprint(req.params.id, sprint);
      return sprint.tickets[idx];
    }
  );

  app.get<{ Params: { id: string } }>('/api/sprints/:id/dashboard', async (req, reply) => {
    const [sprint, config] = await Promise.all([readSprint(req.params.id), readConfig()]);
    if (!sprint) return reply.code(404).send({ error: 'Sprint not imported yet' });

    const points = sprintPoints(sprint.tickets);
    const totalCapacity = config.teams.reduce(
      (sum, team) => sum + effectiveCapacity(team.members, sprint.capacityOverrides),
      0
    );

    return {
      ...points,
      totalCapacity,
      remainingCapacity: totalCapacity - points.committed,
      reviewQueue: sprint.tickets.filter((t) => t.committed && (!t.reviewers || t.reviewers.length === 0)),
      // ponytail: "blocked" inferred from status name; add an explicit flag if Jira status naming varies.
      blockedTickets: sprint.tickets.filter((t) => /block/i.test(t.status ?? ''))
    };
  });
}
