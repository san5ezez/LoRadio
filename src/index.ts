interface Env {
  RADIO_STATE: DurableObjectNamespace;
  DB: D1Database;
  STATE_CACHE: KVNamespace;
  ADMIN_LOGIN: string;
  ADMIN_PASSWORD?: string;
  VOTE_WINDOW_SECONDS?: string;
  ASSETS: Fetcher;
}

type Source = 'vote' | 'random' | 'admin_force';
interface Track { id: string; title: string; youtubeUrl: string; youtubeId: string; durationSeconds: number; restricted: boolean; }
interface RadioSnapshot { currentTrackId: string | null; previousTrackId: string | null; startedAt: number | null; isPaused: boolean; pausedAtOffset: number; mode: 'playlist' | 'live-mic' | 'live-file'; roundId: string; roundEndsAt: number; votes: Record<string, number>; listenerCount: number; }
const seedTracks: Track[] = [
  { id: 'new-generation', title: 'Новое Поколение', youtubeUrl: 'https://www.youtube.com/watch?v=cAKepjg8nwM', youtubeId: 'cAKepjg8nwM', durationSeconds: 210, restricted: false },
  { id: 'pawns', title: 'Пешки', youtubeUrl: 'https://www.youtube.com/watch?v=REOGhI703Ec', youtubeId: 'REOGhI703Ec', durationSeconds: 210, restricted: true },
  { id: 'shining-hymn', title: 'Сияние / Гимн Сияния', youtubeUrl: 'https://www.youtube.com/watch?v=Z3RQ2KKbj38', youtubeId: 'Z3RQ2KKbj38', durationSeconds: 210, restricted: false },
  { id: 'true-path', title: 'Верный Путь', youtubeUrl: 'https://www.youtube.com/watch?v=SwjfG2Z4kpk', youtubeId: 'SwjfG2Z4kpk', durationSeconds: 210, restricted: false },
  { id: 'great-flame', title: 'Великое Пламя', youtubeUrl: 'https://www.youtube.com/watch?v=jsuyL--MN6Y', youtubeId: 'jsuyL--MN6Y', durationSeconds: 210, restricted: false },
  { id: 'we-are', title: 'Мы Есть', youtubeUrl: 'https://www.youtube.com/watch?v=aIlr4F4gI7I', youtubeId: 'aIlr4F4gI7I', durationSeconds: 210, restricted: false },
  { id: 'world-heart', title: 'Сердце Мира', youtubeUrl: 'https://www.youtube.com/watch?v=oQf6ZUPb_74', youtubeId: 'oQf6ZUPb_74', durationSeconds: 210, restricted: false }
];
const initialState = (windowSeconds: number): RadioSnapshot => ({ currentTrackId: seedTracks[0].id, previousTrackId: null, startedAt: Date.now(), isPaused: false, pausedAtOffset: 0, mode: 'playlist', roundId: crypto.randomUUID(), roundEndsAt: Date.now() + windowSeconds * 1000, votes: {}, listenerCount: 0 });

