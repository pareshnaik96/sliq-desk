import { Router } from 'express';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import * as comments from '../services/comments.service.js';
import * as tickets from '../services/tickets.service.js';
import {
  commentCreateBody,
  idParams,
  ticketCreateBody,
  ticketListQuery,
  ticketPatchBody,
} from '../validation/schemas.js';

export function ticketsRoutes() {
  const router = Router();
  const staff = requireRole('admin', 'agent');

  router.get('/', validate({ query: ticketListQuery }), async (req, res) => {
    res.json(await tickets.list(req.ctx, req.valid.query));
  });

  router.post('/', staff, validate({ body: ticketCreateBody }), async (req, res) => {
    res.status(201).json(await tickets.create(req.ctx, req.valid.body));
  });

  router.get('/:id', validate({ params: idParams }), async (req, res) => {
    res.json(await tickets.get(req.ctx, req.valid.params.id));
  });

  router.patch(
    '/:id',
    staff,
    validate({ params: idParams, body: ticketPatchBody }),
    async (req, res) => {
      res.json(await tickets.update(req.ctx, req.valid.params.id, req.valid.body));
    },
  );

  router.get('/:id/comments', validate({ params: idParams }), async (req, res) => {
    res.json({ items: await comments.list(req.ctx, req.valid.params.id) });
  });

  router.post(
    '/:id/comments',
    staff,
    validate({ params: idParams, body: commentCreateBody }),
    async (req, res) => {
      res.status(201).json(await comments.create(req.ctx, req.valid.params.id, req.valid.body));
    },
  );

  return router;
}
