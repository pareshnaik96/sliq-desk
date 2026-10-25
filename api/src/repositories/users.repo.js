import { STAFF_ROLES } from '../domain/constants.js';
import { User } from '../models/index.js';
import { scope, stamp } from './context.js';

const PUBLIC = '-passwordHash';

export const usersRepo = {
  listActive(ctx) {
    return User.find(scope(ctx, { status: 'active' }))
      .select(PUBLIC)
      .sort({ name: 1, _id: 1 })
      .lean();
  },

  findActiveById(ctx, id, { session } = {}) {
    return User.findOne(scope(ctx, { _id: id, status: 'active' }))
      .select(PUBLIC)
      .session(session ?? null)
      .lean();
  },

  /** An active admin or agent of this org, i.e. someone a ticket may be assigned to. */
  findAssignable(ctx, id) {
    return User.findOne(scope(ctx, { _id: id, status: 'active', role: { $in: STAFF_ROLES } }))
      .select(PUBLIC)
      .lean();
  },

  async create(ctx, { email, name, role, passwordHash }) {
    const user = await User.create(
      stamp(ctx, { email, name, role, passwordHash, status: 'active' }),
    );
    const { passwordHash: _hash, ...rest } = user.toObject();
    return rest;
  },

  countActiveAdmins(ctx, { session } = {}) {
    return User.countDocuments(scope(ctx, { role: 'admin', status: 'active' })).session(
      session ?? null,
    );
  },

  updateRole(ctx, id, role, { session } = {}) {
    return User.findOneAndUpdate(
      scope(ctx, { _id: id, status: 'active' }),
      { $set: { role } },
      { new: true, session, projection: PUBLIC },
    ).lean();
  },

  markRemoved(ctx, id, { session } = {}) {
    return User.findOneAndUpdate(
      scope(ctx, { _id: id, status: 'active' }),
      { $set: { status: 'removed' } },
      { new: true, session, projection: PUBLIC },
    ).lean();
  },
};
