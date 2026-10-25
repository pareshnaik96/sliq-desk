import { createServer as createHttpServer } from 'node:http';
import { createApp } from './app.js';
import { createSlaWorker } from './jobs/sla.worker.js';
import { attachRealtime } from './realtime/socket.js';

/** Wire HTTP + Socket.IO + SLA worker. The database must already be connected. */
export function createServer({ config, logger, startWorker = true }) {
  const httpServer = createHttpServer(createApp({ config, logger }));
  const realtime = attachRealtime(httpServer, { config, logger });
  const worker = createSlaWorker({ pollSeconds: config.slaPollSeconds, logger });
  if (startWorker) worker.start();

  return {
    httpServer,
    io: realtime.io,
    worker,
    listen: (port) => new Promise((resolve) => httpServer.listen(port, () => resolve(httpServer))),
    close: async () => {
      worker.stop();
      await realtime.close(); // also closes the HTTP server
    },
  };
}