export class RadioState {
  private state!: RadioSnapshot;
  private sockets = new Set<WebSocket>();
  constructor(private readonly ctx: DurableObjectState, private readonly env: Env) {
    ctx.blockConcurrencyWhile(async () => { this.state = (await ctx.storage.get<RadioSnapshot>('state')) ?? initialState(Number(env.VOTE_WINDOW_SECONDS ?? 90)); await ctx.storage.setAlarm(this.state.roundEndsAt); });
  }
  async alarm() { if (this.state.isPaused || this.state.mode !== 'playlist' || Date.now() < this.state.roundEndsAt) { await this.ctx.storage.setAlarm(Date.now() + 1000); return; } const eligible = seedTracks.filter(track => !track.restricted && track.id !== this.state.currentTrackId); const leaders = Object.entries(this.state.votes).sort((left, right) => right[1] - left[1]); const top = leaders.length ? leaders.filter(entry => entry[1] === leaders[0][1]).map(entry => entry[0]) : eligible.map(track => track.id); const pool = top.length ? top : eligible.map(track => track.id); await this.startTrack(pool[Math.floor(Math.random() * pool.length)] ?? seedTracks[0].id, leaders.length ? 'vote' : 'random'); }
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') === 'websocket') return this.connect();
    const url = new URL(request.url);
    if (url.pathname === '/state') return this.json(await this.snapshot());
    if (request.method === 'POST' && url.pathname === '/vote') return this.vote(request);
    if (request.method === 'POST' && url.pathname.startsWith('/admin/')) return this.admin(request, url.pathname);
    return new Response('Not found', { status: 404 });
  }
  private connect(): Response { const pair = new WebSocketPair(); const [client, server] = Object.values(pair); server.accept(); this.sockets.add(server); this.state.listenerCount = this.sockets.size; server.send(JSON.stringify({ type: 'state', state: this.state })); server.addEventListener('close', () => { this.sockets.delete(server); this.state.listenerCount = this.sockets.size; }); return new Response(null, { status: 101, webSocket: client }); }
  private async snapshot() { return this.state; }
  private async vote(request: Request) { const { trackId } = await request.json() as { trackId?: string }; if (!seedTracks.some(track => track.id === trackId)) return this.json({ error: 'Unknown track' }, 400); const voter = request.headers.get('cf-connecting-ip') ?? 'anonymous'; const key = `vote:${this.state.roundId}:${voter}`; if (await this.ctx.storage.get(key)) return this.json({ error: 'Already voted' }, 409); await this.ctx.storage.put(key, true); this.state.votes[trackId!] = (this.state.votes[trackId!] ?? 0) + 1; await this.save(); return this.json(this.state); }
  private async admin(request: Request, path: string) { const body = await request.json().catch(() => ({})) as { trackId?: string; mode?: 'live-mic' | 'live-file' }; if (path === '/admin/force-next' && body.trackId) return this.startTrack(body.trackId, 'admin_force'); if (path === '/admin/force-prev' && this.state.previousTrackId) return this.startTrack(this.state.previousTrackId, 'admin_force'); if (path === '/admin/pause') { this.state.isPaused = true; this.state.pausedAtOffset = this.offset(); await this.save(); return this.json(this.state); } if (path === '/admin/resume') { this.state.isPaused = false; this.state.startedAt = Date.now() - this.state.pausedAtOffset * 1000; await this.save(); return this.json(this.state); } if (path === '/admin/live/start-mic' || path === '/admin/live/start-file') { this.state.mode = path.endsWith('mic') ? 'live-mic' : 'live-file'; await this.save(); return this.json(this.state); } if (path === '/admin/live/stop') { this.state.mode = 'playlist'; await this.save(); return this.json(this.state); } return this.json({ error: 'Unknown command' }, 404); }
  private async startTrack(trackId: string, source: Source) { if (!seedTracks.some(track => track.id === trackId)) return this.json({ error: 'Unknown track' }, 400); this.state.previousTrackId = this.state.currentTrackId; this.state.currentTrackId = trackId; this.state.startedAt = Date.now(); this.state.isPaused = false; this.state.pausedAtOffset = 0; this.state.mode = 'playlist'; this.state.roundId = crypto.randomUUID(); this.state.roundEndsAt = Date.now() + Number(this.env.VOTE_WINDOW_SECONDS ?? 90) * 1000; this.state.votes = {}; await this.ctx.storage.setAlarm(this.state.roundEndsAt); await this.save(); await this.env.DB.prepare('INSERT INTO history (track_id, source) VALUES (?, ?)').bind(trackId, source).run().catch(() => undefined); return this.json({ ...this.state, source }); }
  private offset() { return this.state.startedAt ? Math.max(0, (Date.now() - this.state.startedAt) / 1000) : this.state.pausedAtOffset; }
  private async save() { await this.ctx.storage.put('state', this.state); const message = JSON.stringify({ type: 'state', state: this.state }); for (const socket of this.sockets) socket.send(message); }
  private json(value: unknown, status = 200) { return Response.json(value, { status, headers: { 'Access-Control-Allow-Origin': '*' } }); }
}

export default { async fetch(request: Request, env: Env): Promise<Response> { const url = new URL(request.url); if (url.pathname.startsWith('/api/')) { const id = env.RADIO_STATE.idFromName('main'); const stub = env.RADIO_STATE.get(id); if (url.pathname === '/api/state') return stub.fetch(new Request(new URL('/state', url), request)); if (url.pathname === '/api/tracks') return Response.json(seedTracks, { headers: { 'Access-Control-Allow-Origin': '*' } }); if (url.pathname === '/api/stream-socket') return stub.fetch(new Request(new URL('/socket', url), request)); if (url.pathname === '/api/vote') return stub.fetch(new Request(new URL('/vote', url), request)); if (url.pathname.startsWith('/api/admin/')) { if (url.pathname === '/api/admin/login') return login(request, env); if (!validAdmin(request, env)) return Response.json({ error: 'Unauthorized' }, { status: 401 }); return stub.fetch(new Request(new URL(url.pathname.replace('/api', ''), url), request)); } } return env.ASSETS.fetch(request); } };
function validAdmin(request: Request, env: Env) { const cookie = request.headers.get('Cookie') ?? ''; return Boolean(env.ADMIN_PASSWORD && cookie.includes(`loradio_admin=${env.ADMIN_PASSWORD}`)); }
async function login(request: Request, env: Env) { const body = await request.json().catch(() => ({})) as { login?: string; password?: string }; if (body.login !== env.ADMIN_LOGIN || body.password !== env.ADMIN_PASSWORD) return Response.json({ error: 'Invalid credentials' }, { status: 401, headers: { 'Access-Control-Allow-Origin': '*' } }); return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Set-Cookie': `loradio_admin=${env.ADMIN_PASSWORD}; HttpOnly; Secure; SameSite=None; Path=/` } }); }
