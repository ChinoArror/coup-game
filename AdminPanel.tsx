import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Bot, Cpu, Eye, FlaskConical, Power, RefreshCw, Save, Users } from 'lucide-react';
import { roomStatusLabel } from './services/roomUi';
import { AppShell, Badge, Button, Card, InsetPanel, PageHeader, Select, StatTile, ThemeToggle, buttonClassName, confirmAction, deferSensitive, notify, type BadgeTone } from './ui';

type PlayerSlot = 'alapha' | 'beta';

const channels = [
  { id: '1', label: '1 · Gemini' },
  { id: '2', label: '2 · DeepSeek' },
  { id: '3', label: '3 · OpenAI' },
];

const players: Array<{ slot: PlayerSlot; label: string; fallback: string }> = [
  { slot: 'alapha', label: 'Alapha', fallback: '1' },
  { slot: 'beta', label: 'Beta', fallback: '2' },
];

type AdminRoom = {
  id: string;
  status: 'open' | 'started' | 'paused' | 'closed';
  ownerName: string;
  seatCount: number;
  aiNames: string[];
  members: Array<{ uuid: string; name: string; ready: boolean }>;
};

export default function AdminPanel() {
  const [selection, setSelection] = useState<Record<PlayerSlot, string>>({ alapha: '1', beta: '2' });
  const [notice, setNotice] = useState('Loading saved channels…');
  const [testing, setTesting] = useState<string | null>(null);
  const [activeRooms, setActiveRooms] = useState<AdminRoom[]>([]);
  const [roomBusy, setRoomBusy] = useState<string | null>(null);

  const channelNames = useMemo(() => Object.fromEntries(channels.map(channel => [channel.id, channel.label])), []);

  useEffect(() => {
    fetch('/api/admin/ai-config')
      .then(async response => {
        if (!response.ok) throw new Error('Unable to load AI configuration.');
        const data = await response.json();
        const next = { alapha: '1', beta: '2' };
        for (const player of data.players || []) {
          if (player.player_slot === 'alapha' || player.player_slot === 'beta') next[player.player_slot] = player.channel_id;
        }
        setSelection(next);
        setNotice('Configuration loaded.');
      })
      .catch(error => setNotice(error.message));
  }, []);

  const loadRooms = async () => {
    const response = await fetch('/api/admin/rooms');
    const data = await response.json().catch(() => []);
    if (!response.ok) throw new Error(data.error || 'Unable to load active rooms.');
    setActiveRooms(data);
  };

  useEffect(() => {
    const refresh = () => { void loadRooms().catch(error => setNotice(error.message)); };
    refresh();
    const timer = window.setInterval(refresh, 3000);
    const onVisibility = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility); };
  }, []);

  const savePlayer = async (slot: PlayerSlot) => {
    setNotice(`Saving ${slot === 'alapha' ? 'Alapha' : 'Beta'}…`);
    const response = await fetch('/api/admin/ai-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerSlot: slot, channelId: selection[slot] }),
    });
    const data = await response.json().catch(() => ({}));
    const message = response.ok ? `${slot === 'alapha' ? 'Alapha' : 'Beta'} now uses ${channelNames[selection[slot]]}.` : data.error || 'Unable to save configuration.';
    setNotice(message);
    notify(response.ok ? { tone: 'success', title: 'Opponent routing saved', description: message } : { tone: 'destructive', title: 'Could not save routing', description: message });
  };

  const testChannel = async (channelId: string) => {
    setTesting(channelId);
    setNotice(`Testing ${channelNames[channelId]} through quota controls…`);
    try {
      const response = await fetch('/api/admin/ai-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId }),
      });
      const data = await response.json().catch(() => ({}));
      const message = response.ok ? `${channelNames[channelId]} is available (${data.totalTokens ?? 0} tokens recorded).` : data.error || `${channelNames[channelId]} test failed.`;
      setNotice(message);
      notify(response.ok ? { tone: 'success', title: 'Channel check passed', description: message } : { tone: 'destructive', title: 'Channel check failed', description: message });
    } catch {
      const message = `${channelNames[channelId]} test could not reach the server.`;
      setNotice(message);
      notify({ tone: 'destructive', title: 'Channel check failed', description: message });
    } finally {
      setTesting(null);
    }
  };

  // Confirm first, then close behind an undo window. The body re-throws on failure
  // so the deferred notice never reports a failed close as success.
  const closeRoom = async (roomId: string) => {
    const confirmed = await confirmAction({ title: 'Force-close this room?', description: 'Players are removed and the match ends for everyone.', confirmLabel: 'FORCE CLOSE', tone: 'destructive' });
    if (!confirmed) return;
    deferSensitive({
      title: 'Force-closing room',
      description: `Room ${roomId.slice(0, 8).toUpperCase()} closes when the timer ends.`,
      successTitle: 'Room closed',
      errorTitle: 'Could not close room',
      run: () => closeRoomNow(roomId),
    });
  };

  const closeRoomNow = async (roomId: string) => {
    setRoomBusy(roomId);
    let failure: string | null = null;
    try {
      const response = await fetch(`/api/admin/rooms/${encodeURIComponent(roomId)}/close`, { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      failure = response.ok ? null : data.error || 'Unable to close room.';
      setNotice(failure ?? 'Room closed.');
      await loadRooms();
    } catch {
      failure = 'Room close request could not reach the server.';
      setNotice(failure);
    } finally {
      setRoomBusy(null);
    }
    if (failure) throw new Error(failure);
  };

  const roomTone = (status: AdminRoom['status']): BadgeTone => {
    if (status === 'started') return 'success';
    if (status === 'paused') return 'warning';
    if (status === 'closed') return 'neutral';
    return 'primary';
  };

  return (
    <AppShell
      nav={[
        { key: 'home', label: 'Home', description: 'Back to home', icon: <ArrowLeft size={18} />, href: '/' },
        { key: 'admin', label: 'Command desk', description: 'Control the table', icon: <Cpu size={18} />, active: true },
      ]}
      footer={<ThemeToggle />}
    >
      <PageHeader
        eyebrow="Command desk / administrator"
        title="Control the table."
        description="Manage live rooms and set how Alapha and Beta respond in direct matches."
        actions={<a href="/" className={buttonClassName('outline', 'default', 'h-10 px-3 text-xs font-semibold')}><ArrowLeft size={16} />Home</a>}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatTile icon={<Users size={18} />} label="Active rooms" value={activeRooms.length} />
        <StatTile hero icon={<Bot size={18} />} label="Direct opponents" value={2} />
        <StatTile icon={<Cpu size={18} />} label="Available channels" value={channels.length} />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[1.2fr_.8fr]">
        <Card className="p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Room operations</p><h2 className="mt-1 flex items-center gap-2 text-xl font-semibold tracking-tight"><Users size={20} className="text-primary" />Active rooms</h2></div><Button variant="outline" size="icon" onClick={() => void loadRooms().catch(error => setNotice(error.message))} aria-label="Refresh active rooms"><RefreshCw size={17} /></Button></div>
          <div className="grid gap-3">
            {activeRooms.map(room => { const status = roomStatusLabel(room.status); return <article key={room.id} className="rounded-xl border border-border/60 bg-background/50 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><Badge tone={roomTone(room.status)}>{status.text}</Badge><p className="mt-2 font-mono text-micro uppercase tracking-[0.12em] text-muted-foreground">Room {room.id.slice(0, 8).toUpperCase()}</p></div><span className="text-xs tabular-nums text-muted-foreground">{room.members.length + room.aiNames.length}/{room.seatCount} seats</span></div><p className="mt-3 text-sm">Hosted by <strong className="font-semibold">{room.ownerName}</strong></p><p className="mt-1 break-words text-xs leading-5 text-muted-foreground">Players: {room.members.map(member => member.name).join(', ') || 'none'} · AI {room.aiNames.join(', ') || 'none'}</p><div className="mt-4 grid grid-cols-2 gap-2 sm:flex"><Button variant="outline" disabled={room.status === 'open'} onClick={() => { window.location.href = `/game/${encodeURIComponent(room.id)}?watch=admin`; }} className="min-h-11 gap-2 px-3 text-xs font-semibold"><Eye size={15} />Watch</Button><Button variant="outline" disabled={roomBusy === room.id} onClick={() => void closeRoom(room.id)} className="min-h-11 gap-2 px-3 text-xs font-semibold text-log-error hover:text-log-error"><Power size={15} />{roomBusy === room.id ? 'Closing…' : 'Close room'}</Button></div></article>; })}
            {activeRooms.length === 0 && <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">No active rooms. New tables will appear here.</p>}
          </div>
        </Card>

        <div className="grid gap-5">
          <Card className="p-5 sm:p-6">
            <div className="mb-5"><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Direct protocol</p><h2 className="mt-1 flex items-center gap-2 text-xl font-semibold tracking-tight"><Cpu size={20} className="text-primary" />Opponent routing</h2></div>
            <div className="space-y-3">{players.map(player => <div key={player.slot} className="rounded-xl border border-border/60 bg-background/50 p-4"><label htmlFor={`channel-${player.slot}`} className="mb-2 block text-sm font-semibold">{player.label}</label><div className="flex flex-col gap-2 sm:flex-row"><div className="min-w-0 flex-1"><Select id={`channel-${player.slot}`} value={selection[player.slot] || player.fallback} onChange={event => setSelection(current => ({ ...current, [player.slot]: event.target.value }))}>{channels.map(channel => <option key={channel.id} value={channel.id}>{channel.label}</option>)}</Select></div><Button onClick={() => void savePlayer(player.slot)} className="min-h-11 gap-2 px-4 text-sm font-bold"><Save size={16} />Save</Button></div></div>)}</div>
          </Card>

          <Card className="p-5 sm:p-6"><div className="mb-5"><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Diagnostics</p><h2 className="mt-1 flex items-center gap-2 text-xl font-semibold tracking-tight"><FlaskConical size={20} className="text-primary" />Channel checks</h2></div><div className="space-y-2">{channels.map(channel => <InsetPanel key={channel.id} className="flex items-center justify-between gap-3 bg-background/50 p-3"><span className="text-sm font-semibold">{channel.label}</span><Button variant="outline" disabled={testing !== null} onClick={() => void testChannel(channel.id)} className="min-h-11 gap-2 px-3 text-xs font-semibold"><FlaskConical size={15} />{testing === channel.id ? 'Testing…' : 'Test'}<ArrowRight size={14} /></Button></InsetPanel>)}</div></Card>
        </div>
      </div>
      <p className="mt-5 rounded-xl border border-border/60 bg-card px-4 py-3 text-sm text-muted-foreground" aria-live="polite">{notice}</p>
    </AppShell>
  );
}
