import { ArrowRight, BookOpen, Bot, DoorOpen, Lock, ShieldCheck, Users } from 'lucide-react';
import ProtocolPage from './ProtocolPage';
import { createSsoLoginUrl } from './services/sso';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, WaveField } from './ui';

export default function Login({ invited = false }: { invited?: boolean }) {
  const handleSSOLogin = () => {
    window.location.href = createSsoLoginUrl(window.location.origin);
  };

  return (
    <ProtocolPage eyebrow={invited ? 'Room invitation / authentication' : 'Coup: Shadow Protocol'} title={invited ? 'Sign in to answer the invite.' : 'Play Coup with AI or friends.'} description={invited ? 'Your invitation is waiting. After sign in, you will review it before taking a seat.' : 'Challenge Alapha and Beta in a direct match, or create a private room for friends and AI players.'} status={invited ? 'Invitation saved for this tab' : 'Online bluffing game'} width="max-w-5xl" backdrop={<WaveField />}>
      <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
        <section className="ui-card rounded-2xl border border-border/60 bg-card/65 p-6 backdrop-blur-2xl sm:p-8">
          <Badge tone="primary" className="gap-2 py-1.5 pl-2.5 pr-3 text-[11px] font-medium uppercase tracking-wider"><Lock size={13} /> Authentication required</Badge>
          <h2 className="mt-8 text-2xl font-semibold tracking-tight sm:text-3xl">Ready to take your seat?</h2>
          <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">Continue with Aryuki Auth Center to access your games and room invitations.</p>
          <Button size="lg" onClick={handleSSOLogin} className="mt-8 w-full gap-3 px-5 sm:w-auto">
            <ShieldCheck size={18} />Sign in with Aryuki<ArrowRight size={17} />
          </Button>
        </section>
        <Card className="p-6 sm:p-7">
          <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary"><DoorOpen size={21} /></span>
          <p className="mt-6 text-xs font-medium uppercase tracking-wider text-muted-foreground">Next step</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">{invited ? 'Review your invitation' : 'Choose your game'}</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{invited ? 'Signing in returns you to a dedicated invitation screen. Accept there to enter the room lobby.' : 'Your command desk will show direct play, room creation, and saved matches.'}</p>
        </Card>
      </div>
      {!invited && <section aria-labelledby="game-modes" className="mt-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><h2 id="game-modes" className="text-2xl font-semibold tracking-tight">Two ways to take your seat</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Every match starts with two hidden influence cards. Bluff, challenge claims, and stay in the game until the last player remains.</p></div>
          <a href="/rules" className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-transparent px-4 text-sm font-medium outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"><BookOpen size={17} />Read the rules<ArrowRight size={15} /></a>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Bot size={20} /></span><CardTitle className="mt-3 text-lg">Direct match</CardTitle></CardHeader>
            <CardContent><CardDescription className="text-sm leading-6">Play against Alapha and Beta, two AI opponents at a three-player table.</CardDescription></CardContent>
          </Card>
          <Card>
            <CardHeader><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Users size={20} /></span><CardTitle className="mt-3 text-lg">Private room</CardTitle></CardHeader>
            <CardContent><CardDescription className="text-sm leading-6">Create a room for three to six players, invite friends, and add AI seats.</CardDescription></CardContent>
          </Card>
        </div>
      </section>}
    </ProtocolPage>
  );
}
