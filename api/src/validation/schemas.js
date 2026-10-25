import { z } from 'zod';
import { ROLES, TICKET_PRIORITIES, TICKET_STATUSES } from '../domain/constants.js';

// Every schema is .strict(): unknown keys (including orgId) and operator
// objects such as {"$ne": null} are rejected before reaching any query.

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid id');
export const empty = z.object({}).strict();

const email = z
  .email()
  .max(254)
  .transform((e) => e.toLowerCase());
const password = z.string().min(8, 'Password must be at least 8 characters').max(128);
const name = z.string().trim().min(1).max(100);

export const idParams = z.object({ id: objectId }).strict();

export const signupBody = z
  .object({ orgName: z.string().trim().min(1).max(100), name, email, password })
  .strict();

export const loginBody = z.object({ email, password: z.string().min(1).max(128) }).strict();

export const memberCreateBody = z.object({ email, name, role: z.enum(ROLES) }).strict();
export const memberRoleBody = z.object({ role: z.enum(ROLES) }).strict();

const title = z.string().trim().min(1).max(200);
const description = z.string().max(10_000);

export const ticketCreateBody = z
  .object({
    title,
    description: description.optional().default(''),
    priority: z.enum(TICKET_PRIORITIES).optional().default('medium'),
    assigneeId: objectId.nullable().optional(),
  })
  .strict();

export const ticketPatchBody = z
  .object({
    title: title.optional(),
    description: description.optional(),
    status: z.enum(TICKET_STATUSES).optional(),
    priority: z.enum(TICKET_PRIORITIES).optional(),
    assigneeId: objectId.nullable().optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: 'At least one field is required' });

export const ticketListQuery = z
  .object({
    status: z.enum(TICKET_STATUSES).optional(),
    priority: z.enum(TICKET_PRIORITIES).optional(),
    assignee: z.union([z.literal('me'), z.literal('unassigned'), objectId]).optional(),
    cursor: z.string().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  })
  .strict();

export const commentCreateBody = z.object({ body: z.string().trim().min(1).max(10_000) }).strict();
