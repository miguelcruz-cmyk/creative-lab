/**
 * Vite plugin that serves the Meta creative-analysis API from the dev server,
 * so `npm run dev` runs the whole tool in one process and the access token
 * stays server-side. In production the same logic is served by the Vercel
 * Function in `api/meta/creatives.ts`; both share `service.ts`.
 */
import type { Plugin, ViteDevServer } from 'vite';
import type { ServerResponse } from 'node:http';
import { getCreatives, parseQuery } from './service.js';
import { platformStatuses } from '../platforms/registry.js';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export function metaCreativeApi(): Plugin {
  return {
    name: 'meta-creative-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api/meta/creatives', (req, res) => {
        const url = new URL(req.url ?? '', 'http://localhost');
        void getCreatives(parseQuery(url.searchParams)).then((result) =>
          sendJson(res, result.status, result.body),
        );
      });

      server.middlewares.use('/api/platforms', (_req, res) => {
        sendJson(res, 200, { platforms: platformStatuses() });
      });
    },
  };
}
