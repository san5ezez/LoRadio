# LoRadio

LoRadio is a synchronized internet-radio MVP for Cloudflare Workers. The playlist uses the official YouTube IFrame Player; audio is not downloaded or stored.

## Local setup

```bash
npm install
npm run dev
```

Set a local admin password with a Wrangler secret or local `.dev.vars`:

```text
ADMIN_PASSWORD=change-me
```

Open `/` for voting, `/stream` for the synchronized broadcast, and `/admin` for controls.

## Cloudflare setup

1. Create a D1 database and KV namespace (already configured in this workspace).
2. Run `npx wrangler d1 execute loradio --remote --file=schema.sql`.
3. Set the secret: `npx wrangler secret put ADMIN_PASSWORD`.
4. Deploy with `npm run deploy`.

The single Durable Object instance `RadioState` owns the live snapshot and WebSocket fan-out. R2-backed file injection is intentionally disabled to keep the deployment free. This MVP exposes live-mic status controls; a real shared WebRTC audio source needs Cloudflare Calls, LiveKit, or another SFU, because Workers are not media servers.

## Vercel

Import `san5ezez/LoRadio` in Vercel and deploy with the default settings. The Vercel project serves the static frontend, while `public/app.js` connects voting and WebSocket traffic to the Cloudflare Worker backend. Change `API_BASE` in `public/app.js` if the Worker URL changes.
