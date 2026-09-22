import { Copy, Crown, LogOut, Play, ShieldAlert, UserMinus, Users } from 'lucide-react';
import type { RoomDetails } from './services/roomClient';

export default function RoomLobby({ room, currentUserId, busy, onReady, onStart, onClose, onLeave, onKick, onInvite }: {
  room: RoomDetails; currentUserId: string; busy: boolean;
  onReady: (ready: boolean) => void; onStart: () => void; onClose: () => void; onLeave: () => void; onKick: (id: string) => void; onInvite: () => void;
}) {
  const isOwner = room.ownerUuid === currentUserId;
  const seatsTaken = room.members.length + room.aiNames.length;
  const canStart = isOwner && seatsTaken === room.seatCount && room.members.every(member => member.ready);
  return <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4">
      <div><p className="font-mono text-xs tracking-widest text-slate-500">ROOM {room.id.slice(0, 8).toUpperCase()}</p><h2 className="mt-1 font-mono text-xl font-bold text-amber-500">{room.status === 'open' ? 'WAITING FOR AGENTS' : room.status.toUpperCase()}</h2></div>
      <div className="flex gap-2">
        {isOwner && <button disabled={busy} onClick={onInvite} className="inline-flex items-center gap-2 rounded-lg border border-amber-500/40 px-3 py-2 text-xs font-bold text-amber-400 hover:bg-amber-500/10"><Copy size={15}/>INVITE</button>}
        {isOwner ? <button disabled={busy} onClick={onClose} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-950/30"><ShieldAlert size={15}/>CLOSE</button> : <button disabled={busy} onClick={onLeave} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800"><LogOut size={15}/>LEAVE</button>}
      </div>
    </div>
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      {room.members.map(member => <div key={member.uuid} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950 p-3">
        <div className="flex items-center gap-3"><Users size={17} className="text-slate-500"/><div>
          <p className="font-semibold text-slate-100">{member.name} {member.uuid === room.ownerUuid && <Crown size={13} className="ml-1 inline text-amber-500"/>}</p>
          <p className={member.ready ? 'font-mono text-[11px] text-emerald-400' : 'font-mono text-[11px] text-slate-500'}>{member.ready ? 'READY' : 'NOT READY'}</p>
        </div></div>
        {isOwner && member.uuid !== currentUserId && <button disabled={busy} onClick={() => onKick(member.uuid)} title="Remove member" className="rounded p-2 text-slate-500 hover:bg-red-950/30 hover:text-red-400"><UserMinus size={16}/></button>}
      </div>)}
      {room.aiNames.map((name, index) => <div key={name} className="flex items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3"><div className="grid h-8 w-8 place-items-center rounded-full bg-amber-500/20 font-mono font-bold text-amber-400">{name}</div><div><p className="font-semibold text-slate-100">AI {name}</p><p className="font-mono text-[11px] text-slate-500">CHANNEL {room.aiChannels[index]}</p></div></div>)}
    </div>
    <p className="mt-4 text-xs text-slate-500">{seatsTaken}/{room.seatCount} seats · step {room.timeControls.stepLimitMs ? `${Math.round(room.timeControls.stepLimitMs / 1000)}s` : 'unlimited'} · total {room.timeControls.totalLimitMs ? `${Math.round(room.timeControls.totalLimitMs / 60000)}m` : 'unlimited'}</p>
    <div className="mt-5 flex flex-wrap gap-3"><button disabled={busy} onClick={() => onReady(!room.me.ready)} className={`rounded-lg px-4 py-2 font-mono text-xs font-bold ${room.me.ready ? 'bg-emerald-900/40 text-emerald-300' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}>{room.me.ready ? 'CANCEL READY' : 'READY'}</button>{isOwner && <button disabled={busy || !canStart} onClick={onStart} className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 font-mono text-xs font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"><Play size={15}/>START MATCH</button>}</div>
  </section>;
}
