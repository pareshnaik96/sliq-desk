import { Counter, Ticket } from '../models/index.js';
import { scope, stamp, toObjectId } from './context.js';

export const ticketsRepo = {
  /** Per-org sequential number via atomic $inc (gaps possible if an insert later fails). */
  async nextNumber(ctx) {
    const counter = await Counter.findOneAndUpdate(
      { _id: `ticket:${scope(ctx).orgId}` },
      { $inc: { seq: 1 } },
      { upsert: true, new: true },
    ).lean();
    return counter.seq;
  },

  async create(ctx, data) {
    const ticket = await Ticket.create(stamp(ctx, data));
    return ticket.toObject();
  },

  findById(ctx, id) {
    return Ticket.findOne(scope(ctx, { _id: id })).lean();
  },

  /** Keyset pagination on (createdAt desc, _id desc). Fetches limit+1 to detect a next page. */
  list(ctx, { status, priority, assigneeId, cursor, limit }) {
    const filter = {};
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (assigneeId !== undefined) filter.assigneeId = toObjectId(assigneeId);
    if (cursor) {
      const id = toObjectId(cursor.id);
      filter.$or = [
        { createdAt: { $lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, _id: { $lt: id } },
      ];
    }
    return Ticket.find(scope(ctx, filter))
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean();
  },

  /**
   * Optimistic, atomic update: only applies if status and assignee are still
   * what the caller saw (both drive workflow and permission decisions).
   * Returns null when the ticket changed underneath us.
   */
  updateIfUnchanged(ctx, id, expected, set) {
    return Ticket.findOneAndUpdate(
      scope(ctx, { _id: id, status: expected.status, assigneeId: expected.assigneeId ?? null }),
      { $set: set },
      { new: true },
    ).lean();
  },

  /** Sets firstStaffResponseAt only if still null. Returns the updated ticket or null. */
  markFirstStaffResponse(ctx, id, at, { session } = {}) {
    return Ticket.findOneAndUpdate(
      scope(ctx, { _id: id, firstStaffResponseAt: null }),
      { $set: { firstStaffResponseAt: at } },
      { new: true, session },
    ).lean();
  },

  /** Unassign a departing/demoted member from every non-closed ticket. */
  async unassignAllFrom(ctx, userId, { session } = {}) {
    const res = await Ticket.updateMany(
      scope(ctx, { assigneeId: toObjectId(userId), status: { $ne: 'closed' } }),
      { $set: { assigneeId: null } },
      { session },
    );
    return res.modifiedCount;
  },
};
