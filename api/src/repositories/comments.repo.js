import { Comment } from '../models/index.js';
import { scope, stamp } from './context.js';

export const commentsRepo = {
  listForTicket(ctx, ticketId) {
    return Comment.find(scope(ctx, { ticketId })).sort({ createdAt: 1, _id: 1 }).lean();
  },

  async create(ctx, { ticketId, authorId, authorRole, body }, { session } = {}) {
    const [comment] = await Comment.create([stamp(ctx, { ticketId, authorId, authorRole, body })], {
      session,
    });
    return comment.toObject();
  },
};
