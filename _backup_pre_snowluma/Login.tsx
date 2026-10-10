import { ArrowRight, BookOpen, Bot, DoorOpen, Lock, ShieldCheck, Users } from 'lucide-react';
import ProtocolPage from './ProtocolPage';
import { createSsoLoginUrl } from './services/sso';

export default function Login({ invited = false }: { invited?: boolean }) {
  const handleSSOLogin = () => {
    window.location.href = createSsoLoginUrl(window.location.origin);
  };

  return (
    <ProtocolPage eyebrow={invited ? 'Room invitation / authentication' : 'Coup: Shadow Protocol'} title={invited ? 'Sign in to answer the invite.' : 'Play Coup with AI or friends.'} description={invited ? 'Your invitation is waiting. After sign in, you will review it before taking a seat.' : 'Challenge Alapha and Beta in a direct match, or create a private room for friends and AI players.'} status={invited ? 'Invitation saved for this tab' : 'Online bluffing game'} width="max-w-5xl">
      <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
        <section className="rounded-3xl border border-amber-200/20 bg-gradient-to-br from-[#282116] via-[#171713] to-[#10151a] p-6 shadow-[0_24px_80px_rgba(0,0,0,.24)] sm:p-8">
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-200/15 bg-black/20 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-amber-200/80"><Lock size={13} /> Authentication required</span>
          <h2 className="mt-8 text-2xl font-semibold text-white sm:text-3xl">Ready to take your seat?</h2>
          <p className="mt-3 max-w-lg text-sm leading-6 text-slate-400">Continue with Aryuki Auth Center to access your games and room invitations.</p>
          <button onClick={handleSSOLogin} className="mt-8 inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-xl bg-amber-300 px-5 text-sm font-bold text-[#17130a] transition hover:bg-amber-200 sm:w-auto"><ShieldCheck size={18} />Sign in with Aryuki<ArrowRight size={17} /></button>
        </section>
        <aside className="rounded-3xl border border-white/10 bg-[#111820] p-6 sm:p-7"><span className="grid h-12 w-12 place-items-center rounded-2xl border border-amber-200/15 bg-amber-200/[0.06] text-amber-200"><DoorOpen size={21} /></span><p className="mt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">Next step</p><h2 className="mt-2 text-xl font-semibold text-white">{invited ? 'Review your invitation' : 'Choose your game'}</h2><p className="mt-3 text-sm leading-6 text-slate-400">{invited ? 'Signing in returns you to a dedicated invitation screen. Accept there to enter the room lobby.' : 'Your command desk will show direct play, room creation, and saved matches.'}</p></aside>
      </div>
      {!invited && <section aria-labelledby="game-modes" className="mt-10 border-t border-white/10 pt-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><h2 id="game-modes" className="text-2xl font-semibold text-white">Two ways to take your seat</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Every match starts with two hidden influence cards. Bluff, challenge claims, and stay in the game until the last player remains.</p></div>
          <a href="/rules" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-amber-200/20 px-4 text-sm font-semibold text-amber-200 hover:bg-amber-200/[0.08]"><BookOpen size={17} />Read the rules<ArrowRight size={15} /></a>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <article className="rounded-2xl border border-white/10 bg-[#111820] p-5"><Bot size={21} className="text-amber-200" /><h3 className="mt-4 text-lg font-semibold text-white">Direct match</h3><p className="mt-2 text-sm leading-6 text-slate-400">Play against Alapha and Beta, two AI opponents at a three-player table.</p></article>
          <article className="rounded-2xl border border-white/10 bg-[#111820] p-5"><Users size={21} className="text-amber-200" /><h3 className="mt-4 text-lg font-semibold text-white">Private room</h3><p className="mt-2 text-sm leading-6 text-slate-400">Create a room for three to six players, invite friends, and add AI seats.</p></article>
        </div>
      </section>}
    </ProtocolPage>
  );
}
