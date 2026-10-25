import { bus, EVENTS } from '../events/bus.js';
import { slaRepo } from '../repositories/index.js';

/**
 * Polls for tickets whose SLA deadline has passed and flags them overdue.
 * The deadline lives in MongoDB, so it survives restarts, and claiming is a
 * single atomic findOneAndUpdate, so running several API instances is safe.
 */
export function createSlaWorker({ pollSeconds, logger }) {
  let timer = null;
  let running = false;

  async function tick(now = new Date()) {
    if (running) return 0; // never overlap ticks within one process
    running = true;
    let claimed = 0;
    try {
      for (;;) {
        const ticket = await slaRepo.claimNextOverdue(now);
        if (!ticket) break;
        claimed++;
        bus.publish(ticket.orgId, EVENTS.TICKET_OVERDUE, {
          ticketId: String(ticket._id),
          number: ticket.number,
          priority: ticket.priority,
          slaDueAt: ticket.slaDueAt,
          overdueAt: ticket.overdueAt,
        });
      }
      if (claimed) logger?.info({ claimed }, 'SLA worker flagged overdue tickets');
    } catch (err) {
      logger?.error({ err }, 'SLA worker tick failed');
    } finally {
      running = false;
    }
    return claimed;
  }

  return {
    tick,
    start() {
      if (timer) return;
      timer = setInterval(() => void tick(), pollSeconds * 1000);
      timer.unref();
      void tick();
    },
    stop() {
      clearInterval(timer);
      timer = null;
    },
  };
}
