import { Organization } from '../models/index.js';
import { assertTenant } from './context.js';

export const organizationsRepo = {
  /** The tenant's own organization; the id comes from the context only. */
  get(ctx) {
    assertTenant(ctx);
    return Organization.findById(ctx.orgId).lean();
  },

  /** Touch the org document inside a transaction to serialize membership changes. */
  bumpMembershipVersion(ctx, session) {
    assertTenant(ctx);
    return Organization.updateOne(
      { _id: ctx.orgId },
      { $inc: { membershipVersion: 1 } },
      { session },
    );
  },
};
