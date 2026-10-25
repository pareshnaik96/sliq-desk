import mongoose from 'mongoose';

const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slaMinutes: { type: Number, required: true, min: 1 },
    // Bumped inside every membership transaction so concurrent admin
    // demotions/removals write-conflict instead of both passing the
    // "at least one admin remains" check (prevents write skew).
    membershipVersion: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

export const Organization = mongoose.model('Organization', organizationSchema);
