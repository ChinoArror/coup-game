import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, DoorOpen, Filter, RefreshCw, Users, X } from 'lucide-react';
import RoomCreateCard from './RoomCreateCard';
import RoomLobby from './RoomLobby';
import RoomMatch from './RoomMatch';
import ProtocolPage from './ProtocolPage';
import { roomApi, type RoomDetails, type RoomSummary } from './services/roomClient';
import { filterRoomSummaries, normalizeInviteToken, roomStatusLabel, summarizeRoomSeats, type RoomFilter } from './services/roomUi';

export default function GameHub({ roomId }: { roomId?: string }) {
  const initialSearch = new URLSearchParams(location.search);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [active, setActive] = useState<RoomDetails | null>(null);
  const [me, setMe] = useState('');
  const [seatCount, setSeatCount] = useState(3);
  const [selected, setSelected] = useState<string[]>([]);
  const [stepSeconds, setStepSeconds] = useState('');
  const [totalMinutes, setTotalMinutes] = useState('');
  const [inviteToken, setInviteToken] = useState(initialSearch.get('invite') || '');
  const [watchToken, setWatchToken] = useState(initialSearch.get('watch') || '');
  const [clipboardInvite, setClipboardInvite] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteUrl, setInviteUrl] = useState('');
  const [confirmEndRoom, setConfirmEndRoom] = useState(false);
  const [roomFilter, setRoomFilter] = useState<RoomFilter>('active');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const copyFeedbackTimer = useRef<number | undefined>(undefined);
  const invitePreparedFor = useRef('');

  const load = async () => {
    const [list, identity] = await Promise.all([roomApi.list(), fetch('/api/me').then(response => response.json())]);
    setRooms(list);
    setMe(identity.uuid);
  };

  const getActiveDetails = async (id: string, mode = watchToken) => {
    if (mode === 'admin') return roomApi.adminWatch(id);
    if (mode) return roomApi.watch(id, mode);
    return roomApi.get(id);
  };

  const openRoom = async (id: string) => {
    setWatchToken('');
    setActive(await roomApi.get(id));
    history.pushState({}, '', `/game/${encodeURIComponent(id)}`);
  };

  const openWatch = async (id: string, token: string) => {
    setWatchToken(token);
    setActive(await (token === 'admin' ? roomApi.adminWatch(id) : roomApi.watch(id, token)));
    history.pushState({}, '', `/game/${encodeURIComponent(id)}?watch=${encodeURIComponent(token)}`);
  };

  const backToHub = () => {
    setActive(null);
    setInviteUrl(''); setInviteCopied(false); invitePreparedFor.current = '';
    setWatchToken('');
    setConfirmEndRoom(false);
    history.pushState({}, '', '/game');
    void load().catch(reason => setError(reason.message));
  };

  const refreshActive = async () => {
    const openedRoomId = active?.id;
    await load();
    if (openedRoomId && window.location.pathname !== '/game') setActive(await getActiveDetails(openedRoomId));
  };

  const run = async (operation: () => Promise<unknown>) => {
    const openedRoomId = active?.id;
    const openedWatchToken = watchToken;
    setBusy(true);
    setError('');
    try {
      await operation();
      await load();
      if (openedRoomId && window.location.pathname !== '/game') {
        setActive(await getActiveDetails(openedRoomId, openedWatchToken));
      }
    } catch (reason: any) {
      setError(reason.message || 'Room request failed');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load().catch(reason => setError(reason.message));
    if (!roomId) return;
    const routeWatch = new URLSearchParams(location.search).get('watch') || '';
    if (routeWatch) void openWatch(roomId, routeWatch).catch(reason => setError(reason.message));
    else void openRoom(roomId).catch(reason => setError(reason.message));
  }, [roomId]);

  useEffect(() => {
    if (!active || active.status !== 'open' || active.ownerUuid !== me || invitePreparedFor.current === active.id) return;
    invitePreparedFor.current = active.id;
    setInviteUrl(''); setInviteCopied(false);
    void roomApi.invite(active.id).then(invite => setInviteUrl(invite.url)).catch(reason => {
      invitePreparedFor.current = '';
      setError(reason.message || 'Could not prepare room invitation');
    });
  }, [active?.id, active?.status, active?.ownerUuid, me]);

  useEffect(() => {
    if (!inviteToken) return;
    void roomApi.resolveInvite(inviteToken).then(result => {
      if (result.canWatch) return openWatch(result.room.id, inviteToken);
      return undefined;
    }).catch(reason => setError(reason.message));
  }, [inviteToken]);

  useEffect(() => {
    if (roomId || inviteToken || !navigator.clipboard) return;
    const readFirstClipboardText = async () => {
      if (navigator.clipboard.read) {
        const [firstItem] = await navigator.clipboard.read();
        if (!firstItem) return '';
        const type = firstItem.types.find(item => item === 'text/plain');
        if (!type) return '';
        return (await firstItem.getType(type)).text();
      }
      return navigator.clipboard.readText ? navigator.clipboard.readText() : '';
    };
    void readFirstClipboardText().then(text => {
      const raw = text.trim();
      let parsed: URL;
      try { parsed = new URL(raw); } catch { return; }
      if (parsed.origin === location.origin && parsed.pathname === '/game' && /^[a-f0-9]{32,}$/i.test(parsed.searchParams.get('invite') || '')) setClipboardInvite(parsed.searchParams.get('invite'));
    }).catch(() => undefined);
  }, [roomId, inviteToken]);

  useEffect(() => {
    if (!clipboardInvite) return;
    const y = window.scrollY;
    const style = document.body.style;
    const previous = { position: style.position, top: style.top, width: style.width, overflow: document.documentElement.style.overflow };
    style.position = 'fixed'; style.top = `-${y}px`; style.width = '100%'; document.documentElement.style.overflow = 'hidden';
    return () => { style.position = previous.position; style.top = previous.top; style.width = previous.width; document.documentElement.style.overflow = previous.overflow; window.scrollTo(0, y); };
  }, [clipboardInvite]);

  useEffect(() => {
    const refresh = () => { void refreshActive().catch(reason => setError(reason.message)); };
    const timer = window.setInterval(refresh, 3000);
    const onVisibility = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility); };
  }, [active?.id, watchToken]);

  useEffect(() => () => {
    if (copyFeedbackTimer.current) window.clearTimeout(copyFeedbackTimer.current);
  }, []);

  const seatSummary = summarizeRoomSeats(seatCount, selected);

  const create = () => {
    if (!seatSummary.valid) return;
    return run(async () => {
    const result = await roomApi.create({ seatCount, aiChannels: selected, timeControls: { ...(stepSeconds ? { stepLimitMs: Number(stepSeconds) * 1000 } : {}), ...(totalMinutes ? { totalLimitMs: Number(totalMinutes) * 60_000 } : {}) } });
    invitePreparedFor.current = result.id;
    setInviteUrl(result.invite.url);
    await openRoom(result.id);
    });
  };

  const join = (token = inviteToken) => run(async () => {
    const resolved = await roomApi.resolveInvite(token);
    if (resolved.canWatch) return openWatch(resolved.room.id, token);
    await roomApi.join(resolved.room.id, token);
    await openRoom(resolved.room.id);
  });

  const copyInvite = async () => {
    if (!active || !inviteUrl) return;
    try {
      const freshInvite = await roomApi.invite(active.id);
      setInviteUrl(freshInvite.url);
      const urlToCopy = freshInvite.url;
      const fallbackCopy = () => {
        const field = document.createElement('textarea');
        field.value = urlToCopy; field.setAttribute('readonly', '');
        field.style.position = 'fixed'; field.style.opacity = '0';
        document.body.appendChild(field); field.select();
        const copied = document.execCommand('copy'); field.remove();
        if (!copied) throw new Error('Clipboard access is unavailable');
      };
      if (navigator.clipboard?.writeText) {
        try { await navigator.clipboard.writeText(urlToCopy); }
        catch { fallbackCopy(); }
      } else fallbackCopy();
      setError(''); setInviteCopied(true);
      if (copyFeedbackTimer.current) window.clearTimeout(copyFeedbackTimer.current);
      copyFeedbackTimer.current = window.setTimeout(() => setInviteCopied(false), 2000);
    } catch {
      setError('Could not copy the invitation. Please check clipboard permission and try again.');
    }
  };

  const endRoom = () => {
    if (!active) return;
    setConfirmEndRoom(false);
    void run(() => roomApi.close(active.id).then(backToHub));
  };

  const clipboardModal = clipboardInvite && <div className="dashboard-theme fixed inset-0 z-[2147483647] flex items-end justify-center bg-black/55 p-2 backdrop-blur-md sm:items-center sm:p-4" onClick={() => setClipboardInvite(null)} onWheel={event => event.stopPropagation()} onTouchMove={event => event.stopPropagation()}><div role="dialog" aria-modal="true" onClick={event => event.stopPropagation()} className="relative w-full max-w-lg rounded-[1.75rem] border border-slate-700 bg-slate-900 shadow-2xl"><button onClick={() => setClipboardInvite(null)} className="absolute right-4 top-4 z-30 grid h-10 w-10 place-items-center rounded-full border border-slate-700 bg-slate-800 text-slate-300 hover:text-white" aria-label="Close"><X size={18}/></button><div className="max-h-[92dvh] overflow-y-auto px-6 pb-8 pt-16"><p className="font-mono text-xs tracking-widest text-amber-400">INVITATION DETECTED</p><h2 className="mt-2 text-xl font-bold text-white">发现房间邀请</h2><div className="mt-6 grid grid-cols-2 gap-3"><button onClick={() => { const token = clipboardInvite; setClipboardInvite(null); if (token) join(token); }} className="min-h-11 rounded-lg bg-amber-500 px-4 py-2 font-mono text-xs font-bold text-slate-950">进入房间</button><button onClick={() => setClipboardInvite(null)} className="min-h-11 rounded-lg bg-slate-800 px-4 py-2 text-xs font-bold text-slate-200">暂不进入</button></div></div></div></div>;
  const endRoomModal = confirmEndRoom && <div className="dashboard-theme fixed inset-0 z-[2147483647] flex items-end justify-center bg-black/55 p-2 backdrop-blur-md sm:items-center sm:p-4" onClick={() => setConfirmEndRoom(false)}><div role="dialog" aria-modal="true" aria-labelledby="end-room-title" onClick={event => event.stopPropagation()} className="w-full max-w-md rounded-[1.75rem] border border-red-500/30 bg-slate-900 p-6 shadow-2xl"><p className="font-mono text-xs tracking-widest text-red-300">CONFIRM ACTION</p><h2 id="end-room-title" className="mt-2 text-xl font-bold text-white">END ROOM?</h2><p className="mt-2 text-sm text-slate-400">This ends the match for every player.</p><div className="mt-6 grid grid-cols-2 gap-3"><button onClick={() => setConfirmEndRoom(false)} className="min-h-11 rounded-lg bg-slate-800 px-4 py-2 text-xs font-bold text-slate-200">CANCEL</button><button onClick={endRoom} className="min-h-11 rounded-lg bg-red-600 px-4 py-2 font-mono text-xs font-bold text-white">END ROOM</button></div></div></div>;
  const overlays = <>{clipboardModal}{endRoomModal}</>;

  const visibleRooms = useMemo(() => filterRoomSummaries(rooms, roomFilter), [rooms, roomFilter]);
  const roomIsMatch = active && (active.status === 'started' || (active.spectator && active.status === 'paused'));
  const isOwner = Boolean(active && !active.spectator && active.ownerUuid === me);

  if (roomIsMatch && active) return <>
    <ProtocolPage eyebrow="Multiplayer / live table" title={`Room ${active.id.slice(0, 8).toUpperCase()}`} description={active.spectator ? 'Observe the live table without taking a player seat.' : 'Make your move when the table calls on you.'} status={active.status === 'paused' ? 'Room paused' : active.spectator ? 'Watching live' : 'Live multiplayer table'} actions={<>
      <button onClick={backToHub} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.05] hover:text-amber-200"><ArrowLeft size={16} />Rooms</button>
      <button onClick={() => void refreshActive().catch(reason => setError(reason.message))} className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-white/10 text-slate-400 transition hover:bg-white/[0.05] hover:text-white" aria-label="Refresh room"><RefreshCw size={16} /></button>
      {isOwner && active.status === 'started' && <button onClick={() => void run(() => roomApi.pause(active.id).then(() => getActiveDetails(active.id)))} className="min-h-11 rounded-xl border border-amber-200/20 px-3 text-xs font-semibold text-amber-100 transition hover:bg-amber-200/[0.08]">Pause</button>}
      {isOwner && <button onClick={() => setConfirmEndRoom(true)} className="min-h-11 rounded-xl border border-red-300/20 px-3 text-xs font-semibold text-red-200 transition hover:bg-red-300/[0.08]">End room</button>}
      <a href="/game/rules" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.05] hover:text-amber-200"><BookOpen size={16} /><span className="hidden sm:inline">Rules</span></a>
    </>}>
      {error && <p role="alert" className="mb-5 rounded-xl border border-red-300/20 bg-red-300/[0.07] p-3 text-sm text-red-100">{error}</p>}
      <RoomMatch roomId={active.id} currentUserId={me} spectator={Boolean(active.spectator)} watchToken={watchToken || undefined} isOwner={isOwner} />
    </ProtocolPage>
    {overlays}
  </>;

  if (active) return <>
    <ProtocolPage eyebrow="Multiplayer / room lobby" title={active.status === 'open' ? 'Get ready at the table.' : 'The room is paused.'} description={active.status === 'open' ? 'Check the roster, mark yourself ready, and wait for the host to begin.' : 'The host can resume the room when everyone is ready.'} status={active.status === 'open' ? 'Preparing room' : 'Room paused'} width="max-w-5xl" actions={<>
      <button onClick={backToHub} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.05] hover:text-amber-200"><ArrowLeft size={16} />Rooms</button>
      <a href="/game/rules" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.05] hover:text-amber-200"><BookOpen size={16} />Rules</a>
      <button onClick={() => void refreshActive().catch(reason => setError(reason.message))} className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-white/10 text-slate-400 transition hover:bg-white/[0.05] hover:text-white" aria-label="Refresh room"><RefreshCw size={17} /></button>
    </>}>
      {error && <p role="alert" className="mb-5 rounded-xl border border-red-300/20 bg-red-300/[0.07] p-3 text-sm text-red-100">{error}</p>}
      <RoomLobby room={active} currentUserId={me} busy={busy} inviteCopied={inviteCopied} inviteReady={Boolean(inviteUrl)} onReady={ready => void run(() => roomApi.ready(active.id, ready))} onStart={() => void run(() => roomApi.start(active.id))} onClose={() => setConfirmEndRoom(true)} onLeave={() => void run(() => roomApi.leave(active.id).then(backToHub))} onKick={userUuid => void run(() => roomApi.kick(active.id, userUuid))} onInvite={() => void copyInvite()} />
    </ProtocolPage>
    {overlays}
  </>;

  return (
    <>
      <main className="min-h-screen bg-[#090d12] px-4 pb-12 pt-5 text-slate-200 sm:px-6 sm:pt-8">
        <section className="mx-auto max-w-6xl">
          <header className="mb-7 flex items-center justify-between gap-3 border-b border-white/10 pb-5">
            <a href="/" className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-xs font-bold text-slate-400 transition hover:bg-white/[0.05] hover:text-amber-200"><ArrowLeft size={16} />HOME</a>
            <div className="min-w-0 flex-1 sm:flex-none"><p className="font-mono text-[10px] uppercase tracking-[0.17em] text-sky-200/65">Multiplayer</p><h1 className="truncate text-lg font-semibold text-white sm:text-xl">Game rooms</h1></div>
            <div className="flex gap-2"><a href="/game/rules" className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-xs font-bold text-amber-300 transition hover:bg-white/[0.05]"><BookOpen size={16} /><span className="hidden sm:inline">RULES</span></a><button onClick={() => void refreshActive().catch(reason => setError(reason.message))} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-slate-400 transition hover:bg-white/[0.05] hover:text-white" aria-label="Refresh rooms"><RefreshCw size={17} /></button></div>
          </header>
          {error && <p role="alert" className="mb-5 rounded-xl border border-red-400/20 bg-red-400/[0.08] p-3 text-sm text-red-100">{error}</p>}
          <div className="grid items-start gap-5 lg:grid-cols-[1.2fr_.8fr]">
            <RoomCreateCard
              seatCount={seatCount}
              selected={selected}
              stepSeconds={stepSeconds}
              totalMinutes={totalMinutes}
              busy={busy}
              onSeatCountChange={count => { setSeatCount(count); setSelected(current => current.slice(0, Math.min(3, count - 1))); }}
              onToggleAi={channel => setSelected(current => current.includes(channel)
                ? current.filter(item => item !== channel)
                : current.length < Math.min(3, seatCount - 1) ? [...current, channel] : current)}
              onStepSecondsChange={setStepSeconds}
              onTotalMinutesChange={setTotalMinutes}
              onCreate={create}
            />
            <section className="rounded-3xl border border-white/10 bg-[#111820] p-5 sm:p-6">
              <header className="flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-sky-200/15 bg-sky-200/10 text-sky-200"><DoorOpen size={20} /></span><div><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-sky-200/65">Have an invitation?</p><h2 className="mt-1 text-xl font-semibold text-white">Join a room</h2><p className="mt-1 text-sm text-slate-400">Paste a room link or its invite token.</p></div></header>
              <label className="mt-6 block text-xs font-semibold text-slate-300" htmlFor="room-invite">Invitation link or token</label>
              <input id="room-invite" value={inviteToken} onChange={event => setInviteToken(normalizeInviteToken(event.target.value))} placeholder="Paste invitation" className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#090d12] px-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-200/50" />
              <button disabled={busy || !inviteToken} onClick={() => join()} className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-sky-200/25 bg-sky-200/[0.08] px-4 text-sm font-semibold text-sky-100 transition hover:bg-sky-200/[0.14] disabled:cursor-not-allowed disabled:opacity-40"><Users size={16} />{busy ? 'Joining…' : 'Join invited room'}</button>
              <div className="mt-5 rounded-2xl border border-white/[0.07] bg-black/15 p-4"><p className="text-xs font-semibold text-slate-200">What happens next?</p><ol className="mt-3 space-y-2 text-xs leading-5 text-slate-400"><li><span className="mr-2 font-mono text-sky-200">01</span>Check the room and seat availability.</li><li><span className="mr-2 font-mono text-sky-200">02</span>Mark yourself ready when you are set.</li><li><span className="mr-2 font-mono text-sky-200">03</span>The host starts once every seat is filled.</li></ol></div>
            </section>
          </div>
          <section className="mt-9">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">Your tables</p><h2 className="mt-1 flex items-center gap-2 text-lg font-semibold text-white"><Users size={18} className="text-slate-400" />My rooms</h2></div><label className="inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-slate-400"><Filter size={14} /><span>Show</span><select value={roomFilter} onChange={event => setRoomFilter(event.target.value as RoomFilter)} className="min-h-11 rounded-lg border border-white/10 bg-[#111820] px-3 text-xs text-slate-200"><option value="active">Active</option><option value="all">All rooms</option></select></label></div>
            <div className="grid gap-3 md:grid-cols-2">{visibleRooms.map(room => { const status = roomStatusLabel(room.status); return <button key={room.id} onClick={() => void openRoom(room.id).catch(reason => setError(reason.message))} className="min-h-24 rounded-2xl border border-white/10 bg-[#111820] p-4 text-left transition hover:border-amber-200/30 hover:bg-white/[0.04]"><span className={`inline-flex rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold ${status.className}`}>{status.text}</span><p className="mt-2 font-semibold text-white">{room.memberCount} players <span className="text-slate-500">/</span> {room.seatCount} seats</p><p className="mt-1 text-xs text-slate-500">AI {room.aiNames.join(', ') || 'none'} · {room.timeControls.stepLimitMs ? `${Math.round(room.timeControls.stepLimitMs / 1000)}s turns` : 'No turn clock'}</p></button>; })}{visibleRooms.length === 0 && <div className="rounded-2xl border border-dashed border-white/10 p-6 text-sm text-slate-500">No rooms yet. Create a room or join with an invitation.</div>}</div>
          </section>
        </section>
      </main>
      {overlays}
    </>
  );
}
