import mongoose from 'mongoose';
import { TICKET_PRIORITIES, TICKET_STATUSES } from '../domain/constants.js';

const { ObjectId } = mongoose.Schema.Types;

const ticketSchema = new mongoose.Schema(
  {
    orgId: { type: ObjectId, ref: 'Organization', required: true },
    number: { type: Number, required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    status: { type: String, enum: TICKET_STATUSES, default: 'open', required: true },
    priority: { type: String, enum: TICKET_PRIORITIES, default: 'medium', required: true },
    assigneeId: { type: ObjectId, ref: 'User', default: null },
    createdBy: { type: ObjectId, ref: 'User', required: true },
    firstStaffResponseAt: { type: Date, default: null },
    slaDueAt: { type: Date, default: null },
    overdue: { type: Boolean, default: false },
    overdueAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

ticketSchema.index({ orgId: 1, status: 1, priority: 1, assigneeId: 1, createdAt: -1 });
ticketSchema.index({ orgId: 1, number: 1 }, { unique: true });
// Supports the unfiltered keyset-paginated list (createdAt desc, _id desc).
ticketSchema.index({ orgId: 1, createdAt: -1, _id: -1 });
// Only tickets still waiting for a first staff response are candidates for the SLA worker.
ticketSchema.index(
  { slaDueAt: 1 },
  { partialFilterExpression: { overdue: false, firstStaffResponseAt: null } },
);

export const Ticket = mongoose.model('Ticket', ticketSchema);
