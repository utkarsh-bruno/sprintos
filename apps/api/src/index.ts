import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import staticPlugin from '@fastify/static';
import { configRoutes } from './routes/config.js';
import { jiraRoutes } from './routes/jira.js';
import { syncRoutes } from './routes/sync.js';
import { ticketsRoutes } from './routes/tickets.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(configRoutes);
await app.register(jiraRoutes);
await app.register(syncRoutes);
await app.register(ticketsRoutes);

app.get('/api/health', async () => ({ ok: true }));

// Single-container mode: serve the built web app alongside the API.
if (process.env.NODE_ENV === 'production') {
  const webDist = path.resolve(dirname, '../../web/dist');
  await app.register(staticPlugin, { root: webDist });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api')) return reply.code(404).send({ error: 'Not found' });
    return reply.sendFile('index.html');
  });
}

const port = Number(process.env.PORT ?? 4100);
app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
