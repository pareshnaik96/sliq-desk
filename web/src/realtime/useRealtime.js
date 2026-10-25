import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { keys } from '../api/hooks.js';

/**
 * Connects to Socket.IO while signed in and keeps React Query caches fresh.
 * The session cookie authenticates the handshake; the server picks the room.
 * Reconnects whenever the user or their role changes.
 */
export function useRealtime(me, { onOverdue } = {}) {
  const qc = useQueryClient();
  const [status, setStatus] = useState('offline');
  const userId = me?.user.id;
  const role = me?.user.role;

  useEffect(() => {
    if (!userId) return undefined;
    let closed = false;
    const socket = io({ path: '/socket.io', withCredentials: true });

    const patchTicket = (id, changes) =>
      qc.setQueryData(keys.ticket(id), (old) => (old ? { ...old, ...changes } : old));
    const refreshLists = () => qc.invalidateQueries({ queryKey: keys.tickets });

    // Events sent while we were not connected (before the first connect, or
    // during a network drop) are lost, so refetch everything on (re)connect.
    socket.on('connect', () => {
      setStatus('live');
      qc.invalidateQueries();
    });
    socket.on('ticket.created', refreshLists);
    socket.on('ticket.updated', ({ ticketId, changes }) => {
      patchTicket(ticketId, changes);
      refreshLists();
    });
    socket.on('comment.created', ({ ticketId }) => {
      qc.invalidateQueries({ queryKey: keys.comments(ticketId) });
    });
    socket.on('ticket.overdue', (event) => {
      patchTicket(event.ticketId, { overdue: true, overdueAt: event.overdueAt });
      refreshLists();
      onOverdue?.(event);
    });
    socket.on('member.changed', () => {
      qc.invalidateQueries({ queryKey: keys.members });
      qc.invalidateQueries({ queryKey: keys.me });
      refreshLists(); // removed/demoted members are unassigned
    });

    // The server drops our sockets when our membership changes. Re-check the
    // session: a role change re-runs this effect, a removal signs us out.
    socket.on('disconnect', async (reason) => {
      setStatus('offline');
      if (reason !== 'io server disconnect') return; // client auto-reconnects otherwise
      await qc.refetchQueries({ queryKey: keys.me });
      if (!closed) socket.connect();
    });
    socket.on('connect_error', (err) => {
      setStatus('offline');
      if (err.message === 'UNAUTHENTICATED') qc.invalidateQueries({ queryKey: keys.me });
    });

    return () => {
      closed = true;
      socket.close();
      setStatus('offline');
    };
  }, [userId, role, qc, onOverdue]);

  return status;
}
