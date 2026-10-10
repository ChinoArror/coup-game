import { useEffect, useState } from 'react';
import { ArrowRight, Bot, DoorOpen, ShieldCheck, Users, X } from 'lucide-react';
import ProtocolPage from './ProtocolPage';
import { invitePathForToken, pendingInviteStorageKey } from './services/appRouting';
import { roomApi, type RoomStatus } from './services/roomClient';

type Invitation = {
  room: { id: string; status: RoomStatus; seatCount: number; aiChannels: string[] };
  canJoin: boolean;
  canWatch: boolean;
};

export default function InviteAcceptance({ token }: { token: string }) {
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    if (!invitePathForToken(token)) {
      setError('This invitation link is invalid. Ask the host for a new link.');
      setLoading(false);
      return;
    }
    void roomApi.resolveInvite(token)
      .then(result => { if (active) setInvitation(result); })
      .catch(reason => { if (active) setError(reason.message || 'This invitation is unavailable.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  const forgetInvite = () => {
    try { sessionStorage.removeItem(pendingInviteStorageKey); } catch { /* Storage may be disabled. */ }
  };

  const decline = () => {
    forgetInvite();
    window.location.assign('/');
  };

  const accept = async () => {
    if (!invitation || busy) return;
    setBusy(true);
    setError('');
    try {
      const { room, canJoin, canWatch } = invitation;
      if (canJoin) await roomApi.join(room.id, token);
      forgetInvite();
      const roomPath = `/game/${encodeURIComponent(room.id)}`;
      window.location.assign(canWatch ? `${roomPath}?watch=${encodeURIComponent(token)}` : roomPath);
    } catch (reason: any) {
      setError(reason.message || 'Unable to accept this invitation.');
      setBusy(false);
    }
  };

  const watchOnly = Boolean(invitation?.canWatch);
  const aiCount = invitation?.room.aiChannels.length || 0;

  return (
    <ProtocolPage eyebrow="Room invitation / decision" title="You have a seat at the table." description="Review this invitation before joining. The host will start the match after every player is ready." status="Invitation received" actions={<button onClick={decline} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.05] hover:text-white"><X size={16} />Decline</button>} width="max-w-5xl">
      <div className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
        <section className="overflow-hidden rounded-3xl border border-amber-200/20 bg-gradient-to-br from-[#282116] via-[#171713] to-[#10151a] p-6 shadow-[0_24px_80px_rgba(0,0,0,.24)] sm:p-8" aria-live="polite">
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-200/15 bg-black/20 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-amber-200/80"><DoorOpen size={13} /> Guest invitation</span>
          {loading ? <p className="mt-8 text-sm text-slate-400">Checking your invitation…</p> : invitation && <>
            <h2 className="mt-8 text-2xl font-semibold text-white sm:text-3xl">{watchOnly ? 'The match is underway.' : 'Join this room?'}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">{watchOnly ? 'This room has already started. Accept to watch the live match.' : invitation.canJoin ? 'Accept to take an open player seat, then mark yourself ready in the room lobby.' : 'You already have a seat in this room. Continue to its lobby.'}</p>
            <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-4"><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-amber-200/55">Room code</p><p className="mt-2 truncate font-mono text-sm font-semibold text-white">{invitation.room.id.slice(0, 8).toUpperCase()}</p></div>
              <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-4"><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-amber-200/55">Seats</p><p className="mt-2 flex items-center gap-2 text-sm font-semibold text-white"><Users size={15} />{invitation.room.seatCount} players</p></div>
              <div className="col-span-2 rounded-2xl border border-white/[0.08] bg-black/20 p-4 sm:col-span-1"><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-amber-200/55">AI agents</p><p className="mt-2 flex items-center gap-2 text-sm font-semibold text-white"><Bot size={15} />{aiCount}</p></div>
            </div>
          </>}
          {error && <p role="alert" className="mt-6 rounded-xl border border-red-300/20 bg-red-300/[0.07] p-4 text-sm text-red-100">{error}</p>}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button disabled={!invitation || busy} onClick={() => void accept()} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-amber-300 px-5 text-sm font-bold text-[#17130a] transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-40"><ShieldCheck size={18} />{busy ? 'Joining room…' : watchOnly ? 'Accept and watch' : 'Accept invitation'}<ArrowRight size={17} /></button>
            <button onClick={decline} className="min-h-12 rounded-xl border border-white/10 px-5 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.05] hover:text-white">Decline</button>
          </div>
        </section>
        <aside className="rounded-3xl border border-white/10 bg-[#111820] p-6 sm:p-7">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">After you accept</p>
          <h2 className="mt-2 text-xl font-semibold text-white">The next moves</h2>
          <ol className="mt-6 space-y-5 text-sm leading-6 text-slate-400">
            <li className="flex gap-3"><span className="font-mono text-amber-200">01</span><span>Enter the room with your own player seat.</span></li>
            <li className="flex gap-3"><span className="font-mono text-amber-200">02</span><span>Review the players and mark yourself ready.</span></li>
            <li className="flex gap-3"><span className="font-mono text-amber-200">03</span><span>The host begins when all seats are filled and ready.</span></li>
          </ol>
        </aside>
      </div>
    </ProtocolPage>
  );
}
