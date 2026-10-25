import { Ticket } from '../models/index.js';

/**
 * System-level (cross-tenant) access for the SLA worker. Each claimed ticket
 * carries its own orgId, which the worker uses to target that org's room.
 */
export const slaRepo = {
  /**
   * Atomically claim the next ticket whose SLA deadline has passed without a
   * staff response. The overdue=false -> true flip happens in the same
   * operation as the match, so concurrent workers can never claim (and alert)
   * the same ticket twice.
   */
  claimNextOverdue(now = new Date()) {
    return Ticket.findOneAndUpdate(
      {
        slaDueAt: { $lte: now },
        overdue: false,
        firstStaffResponseAt: null,
        status: { $in: ['open', 'in_progress'] },
      },
      { $set: { overdue: true, overdueAt: now } },
      { sort: { slaDueAt: 1 }, new: true },
    ).lean();
  },
};
