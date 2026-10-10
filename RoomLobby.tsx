import { Bot, Check, Copy, Crown, LogOut, Play, RotateCcw, ShieldAlert, UserMinus, Users, UserRound } from 'lucide-react';
import type { RoomDetails } from './services/roomClient';
import { roomApi } from './services/roomClient';
import { roomAiLabels, roomStatusLabel, summarizeRoomSeats } from './services/roomUi';
import { Badge, Button, InsetPanel, notifyResult, type BadgeTone } from './ui';
import { cn } from './ui/cn';

const statusTone = (status: RoomDetails['status']): BadgeTone => {
  if (status === 'started') return 'success';
  if (status === 'paused') return 'warning';
  if (status === 'closed') return 'neutral';
  return 'primary';
};

export default function RoomLobby({ room, currentUserId, busy, inviteCopied, inviteReady, onReady, onStart, onClose, onLeave, onKick, onInvite }: {
  room: RoomDetails;
  currentUserId: string;
  busy: boolean;
  inviteCopied: boolean;
  inviteReady: boolean;
  onReady: (ready: boolean) => void;
  onStart: () => void;
  onClose: () => void;
  onLeave: () => void;
  onKick: (id: string) => void;
  onInvite: () => void;
}) {
  const owner = room.ownerUuid === currentUserId;
  const seatSummary = summarizeRoomSeats(room.seatCount, room.aiChannels, room.members.length);
  const occupiedSeats = room.members.length + room.aiNames.length;
  const full = occupiedSeats === room.seatCount;
  const notReady = room.members.filter(member => !member.ready);
  const status = roomStatusLabel(room.status);
  const canInvite = owner && room.status === 'open' && seatSummary.openGuestSeats > 0;
  const startBlockedReason = !full
    ? `${seatSummary.openGuestSeats} guest ${seatSummary.openGuestSeats === 1 ? 'seat is' : 'seats are'} still open. Send a separate invite link to each guest.`
    : notReady.length > 0
      ? `Waiting for ${notReady.map(member => member.name).join(', ')} to mark ready.`
      : 'Every seat is filled and ready. You can start the match.';

  return (
    <section className="ui-card overflow-hidden rounded-2xl border border-border/60 bg-card">
      <header className="flex flex-wrap items-center justify-between gap-4 bg-muted/40 px-4 py-4 sm:px-6">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <div className="min-w-0"><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Room {room.id.slice(0, 8).toUpperCase()}</p><h2 className="truncate text-lg font-semibold tracking-tight">{room.status === 'open' ? 'Waiting for players' : room.status === 'started' ? 'Match in progress' : room.status}</h2></div>
          <span className="hidden sm:inline-flex"><Badge tone={statusTone(room.status)}>{status.text}</Badge></span>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          {canInvite && <Button variant="outline" disabled={busy || !inviteReady} onClick={onInvite} className="min-h-11 flex-1 gap-2 px-3 text-xs font-semibold sm:flex-none" aria-label={inviteCopied ? 'Invite copied; create another invite' : inviteReady ? 'Create and copy a one-use invite' : 'Preparing invite'}>{inviteCopied ? <Check size={15} /> : <Copy size={15} />}{inviteCopied ? 'COPIED · NEW INVITE' : 'COPY GUEST INVITE'}</Button>}
          {owner ? <Button variant="ghost" disabled={busy} onClick={onClose} className="min-h-11 flex-1 gap-2 px-3 text-xs font-semibold text-log-error hover:text-log-error sm:flex-none"><ShieldAlert size={15} />CLOSE</Button> : <Button variant="ghost" disabled={busy} onClick={onLeave} className="min-h-11 flex-1 gap-2 px-3 text-xs font-semibold text-muted-foreground hover:text-foreground sm:flex-none"><LogOut size={15} />LEAVE</Button>}
        </div>
      </header>

      <div className="p-4 sm:p-6">
        <div className="grid grid-cols-3 gap-2 sm:gap-3" aria-label="Room seat progress">
          <InsetPanel className="bg-background/50 p-3 sm:p-4"><p className="font-mono text-xl font-bold tabular-nums">{occupiedSeats}<span className="text-sm font-normal text-muted-foreground">/{room.seatCount}</span></p><p className="mt-1 text-micro uppercase tracking-[0.1em] text-muted-foreground">Seats filled</p></InsetPanel>
          <InsetPanel className="bg-background/50 p-3 sm:p-4"><p className="font-mono text-xl font-bold tabular-nums text-primary">{room.aiNames.length}</p><p className="mt-1 text-micro uppercase tracking-[0.1em] text-muted-foreground">AI agents</p></InsetPanel>
          <InsetPanel className="bg-background/50 p-3 sm:p-4"><p className="font-mono text-xl font-bold tabular-nums text-primary">{seatSummary.openGuestSeats}</p><p className="mt-1 text-micro uppercase tracking-[0.1em] text-muted-foreground">Guest seats</p></InsetPanel>
        </div>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-2">
          <div><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Roster</p><h3 className="mt-1 text-base font-semibold">Players at this table</h3></div>
          <p className="text-xs text-muted-foreground">Step clock: {room.timeControls.stepLimitMs ? `${Math.round(room.timeControls.stepLimitMs / 1000)} sec` : 'unlimited'} <span className="mx-1 opacity-50">·</span> Total: {room.timeControls.totalLimitMs ? `${Math.round(room.timeControls.totalLimitMs / 60000)} min` : 'unlimited'}</p>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {room.members.map(member => <div key={member.uuid} className="flex min-h-[68px] items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/50 p-3">
            <div className="flex min-w-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><UserRound size={18} /></span><div className="min-w-0"><p className="truncate text-sm font-semibold">{member.name}{member.uuid === room.ownerUuid && <Crown size={13} className="ml-1 inline text-log-warn" />}</p><p className={cn('mt-0.5 font-mono text-micro uppercase tracking-[0.1em]', member.ready ? 'text-log-success' : 'text-muted-foreground')}>{member.uuid === room.ownerUuid ? 'Host' : 'Guest'} · {member.ready ? 'Ready' : 'Not ready'}</p></div></div>
            {owner && member.uuid !== currentUserId && <Button variant="ghost" size="icon" disabled={busy} onClick={() => onKick(member.uuid)} className="text-muted-foreground hover:bg-destructive/10 hover:text-log-error" aria-label={`Remove ${member.name}`}><UserMinus size={16} /></Button>}
          </div>)}
          {room.aiNames.map((name, index) => <div key={`${name}-${index}`} className="flex min-h-[68px] items-center gap-3 rounded-xl border border-border/60 bg-muted/40 p-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Bot size={18} /></span><div><p className="text-sm font-semibold">AI {name}</p><p className="mt-0.5 font-mono text-micro uppercase tracking-[0.1em] text-muted-foreground">Channel {room.aiChannels[index]} · Agent {roomAiLabels([room.aiChannels[index]])[0]}</p></div></div>)}
          {Array.from({ length: seatSummary.openGuestSeats }, (_, index) => <div key={`open-${index}`} className="flex min-h-[68px] items-center gap-3 rounded-xl border border-dashed border-primary/30 bg-primary/5 p-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Users size={17} /></span><div><p className="text-sm font-semibold text-primary">Open guest seat</p><p className="mt-0.5 text-micro text-muted-foreground">Invite one player to fill this seat</p></div></div>)}
        </div>

        {owner && room.status === 'open' && <p className="mt-4 rounded-xl bg-background/50 p-3 text-xs leading-5 text-muted-foreground">{startBlockedReason}</p>}
        <div className="mt-5 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
          {room.status === 'open' && <Button variant="outline" disabled={busy} onClick={() => onReady(!room.me?.ready)} className="min-h-11 px-5 text-xs font-semibold">{room.me?.ready ? 'CANCEL READY' : 'MARK READY'}</Button>}
          {owner && room.status === 'open' && <Button disabled={busy || !full || notReady.length > 0} onClick={onStart} className="min-h-11 gap-2 px-5 text-xs font-bold"><Play size={15} />START MATCH</Button>}
          {owner && room.status === 'paused' && <Button onClick={() => void notifyResult(() => roomApi.resume(room.id), { success: 'Match resumed', error: 'Could not resume match' }).then(() => window.setTimeout(() => window.location.reload(), 600), () => undefined)} className="min-h-11 gap-2 px-5 text-xs font-bold"><RotateCcw size={15} />RESUME MATCH</Button>}
        </div>
      </div>
    </section>
  );
}
