import mongoose from 'mongoose';
import { ROLES, USER_STATUSES } from '../domain/constants.js';

const userSchema = new mongoose.Schema(
  {
    orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLES, required: true },
    status: { type: String, enum: USER_STATUSES, default: 'active', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ orgId: 1, role: 1 });

export const User = mongoose.model('User', userSchema);
