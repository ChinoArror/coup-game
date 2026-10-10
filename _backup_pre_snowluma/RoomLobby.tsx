import { Bot, Check, Copy, Crown, LogOut, Play, RotateCcw, ShieldAlert, UserMinus, Users, UserRound } from 'lucide-react';
import type { RoomDetails } from './services/roomClient';
import { roomApi } from './services/roomClient';
import { roomAiLabels, roomMobileClasses, roomStatusLabel, summarizeRoomSeats } from './services/roomUi';

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
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#111820] shadow-2xl">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] px-4 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0"><p className="font-mono text-[10px] uppercase tracking-[0.15em] text-slate-500">Room {room.id.slice(0, 8).toUpperCase()}</p><h2 className="truncate text-lg font-semibold text-white">{room.status === 'open' ? 'Waiting for players' : room.status === 'started' ? 'Match in progress' : room.status}</h2></div>
          <span className={`hidden rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold sm:inline-flex ${status.className}`}>{status.text}</span>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          {canInvite && <button disabled={busy || !inviteReady} onClick={onInvite} className={`${roomMobileClasses.touchTarget} inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-amber-200/20 bg-amber-200/[0.07] px-3 text-xs font-semibold text-amber-100 transition hover:bg-amber-200/[0.13] disabled:opacity-50 sm:flex-none`} aria-label={inviteCopied ? 'Invite copied; create another invite' : inviteReady ? 'Create and copy a one-use invite' : 'Preparing invite'}>{inviteCopied ? <Check size={15} /> : <Copy size={15} />}{inviteCopied ? 'COPIED · NEW INVITE' : 'COPY GUEST INVITE'}</button>}
          {owner ? <button disabled={busy} onClick={onClose} className={`${roomMobileClasses.touchTarget} inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold text-red-200 transition hover:bg-red-400/10 sm:flex-none`}><ShieldAlert size={15} />CLOSE</button> : <button disabled={busy} onClick={onLeave} className={`${roomMobileClasses.touchTarget} inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.06] sm:flex-none`}><LogOut size={15} />LEAVE</button>}
        </div>
      </header>

      <div className="p-4 sm:p-6">
        <div className="grid grid-cols-3 gap-2 sm:gap-3" aria-label="Room seat progress">
          <div className="rounded-2xl border border-white/[0.07] bg-black/15 p-3 sm:p-4"><p className="font-mono text-xl font-bold text-white">{occupiedSeats}<span className="text-sm font-normal text-slate-500">/{room.seatCount}</span></p><p className="mt-1 text-[10px] uppercase tracking-[0.1em] text-slate-500">Seats filled</p></div>
          <div className="rounded-2xl border border-white/[0.07] bg-black/15 p-3 sm:p-4"><p className="font-mono text-xl font-bold text-amber-100">{room.aiNames.length}</p><p className="mt-1 text-[10px] uppercase tracking-[0.1em] text-slate-500">AI agents</p></div>
          <div className="rounded-2xl border border-white/[0.07] bg-black/15 p-3 sm:p-4"><p className="font-mono text-xl font-bold text-sky-100">{seatSummary.openGuestSeats}</p><p className="mt-1 text-[10px] uppercase tracking-[0.1em] text-slate-500">Guest seats</p></div>
        </div>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-2">
          <div><p className="font-mono text-[10px] uppercase tracking-[0.15em] text-slate-500">Roster</p><h3 className="mt-1 text-base font-semibold text-white">Players at this table</h3></div>
          <p className="text-xs text-slate-500">Step clock: {room.timeControls.stepLimitMs ? `${Math.round(room.timeControls.stepLimitMs / 1000)} sec` : 'unlimited'} <span className="mx-1 text-slate-700">·</span> Total: {room.timeControls.totalLimitMs ? `${Math.round(room.timeControls.totalLimitMs / 60000)} min` : 'unlimited'}</p>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {room.members.map(member => <div key={member.uuid} className="flex min-h-[68px] items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-black/15 p-3">
            <div className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-200/10 text-sky-100"><UserRound size={18} /></span><div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{member.name}{member.uuid === room.ownerUuid && <Crown size={13} className="ml-1 inline text-amber-300" />}</p><p className={`mt-0.5 text-[10px] font-mono uppercase tracking-[0.1em] ${member.ready ? 'text-emerald-300' : 'text-slate-500'}`}>{member.uuid === room.ownerUuid ? 'Host' : 'Guest'} · {member.ready ? 'Ready' : 'Not ready'}</p></div></div>
            {owner && member.uuid !== currentUserId && <button disabled={busy} onClick={() => onKick(member.uuid)} className="grid min-h-11 min-w-11 place-items-center rounded-xl text-slate-500 transition hover:bg-red-400/10 hover:text-red-200" aria-label={`Remove ${member.name}`}><UserMinus size={16} /></button>}
          </div>)}
          {room.aiNames.map((name, index) => <div key={`${name}-${index}`} className="flex min-h-[68px] items-center gap-3 rounded-2xl border border-amber-200/10 bg-amber-200/[0.035] p-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-200/10 text-amber-100"><Bot size={18} /></span><div><p className="text-sm font-semibold text-white">AI {name}</p><p className="mt-0.5 text-[10px] font-mono uppercase tracking-[0.1em] text-amber-100/50">Channel {room.aiChannels[index]} · Agent {roomAiLabels([room.aiChannels[index]])[0]}</p></div></div>)}
          {Array.from({ length: seatSummary.openGuestSeats }, (_, index) => <div key={`open-${index}`} className="flex min-h-[68px] items-center gap-3 rounded-2xl border border-dashed border-sky-200/20 bg-sky-200/[0.025] p-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-200/[0.07] text-sky-100/70"><Users size={17} /></span><div><p className="text-sm font-semibold text-sky-100/80">Open guest seat</p><p className="mt-0.5 text-[10px] text-slate-500">Invite one player to fill this seat</p></div></div>)}
        </div>

        {owner && room.status === 'open' && <p className="mt-4 rounded-xl border border-white/[0.06] bg-black/15 p-3 text-xs leading-5 text-slate-400">{startBlockedReason}</p>}
        <div className="mt-5 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
          {room.status === 'open' && <button disabled={busy} onClick={() => onReady(!room.me?.ready)} className={`${roomMobileClasses.touchTarget} rounded-xl border border-white/10 bg-white/[0.04] px-5 text-xs font-semibold text-white transition hover:bg-white/[0.08] disabled:opacity-50`}>{room.me?.ready ? 'CANCEL READY' : 'MARK READY'}</button>}
          {owner && room.status === 'open' && <button disabled={busy || !full || notReady.length > 0} onClick={onStart} className={`${roomMobileClasses.touchTarget} inline-flex items-center justify-center gap-2 rounded-xl bg-amber-300 px-5 text-xs font-bold text-[#17130a] transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-40`}><Play size={15} />START MATCH</button>}
          {owner && room.status === 'paused' && <button disabled={busy} onClick={() => void roomApi.resume(room.id).then(() => window.location.reload())} className={`${roomMobileClasses.touchTarget} inline-flex items-center justify-center gap-2 rounded-xl bg-amber-300 px-5 text-xs font-bold text-[#17130a]`}><RotateCcw size={15} />RESUME MATCH</button>}
        </div>
      </div>
    </section>
  );
}
