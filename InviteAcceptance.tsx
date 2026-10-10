import { useEffect, useState } from 'react';
import { ArrowRight, Bot, DoorOpen, ShieldCheck, Users, X } from 'lucide-react';
import ProtocolPage from './ProtocolPage';
import { invitePathForToken, pendingInviteStorageKey } from './services/appRouting';
import { roomApi, type RoomStatus } from './services/roomClient';
import { Button, Card, CardContent, CardHeader, CardTitle, InsetPanel } from './ui';

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
    <ProtocolPage eyebrow="Room invitation / decision" title="You have a seat at the table." description="Review this invitation before joining. The host will start the match after every player is ready." status="Invitation received" actions={<Button variant="outline" onClick={decline} className="h-11 px-3 text-xs font-semibold"><X size={16} />Decline</Button>} width="max-w-5xl">
      <div className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
        <section className="ui-card overflow-hidden rounded-2xl border border-border/60 bg-card/65 p-6 backdrop-blur-2xl sm:p-8" aria-live="polite">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-log-info"><DoorOpen size={13} /> Guest invitation</span>
          {loading ? <p className="mt-8 text-sm text-muted-foreground">Checking your invitation…</p> : invitation && <>
            <h2 className="mt-8 text-2xl font-semibold tracking-tight sm:text-3xl">{watchOnly ? 'The match is underway.' : 'Join this room?'}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{watchOnly ? 'This room has already started. Accept to watch the live match.' : invitation.canJoin ? 'Accept to take an open player seat, then mark yourself ready in the room lobby.' : 'You already have a seat in this room. Continue to its lobby.'}</p>
            <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <InsetPanel className="bg-background/60 p-4"><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Room code</p><p className="mt-2 truncate font-mono text-sm font-semibold">{invitation.room.id.slice(0, 8).toUpperCase()}</p></InsetPanel>
              <InsetPanel className="bg-background/60 p-4"><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Seats</p><p className="mt-2 flex items-center gap-2 text-sm font-semibold tabular-nums"><Users size={15} />{invitation.room.seatCount} players</p></InsetPanel>
              <InsetPanel className="col-span-2 bg-background/60 p-4 sm:col-span-1"><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">AI agents</p><p className="mt-2 flex items-center gap-2 text-sm font-semibold tabular-nums"><Bot size={15} />{aiCount}</p></InsetPanel>
            </div>
          </>}
          {error && <p role="alert" className="mt-6 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-log-error">{error}</p>}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" disabled={!invitation || busy} onClick={() => void accept()} className="flex-1 gap-2 px-5"><ShieldCheck size={18} />{busy ? 'Joining room…' : watchOnly ? 'Accept and watch' : 'Accept invitation'}<ArrowRight size={17} /></Button>
            <Button size="lg" variant="outline" onClick={decline} className="px-5">Decline</Button>
          </div>
        </section>
        <Card>
          <CardHeader className="pt-6"><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">After you accept</p><CardTitle className="mt-2 text-xl">The next moves</CardTitle></CardHeader>
          <CardContent className="pt-6">
            <ol className="space-y-5 text-sm leading-6 text-muted-foreground">
              <li className="flex gap-3"><span className="font-mono text-primary">01</span><span>Enter the room with your own player seat.</span></li>
              <li className="flex gap-3"><span className="font-mono text-primary">02</span><span>Review the players and mark yourself ready.</span></li>
              <li className="flex gap-3"><span className="font-mono text-primary">03</span><span>The host begins when all seats are filled and ready.</span></li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </ProtocolPage>
  );
}
