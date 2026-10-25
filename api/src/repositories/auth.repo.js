import mongoose from 'mongoose';
import { Organization, User } from '../models/index.js';
import { withTransaction } from './tx.js';

/**
 * Unscoped, pre-authentication lookups. These are the only user queries that
 * do not take a TenantContext, because they are what establishes one.
 */
export const authRepo = {
  findUserByEmail(email) {
    return User.findOne({ email: String(email).toLowerCase() }).lean();
  },

  findActiveUserById(id) {
    if (!mongoose.isValidObjectId(id)) return null;
    return User.findOne({ _id: id, status: 'active' }).select('-passwordHash').lean();
  },

  async emailExists(email) {
    return (await User.exists({ email: String(email).toLowerCase() })) !== null;
  },

  /** Create an organization and its first (admin) user atomically. */
  createOrganizationWithAdmin({ orgName, slaMinutes, email, name, passwordHash }) {
    return withTransaction(async (session) => {
      const [org] = await Organization.create([{ name: orgName, slaMinutes }], { session });
      const [user] = await User.create(
        [{ orgId: org._id, email, name, passwordHash, role: 'admin', status: 'active' }],
        { session },
      );
      return { org: org.toObject(), user: user.toObject() };
    });
  },
};
