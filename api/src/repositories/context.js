import mongoose from 'mongoose';

/**
 * A TenantContext is { orgId, userId, role }, built only from the
 * authenticated user's database record (never from client input).
 */
export function assertTenant(ctx) {
  if (!ctx || !ctx.orgId || !mongoose.isValidObjectId(ctx.orgId)) {
    throw new Error('A TenantContext with a valid orgId is required');
  }
}

/** Add the tenant's orgId to a filter. orgId is applied last so it can never be overridden. */
export function scope(ctx, filter = {}) {
  assertTenant(ctx);
  return { ...filter, orgId: ctx.orgId };
}

/** Stamp the tenant's orgId onto a document being inserted. */
export function stamp(ctx, doc) {
  assertTenant(ctx);
  return { ...doc, orgId: ctx.orgId };
}

export const toObjectId = (id) => (id == null ? null : new mongoose.Types.ObjectId(String(id)));
