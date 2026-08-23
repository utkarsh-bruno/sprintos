import type { FastifyInstance } from 'fastify';
import type { AppConfig, OwnerParty, Ticket, TicketFlag } from '@sprintos/types';
import type { PlanningMode } from '@sprintos/types';
import { buildTicketFlags, whatIfImpact } from '@sprintos/shared';
import { readAppConfig } from '../lib/config.js';
import { ticketMatchesJiraFilters } from '../integrations/jira.js';
import {
  getChangeEventsForSyncRun,
  getLatestSprint,
  getLatestSuccessfulSyncRun,
  loadPlanningOverrides,
  loadTicket,
  loadTicketsForSprint,
  upsertPlanningOverride,
} from '../persistence/tickets.js';
import { clearBriefCache, getSyncStatus } from '../services/sync.js';

export type TicketFilter =
  | 'all'
  | 'needs-attention'
  | 'my-queue'
  | 'product'
  | 'dev'
  | 'lead'
  | 'qa'
  | 'blocked'
  | 'new';

const VALID_PLANNING_MODES = new Set<PlanningMode>([
  'planned',
  'not-touching',
  'defer',
  'watch',
  'force-include',
]);

const VALID_FILTERS = new Set<TicketFilter>([
  'all',
  'needs-attention',
  'my-queue',
  'product',
  'dev',
  'lead',
  'qa',
  'blocked',
  'new',
]);

const FILTER_OWNER_MAP: Record<'product' | 'dev' | 'lead' | 'qa', OwnerParty> = {
  product: 'product',
  dev: 'developer',
  lead: 'lead',
  qa: 'qa',
};

const SEVERITY_ORDER: Record<TicketFlag['severity'], number> = {
  urgent: 0,
  warning: 1,
  watch: 2,
  info: 3,
};

function parseFilter(raw: string | undefined): TicketFilter {
  if (raw && VALID_FILTERS.has(raw as TicketFilter)) {
    return raw as TicketFilter;
  }
  return 'all';
}

function enrichTicket(ticket: Ticket, config: AppConfig, sprintDay: number): Ticket {
  return {
    ...ticket,
    flags: buildTicketFlags(ticket, config, sprintDay),
  };
}

function getNewTicketKeys(sprintDay: number, tickets: Ticket[]): Set<string> {
  const keys = new Set<string>();

  const syncRun = getLatestSuccessfulSyncRun();
  if (syncRun) {
    for (const event of getChangeEventsForSyncRun(syncRun)) {
      if (event.type === 'ticket_added_to_sprint') {
        keys.add(event.ticketKey);
      }
    }
  }

  for (const ticket of tickets) {
    if (ticket.sprintDayCreated != null && ticket.sprintDayCreated >= sprintDay - 1) {
      keys.add(ticket.key);
    }
  }

  return keys;
}

function isNeedsAttention(ticket: Ticket): boolean {
  return ticket.flags.some((flag) => flag.severity === 'warning' || flag.severity === 'urgent');
}

function isMyQueue(ticket: Ticket, config: AppConfig): boolean {
  const leadId = config.people.lead.jiraAccountId;
  if (ticket.operationalOwner === 'lead') return true;
  if (leadId && ticket.assignee?.accountId === leadId) return true;
  return false;
}

function applyFilter(
  tickets: Ticket[],
  filter: TicketFilter,
  config: AppConfig,
  sprintDay: number,
  newTicketKeys: Set<string>,
): Ticket[] {
  switch (filter) {
    case 'all':
      return tickets;
    case 'needs-attention':
      return tickets.filter(isNeedsAttention);
    case 'my-queue':
      return tickets.filter((ticket) => isMyQueue(ticket, config));
    case 'product':
    case 'dev':
    case 'lead':
    case 'qa':
      return tickets.filter((ticket) => ticket.operationalOwner === FILTER_OWNER_MAP[filter]);
    case 'blocked':
      return tickets.filter((ticket) => ticket.dependency?.blocked === true);
    case 'new':
      return tickets.filter((ticket) => newTicketKeys.has(ticket.key));
    default:
      return tickets;
  }
}

