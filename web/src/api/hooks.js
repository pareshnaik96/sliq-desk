import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';

export const keys = {
  me: ['me'],
  members: ['members'],
  tickets: ['tickets'],
  ticketList: (filters) => ['tickets', filters],
  ticket: (id) => ['ticket', id],
  comments: (id) => ['comments', id],
};

// --- session ----------------------------------------------------------------

export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: () =>
      api('/auth/me').catch((err) => {
        if (err.status === 401) return null;
        throw err;
      }),
    retry: false,
    staleTime: 60_000,
  });
}

/**
 * Switch the cached session (null = signed out) and drop every other query so
 * no data from the previous user survives. The ['me'] query is updated in
 * place rather than cleared: App's observer stays attached to it.
 */
export function resetSession(qc, me) {
  qc.setQueryData(keys.me, me);
  qc.removeQueries({ predicate: (q) => q.queryKey[0] !== keys.me[0] });
}

function useSessionMutation(fn) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (data) => resetSession(qc, data),
  });
}

export const useLogin = () =>
  useSessionMutation((body) => api('/auth/login', { method: 'POST', body }));
export const useSignup = () =>
  useSessionMutation((body) => api('/auth/signup', { method: 'POST', body }));

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api('/auth/logout', { method: 'POST' }),
    onSettled: () => resetSession(qc, null),
  });
}

// --- members ----------------------------------------------------------------

export const useMembers = () =>
  useQuery({
    queryKey: keys.members,
    queryFn: () => api('/members').then((r) => r.items),
    staleTime: 30_000,
  });

function useMembersMutation(fn) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.members });
      qc.invalidateQueries({ queryKey: keys.tickets });
      qc.invalidateQueries({ queryKey: keys.me }); // an admin may have changed their own role
    },
  });
}

export const useCreateMember = () =>
  useMembersMutation((body) => api('/members', { method: 'POST', body }));
export const useChangeRole = () =>
  useMembersMutation(({ id, role }) => api(`/members/${id}`, { method: 'PATCH', body: { role } }));
export const useRemoveMember = () =>
  useMembersMutation((id) => api(`/members/${id}`, { method: 'DELETE' }));

// --- tickets ----------------------------------------------------------------

export const useTickets = (filters) =>
  useInfiniteQuery({
    queryKey: keys.ticketList(filters),
    queryFn: ({ pageParam }) => api('/tickets', { query: { ...filters, cursor: pageParam } }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

export const useTicket = (id) =>
  useQuery({ queryKey: keys.ticket(id), queryFn: () => api(`/tickets/${id}`), retry: false });

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api('/tickets', { method: 'POST', body }),
    onSuccess: (ticket) => {
      qc.setQueryData(keys.ticket(ticket.id), ticket);
      qc.invalidateQueries({ queryKey: keys.tickets });
    },
  });
}

export function useUpdateTicket(id) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch) => api(`/tickets/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: (ticket) => {
      qc.setQueryData(keys.ticket(id), ticket);
      qc.invalidateQueries({ queryKey: keys.tickets });
    },
    // A 409 means someone else changed it first: pull the latest version.
    onError: (err) => {
      if (err.status === 409) qc.invalidateQueries({ queryKey: keys.ticket(id) });
    },
  });
}

// --- comments ---------------------------------------------------------------

export const useComments = (ticketId) =>
  useQuery({
    queryKey: keys.comments(ticketId),
    queryFn: () => api(`/tickets/${ticketId}/comments`).then((r) => r.items),
  });

export function useAddComment(ticketId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api(`/tickets/${ticketId}/comments`, { method: 'POST', body: { body } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.comments(ticketId) });
      qc.invalidateQueries({ queryKey: keys.ticket(ticketId) });
    },
  });
}
