# SliqDesk

Multi-tenant support desk (take-home). Work in progress; see the commit history
for the phase plan.

## Run

```bash
docker compose up --build
```

- Web: http://localhost:8080 (nginx serves the SPA and proxies `/api` and `/socket.io`)
- API: http://localhost:4000/health

No `.env` is needed; compose has working defaults (see `.env.example`).

## Develop

```bash
cd api && npm install && npm run lint && npm test
cd web && npm install && npm run lint && npm test
```

API tests start an in-memory MongoDB replica set (the first run downloads a
MongoDB binary).

## Layout

```
api/   Express API (Node 20, ES modules)
web/   React SPA (Vite)
docker-compose.yml   mongo (replica set rs0) + api + web
```
