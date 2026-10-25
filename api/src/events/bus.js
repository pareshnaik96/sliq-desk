import { EventEmitter } from 'node:events';

export const EVENTS = Object.freeze({
  TICKET_CREATED: 'ticket.created',
  TICKET_UPDATED: 'ticket.updated',
  TICKET_OVERDUE: 'ticket.overdue',
  COMMENT_CREATED: 'comment.created',
  MEMBER_CHANGED: 'member.changed',
});

const emitter = new EventEmitter();
emitter.setMaxListeners(50);

/**
 * In-process event bus. Services publish only AFTER their database write has
 * succeeded; the realtime layer subscribes and fans out to org rooms.
 */
export const bus = {
  publish(orgId, type, payload) {
    emitter.emit('org-event', { orgId: String(orgId), type, payload });
  },
  /** Ask the realtime layer to drop every socket of a user (removal / role change). */
  disconnectUser(userId) {
    emitter.emit('disconnect-user', String(userId));
  },
  onOrgEvent(listener) {
    emitter.on('org-event', listener);
    return () => emitter.off('org-event', listener);
  },
  onDisconnectUser(listener) {
    emitter.on('disconnect-user', listener);
    return () => emitter.off('disconnect-user', listener);
  },
};
