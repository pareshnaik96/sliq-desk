import { Router } from 'express';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import * as members from '../services/members.service.js';
import { idParams, memberCreateBody, memberRoleBody } from '../validation/schemas.js';

export function membersRoutes() {
  const router = Router();

  router.get('/', validate(), async (req, res) => {
    res.json({ items: await members.list(req.ctx) });
  });

  router.post('/', requireRole('admin'), validate({ body: memberCreateBody }), async (req, res) => {
    res.status(201).json(await members.create(req.ctx, req.valid.body));
  });

  router.patch(
    '/:id',
    requireRole('admin'),
    validate({ params: idParams, body: memberRoleBody }),
    async (req, res) => {
      res.json(await members.changeRole(req.ctx, req.valid.params.id, req.valid.body.role));
    },
  );

  router.delete('/:id', requireRole('admin'), validate({ params: idParams }), async (req, res) => {
    await members.remove(req.ctx, req.valid.params.id);
    res.status(204).end();
  });

  return router;
}