export function topFlag(flags: TicketFlag[]): TicketFlag | undefined {
  if (flags.length === 0) return undefined;
  return [...flags].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  )[0];
}

async function loadEnrichedTickets(): Promise<{
  tickets: Ticket[];
  config: AppConfig;
  sprintDay: number;
  jiraUrl: string;
} | null> {
  const sprint = getLatestSprint();
  if (!sprint) return null;

  const config = await readAppConfig();
  const syncStatus = getSyncStatus();
  const sprintDay = syncStatus.sprintDay ?? 1;
  const tickets = loadTicketsForSprint(sprint.id)
    .filter((ticket) => ticketMatchesJiraFilters(ticket, config.jira))
    .map((ticket) => enrichTicket(ticket, config, sprintDay));

  return {
    tickets,
    config,
    sprintDay,
    jiraUrl: config.jira.url.replace(/\/$/, ''),
  };
}

export async function ticketsRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { filter?: string } }>('/api/tickets', async (req, reply) => {
    const loaded = await loadEnrichedTickets();
    if (!loaded) {
      return reply.code(404).send({ error: 'No sprint data — run POST /api/sync first' });
    }

    const filter = parseFilter(req.query.filter);
    const newTicketKeys = getNewTicketKeys(loaded.sprintDay, loaded.tickets);
    const tickets = applyFilter(
      loaded.tickets,
      filter,
      loaded.config,
      loaded.sprintDay,
      newTicketKeys,
    );

    const planningOverrides = loadPlanningOverrides();
    const planningByKey = Object.fromEntries(planningOverrides);

    return {
      filter,
      jiraUrl: loaded.jiraUrl,
      tickets,
      planningOverrides: planningByKey,
    };
  });

  app.patch<{ Params: { key: string }; Body: { mode?: string; note?: string } }>(
    '/api/tickets/:key/planning',
    async (req, reply) => {
      const raw = loadTicket(req.params.key);
      if (!raw) {
        return reply.code(404).send({ error: `Ticket ${req.params.key} not found` });
      }

      const mode = req.body?.mode as PlanningMode | undefined;
      if (!mode || !VALID_PLANNING_MODES.has(mode)) {
        return reply.code(400).send({ error: 'Invalid planning mode' });
      }

      const override = {
        ticketKey: req.params.key,
        mode,
        ...(req.body.note ? { note: req.body.note } : {}),
        updatedAt: new Date().toISOString(),
      };

      upsertPlanningOverride(override);
      clearBriefCache();

      return { ok: true, override };
    },
  );

  app.get<{ Params: { key: string } }>('/api/tickets/:key/what-if', async (req, reply) => {
    const loaded = await loadEnrichedTickets();
    if (!loaded) {
      return reply.code(404).send({ error: 'No sprint data — run POST /api/sync first' });
    }

    const raw = loadTicket(req.params.key);
    if (!raw) {
      return reply.code(404).send({ error: `Ticket ${req.params.key} not found` });
    }

    const syncStatus = getSyncStatus();
    const ticket = enrichTicket(raw, loaded.config, loaded.sprintDay);
    const planningOverrides = loadPlanningOverrides();
    const impact = whatIfImpact(
      ticket,
      loaded.tickets,
      loaded.config,
      loaded.sprintDay,
      syncStatus.workingDaysUntilFreeze ?? 0,
      planningOverrides,
    );

    return impact;
  });

  app.get<{ Params: { key: string } }>('/api/tickets/:key', async (req, reply) => {
    const loaded = await loadEnrichedTickets();
    if (!loaded) {
      return reply.code(404).send({ error: 'No sprint data — run POST /api/sync first' });
    }

    const raw = loadTicket(req.params.key);
    if (!raw) {
      return reply.code(404).send({ error: `Ticket ${req.params.key} not found` });
    }

    const ticket = enrichTicket(raw, loaded.config, loaded.sprintDay);
    return {
      jiraUrl: loaded.jiraUrl,
      ticket,
    };
  });
}
