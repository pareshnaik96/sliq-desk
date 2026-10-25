const id = (v) => (v == null ? null : String(v));

export const serializeUser = (u) => ({
  id: id(u._id),
  email: u.email,
  name: u.name,
  role: u.role,
  status: u.status,
  createdAt: u.createdAt,
});

export const serializeOrg = (o) => ({
  id: id(o._id),
  name: o.name,
  slaMinutes: o.slaMinutes,
  createdAt: o.createdAt,
});

export const serializeTicket = (t) => ({
  id: id(t._id),
  number: t.number,
  title: t.title,
  description: t.description,
  status: t.status,
  priority: t.priority,
  assigneeId: id(t.assigneeId),
  createdBy: id(t.createdBy),
  firstStaffResponseAt: t.firstStaffResponseAt ?? null,
  slaDueAt: t.slaDueAt ?? null,
  overdue: t.overdue,
  overdueAt: t.overdueAt ?? null,
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
});

export const serializeComment = (c) => ({
  id: id(c._id),
  ticketId: id(c.ticketId),
  authorId: id(c.authorId),
  authorRole: c.authorRole,
  body: c.body,
  createdAt: c.createdAt,
});
