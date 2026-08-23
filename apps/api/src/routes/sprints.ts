import type { FastifyInstance } from 'fastify';
import type { CapacityOverride, SprintData, SprintState, Ticket } from '@sprintos/types';
import { effectiveCapacity, reviewStagesFor, sprintPoints } from '@sprintos/shared';
import { listSprints, readConfig, readSprint, writeSprint } from '../lib/storage.js';
import { fetchSprintIssues } from '../lib/jira.js';

function mergeTickets(existing: Ticket[], imported: Ticket[]): Ticket[] {
  const byId = new Map(existing.map((t) => [t.jiraId, t]));
  return imported.map((fresh) => {
    const local = byId.get(fresh.jiraId);
    return local ? { ...fresh, ...local, summary: fresh.summary, status: fresh.status, storyPoints: fresh.storyPoints, assignee: fresh.assignee } : fresh;
  });
}

function ticketPatch(body: Partial<Ticket>): Partial<Ticket> {
  const { committed, repository, author, reviewers, reviewStage, notes } = body;
  return {
    ...(typeof committed === 'boolean' ? { committed } : {}),
    ...(repository === 'OSS' || repository === 'Enterprise' || repository === 'Shared'
      ? { repository }
      : {}),
    ...(typeof author === 'string' ? { author } : {}),
    ...(Array.isArray(reviewers) && reviewers.every((reviewer) => typeof reviewer === 'string')
      ? { reviewers }
      : {}),
    ...(typeof reviewStage === 'string' ? { reviewStage } : {}),
    ...(typeof notes === 'string' ? { notes } : {})
  };
}

export async function sprintRoutes(app: FastifyInstance) {
  app.get('/api/sprints', async () => listSprints());

  app.get<{ Params: { id: string } }>('/api/sprints/:id', async (req, reply) => {
    const sprint = await readSprint(req.params.id);
    if (!sprint) return reply.code(404).send({ error: 'Sprint not imported yet' });
    return sprint;
  });

  app.post<{ Params: { id: string }; Body: { jiraSprintId: number; name?: string; state?: SprintState } }>(
    '/api/sprints/:id/import',
    async (req) => {
      const config = await readConfig();
      const imported = await fetchSprintIssues(config.jira, req.body.jiraSprintId);
      const existing = await readSprint(req.params.id);
      const sprint: SprintData = {
        sprintId: req.params.id,
        jiraSprintId: req.body.jiraSprintId,
        sprintName: req.body.name ?? existing?.sprintName,
        sprintState: req.body.state ?? existing?.sprintState,
        tickets: mergeTickets(existing?.tickets ?? [], imported),
        capacityOverrides: existing?.capacityOverrides ?? [],
        planningNotes: existing?.planningNotes,
        finalizedAt: existing?.finalizedAt,
        startedAt: existing?.startedAt
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
      const updated = { ...sprint.tickets[idx], ...ticketPatch(req.body) };
      if (updated.reviewStage && updated.repository && !reviewStagesFor(updated.repository).includes(updated.reviewStage)) {
        return reply.code(400).send({ error: 'Review stage does not apply to this repository type' });
      }
      sprint.tickets[idx] = updated;
      await writeSprint(req.params.id, sprint);
      return sprint.tickets[idx];
    }
  );

  app.put<{ Params: { id: string }; Body: CapacityOverride[] }>(
    '/api/sprints/:id/capacity-overrides',
    async (req, reply) => {
      if (!Array.isArray(req.body) || req.body.some((override) =>
        !override || typeof override.memberId !== 'string' ||
        !Number.isFinite(override.effectiveCapacity) ||
        (override.reason !== undefined && typeof override.reason !== 'string')
      )) {
        return reply.code(400).send({ error: 'Invalid capacity overrides' });
      }
      const sprint = await readSprint(req.params.id);
      if (!sprint) return reply.code(404).send({ error: 'Sprint not imported yet' });
      sprint.capacityOverrides = req.body;
      await writeSprint(req.params.id, sprint);
      return sprint.capacityOverrides;
    }
  );

  app.patch<{ Params: { id: string }; Body: { planningNotes?: string } }>(
    '/api/sprints/:id/planning-notes',
    async (req, reply) => {
      if (typeof req.body.planningNotes !== 'string') {
        return reply.code(400).send({ error: 'Planning notes must be text' });
      }
      const sprint = await readSprint(req.params.id);
      if (!sprint) return reply.code(404).send({ error: 'Sprint not imported yet' });
      sprint.planningNotes = req.body.planningNotes;
      await writeSprint(req.params.id, sprint);
      return { planningNotes: sprint.planningNotes };
    }
  );

  app.post<{ Params: { id: string } }>('/api/sprints/:id/finalize', async (req, reply) => {
    const sprint = await readSprint(req.params.id);
    if (!sprint) return reply.code(404).send({ error: 'Sprint not imported yet' });
    const committed = sprint.tickets.filter((ticket) => ticket.committed);
    if (!committed.length) return reply.code(400).send({ error: 'Commit at least one issue before finalising' });
    sprint.finalizedAt = new Date().toISOString();
    for (const ticket of committed) ticket.baselineStatus = ticket.status;
    await writeSprint(req.params.id, sprint);
    return sprint;
  });

  app.post<{ Params: { id: string } }>('/api/sprints/:id/start', async (req, reply) => {
    const sprint = await readSprint(req.params.id);
    if (!sprint) return reply.code(404).send({ error: 'Sprint not imported yet' });
    if (!sprint.finalizedAt) return reply.code(400).send({ error: 'Finalise the plan before starting the sprint' });
    sprint.startedAt = new Date().toISOString();
    await writeSprint(req.params.id, sprint);
    return sprint;
  });

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
