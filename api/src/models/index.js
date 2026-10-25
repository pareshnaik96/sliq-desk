import { Comment } from './comment.model.js';
import { Counter } from './counter.model.js';
import { Organization } from './organization.model.js';
import { Ticket } from './ticket.model.js';
import { User } from './user.model.js';

export { Comment, Counter, Organization, Ticket, User };
export const allModels = [Organization, User, Ticket, Comment, Counter];
