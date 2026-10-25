import mongoose from 'mongoose';
import { ROLES } from '../domain/constants.js';

const { ObjectId } = mongoose.Schema.Types;

const commentSchema = new mongoose.Schema(
  {
    orgId: { type: ObjectId, ref: 'Organization', required: true },
    ticketId: { type: ObjectId, ref: 'Ticket', required: true },
    authorId: { type: ObjectId, ref: 'User', required: true },
    authorRole: { type: String, enum: ROLES, required: true },
    body: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

commentSchema.index({ orgId: 1, ticketId: 1, createdAt: 1 });

export const Comment = mongoose.model('Comment', commentSchema);
