import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, DoorOpen, Filter, RefreshCw, Users } from 'lucide-react';
import RoomCreateCard from './RoomCreateCard';
import RoomLobby from './RoomLobby';
import RoomMatch from './RoomMatch';
import { roomApi, type RoomDetails, type RoomStatus, type RoomSummary } from './services/roomClient';
import { filterRoomSummaries, normalizeInviteToken, roomStatusLabel, summarizeRoomSeats, type RoomFilter } from './services/roomUi';
import { AppShell, Badge, Button, Card, Input, Modal, PageHeader, ThemeToggle, buttonClassName, InsetPanel, confirmAction, deferSensitive, notify, notifyResult, type BadgeTone } from './ui';

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
    history.pushState({}, '', '/game');
    void load().catch(reason => setError(reason.message));
  };

  const refreshActive = async () => {
    const openedRoomId = active?.id;
    await load();
    if (openedRoomId && window.location.pathname !== '/game') setActive(await getActiveDetails(openedRoomId));
  };

  // Records the failure inline and re-throws it. Deferred operations use this
  // so a failed request is never reported as a success.
  const runOrThrow = async (operation: () => Promise<unknown>) => {
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
      throw reason;
    } finally {
      setBusy(false);
    }
  };

  const run = (operation: () => Promise<unknown>) => runOrThrow(operation).catch(() => undefined);

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
      const result = await notifyResult(() => roomApi.create({ seatCount, aiChannels: selected, timeControls: { ...(stepSeconds ? { stepLimitMs: Number(stepSeconds) * 1000 } : {}), ...(totalMinutes ? { totalLimitMs: Number(totalMinutes) * 60_000 } : {}) } }), { success: 'Room created', error: 'Could not create room' });
      invitePreparedFor.current = result.id;
      setInviteUrl(result.invite.url);
      await openRoom(result.id);
    });
  };

  const join = (token = inviteToken) => run(async () => {
    const resolved = await roomApi.resolveInvite(token);
    if (resolved.canWatch) return openWatch(resolved.room.id, token);
    await notifyResult(() => roomApi.join(resolved.room.id, token), { success: 'Joined room', error: 'Could not join room' });
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
      notify({ tone: 'success', title: 'Invite link copied' });
      if (copyFeedbackTimer.current) window.clearTimeout(copyFeedbackTimer.current);
      copyFeedbackTimer.current = window.setTimeout(() => setInviteCopied(false), 2000);
    } catch {
      const message = 'Could not copy the invitation. Please check clipboard permission and try again.';
      setError(message);
      notify({ tone: 'destructive', title: 'Invite link not copied', description: message });
    }
  };

  // Sensitive actions: confirm first, then run behind an undo window.
  const endRoom = async () => {
    if (!active) return;
    const roomId = active.id;
    const confirmed = await confirmAction({ title: 'END ROOM?', description: 'This ends the match for every player.', confirmLabel: 'END ROOM', tone: 'destructive' });
    if (!confirmed) return;
    deferSensitive({
      title: 'Ending room',
      description: 'The room closes for everyone when the timer ends.',
      successTitle: 'Room closed',
      errorTitle: 'Could not end room',
      run: () => runOrThrow(() => roomApi.close(roomId).then(backToHub)),
    });
  };

  const leaveRoom = async () => {
    if (!active) return;
    const roomId = active.id;
    const confirmed = await confirmAction({ title: 'Leave this room?', description: 'You give up your seat at this table.', confirmLabel: 'LEAVE', tone: 'destructive' });
    if (!confirmed) return;
    deferSensitive({
      title: 'Leaving room',
      description: 'You leave the table when the timer ends.',
      successTitle: 'Left room',
      errorTitle: 'Could not leave room',
      run: () => runOrThrow(() => roomApi.leave(roomId).then(backToHub)),
    });
  };

  const kickMember = async (userUuid: string) => {
    if (!active) return;
    const roomId = active.id;
    const name = active.members.find(member => member.uuid === userUuid)?.name || 'this player';
    const confirmed = await confirmAction({ title: `Remove ${name}?`, description: 'They lose their seat at this table.', confirmLabel: 'REMOVE', tone: 'destructive' });
    if (!confirmed) return;
    deferSensitive({
      title: `Removing ${name}`,
      description: 'The seat is freed when the timer ends.',
      successTitle: `Removed ${name}`,
      errorTitle: `Could not remove ${name}`,
      run: () => runOrThrow(() => roomApi.kick(roomId, userUuid)),
    });
  };

  const clipboardModal = clipboardInvite && <Modal
    open
    onClose={() => setClipboardInvite(null)}
    title="发现房间邀请"
    description={<span className="font-mono text-micro uppercase tracking-[0.14em] text-primary">INVITATION DETECTED</span>}
    footer={<>
      <Button variant="outline" onClick={() => setClipboardInvite(null)} className="min-h-11 px-4 text-xs font-semibold">暂不进入</Button>
      <Button onClick={() => { const token = clipboardInvite; setClipboardInvite(null); if (token) join(token); }} className="min-h-11 px-4 text-xs font-semibold">进入房间</Button>
    </>}
  />;
  const overlays = <>{clipboardModal}</>;

  const visibleRooms = useMemo(() => filterRoomSummaries(rooms, roomFilter), [rooms, roomFilter]);
  const roomIsMatch = active && (active.status === 'started' || (active.spectator && active.status === 'paused'));
  const isOwner = Boolean(active && !active.spectator && active.ownerUuid === me);

  const navItems = (current: 'hub' | 'room') => [
    { key: 'home', label: 'Home', description: 'Command desk', icon: <ArrowLeft size={18} />, href: '/' },
    { key: 'rooms', label: 'Game rooms', description: 'Create, join and watch tables', icon: <Users size={18} />, active: current === 'hub', onClick: current === 'hub' ? undefined : backToHub },
    { key: 'rules', label: 'Rules', description: 'How the table plays', icon: <BookOpen size={18} />, href: '/game/rules' },
  ];

  if (roomIsMatch && active) return <>
    <AppShell nav={navItems('room')} footer={<ThemeToggle />}>
      <PageHeader
        eyebrow="Multiplayer / live table"
        title={`Room ${active.id.slice(0, 8).toUpperCase()}`}
        description={active.spectator ? 'Observe the live table without taking a player seat.' : 'Make your move when the table calls on you.'}
        status={<Badge tone={active.status === 'paused' ? 'warning' : 'success'}>{active.status === 'paused' ? 'Room paused' : active.spectator ? 'Watching live' : 'Live multiplayer table'}</Badge>}
        actions={<>
          <Button variant="outline" size="icon" onClick={() => void refreshActive().catch(reason => setError(reason.message))} aria-label="Refresh room"><RefreshCw size={16} /></Button>
          {isOwner && active.status === 'started' && <Button variant="outline" onClick={() => void run(() => notifyResult(() => roomApi.pause(active.id), { success: 'Room paused', error: 'Could not pause room' }).then(() => getActiveDetails(active.id)))} className="px-3 text-xs font-semibold">Pause</Button>}
          {isOwner && <Button variant="destructive" onClick={() => void endRoom()} className="px-3 text-xs font-semibold">End room</Button>}
        </>}
      />
      {error && <p role="alert" className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-log-error">{error}</p>}
      <RoomMatch roomId={active.id} currentUserId={me} spectator={Boolean(active.spectator)} watchToken={watchToken || undefined} isOwner={isOwner} />
    </AppShell>
    {overlays}
  </>;

  if (active) return <>
    <AppShell nav={navItems('room')} footer={<ThemeToggle />}>
      <PageHeader
        eyebrow="Multiplayer / room lobby"
        title={active.status === 'open' ? 'Get ready at the table.' : 'The room is paused.'}
        description={active.status === 'open' ? 'Check the roster, mark yourself ready, and wait for the host to begin.' : 'The host can resume the room when everyone is ready.'}
        status={<Badge tone={active.status === 'open' ? 'primary' : 'warning'}>{active.status === 'open' ? 'Preparing room' : 'Room paused'}</Badge>}
        actions={<Button variant="outline" size="icon" onClick={() => void refreshActive().catch(reason => setError(reason.message))} aria-label="Refresh room"><RefreshCw size={17} /></Button>}
      />
      {error && <p role="alert" className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-log-error">{error}</p>}
      <RoomLobby room={active} currentUserId={me} busy={busy} inviteCopied={inviteCopied} inviteReady={Boolean(inviteUrl)} onReady={ready => void run(() => notifyResult(() => roomApi.ready(active.id, ready), { success: ready ? 'Marked ready' : 'Ready cleared', error: 'Could not update ready state' }))} onStart={() => void run(() => notifyResult(() => roomApi.start(active.id), { success: 'Match started', error: 'Could not start match' }))} onClose={() => void endRoom()} onLeave={() => void leaveRoom()} onKick={userUuid => void kickMember(userUuid)} onInvite={() => void copyInvite()} />
    </AppShell>
    {overlays}
  </>;

  return (
    <>
      <AppShell nav={navItems('hub')} footer={<ThemeToggle />}>
        <PageHeader
          eyebrow="Multiplayer"
          title="Game rooms"
          actions={<>
            <a href="/game/rules" className={buttonClassName('outline', 'default', 'h-10 px-3 text-xs font-semibold')}><BookOpen size={16} /><span className="hidden sm:inline">RULES</span></a>
            <Button variant="outline" size="icon" onClick={() => void refreshActive().catch(reason => setError(reason.message))} aria-label="Refresh rooms"><RefreshCw size={16} /></Button>
          </>}
        />
        {error && <p role="alert" className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-log-error">{error}</p>}
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
          <Card className="p-5 sm:p-6">
            <header className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><DoorOpen size={20} /></span><div><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Have an invitation?</p><h2 className="mt-1 text-xl font-semibold tracking-tight">Join a room</h2><p className="mt-1 text-sm text-muted-foreground">Paste a room link or its invite token.</p></div></header>
            <label className="mt-6 block text-xs font-medium text-muted-foreground" htmlFor="room-invite">Invitation link or token</label>
            <Input id="room-invite" value={inviteToken} onChange={event => setInviteToken(normalizeInviteToken(event.target.value))} placeholder="Paste invitation" className="mt-2" />
            <Button variant="outline" size="lg" disabled={busy || !inviteToken} onClick={() => join()} className="mt-3 w-full gap-2 text-sm font-semibold"><Users size={16} />{busy ? 'Joining…' : 'Join invited room'}</Button>
            <InsetPanel className="mt-5 bg-background/50 p-4"><p className="text-xs font-semibold">What happens next?</p><ol className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground"><li><span className="mr-2 font-mono text-primary">01</span>Check the room and seat availability.</li><li><span className="mr-2 font-mono text-primary">02</span>Mark yourself ready when you are set.</li><li><span className="mr-2 font-mono text-primary">03</span>The host starts once every seat is filled.</li></ol></InsetPanel>
          </Card>
        </div>
        <section className="mt-9">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Your tables</p><h2 className="mt-1 flex items-center gap-2 text-lg font-semibold tracking-tight"><Users size={18} className="text-muted-foreground" />My rooms</h2></div><label className="inline-flex min-h-11 items-center gap-2 text-xs font-medium text-muted-foreground"><Filter size={14} /><span>Show</span><select value={roomFilter} onChange={event => setRoomFilter(event.target.value as RoomFilter)} className="min-h-11 rounded-lg border-2 border-input bg-muted/70 px-3 text-xs text-foreground outline-none focus:border-primary focus:bg-background"><option value="active">Active</option><option value="all">All rooms</option></select></label></div>
          <div className="grid gap-3 md:grid-cols-2">{visibleRooms.map(room => { const status = roomStatusLabel(room.status); return <button key={room.id} onClick={() => void openRoom(room.id).catch(reason => setError(reason.message))} className="ui-card min-h-24 rounded-xl border border-border/60 bg-card p-4 text-left transition hover:border-primary/40 hover:bg-accent/30 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"><Badge tone={roomTone(room.status)}>{status.text}</Badge><p className="mt-2 font-semibold tabular-nums">{room.memberCount} players <span className="text-muted-foreground">/</span> {room.seatCount} seats</p><p className="mt-1 text-xs text-muted-foreground">AI {room.aiNames.join(', ') || 'none'} · {room.timeControls.stepLimitMs ? `${Math.round(room.timeControls.stepLimitMs / 1000)}s turns` : 'No turn clock'}</p></button>; })}{visibleRooms.length === 0 && <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">No rooms yet. Create a room or join with an invitation.</div>}</div>
        </section>
      </AppShell>
      {overlays}
    </>
  );
}

function roomTone(status: RoomStatus): BadgeTone {
  if (status === 'started') return 'success';
  if (status === 'paused') return 'warning';
  if (status === 'closed') return 'neutral';
  return 'primary';
}
