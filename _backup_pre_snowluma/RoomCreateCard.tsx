import { Bot, Check, ChevronDown, Plus, UserRound, Users } from 'lucide-react';
import { roomAiLabels, summarizeRoomSeats } from './services/roomUi';

const channels = [
  { id: '1', label: 'Gemini' },
  { id: '2', label: 'DeepSeek' },
  { id: '3', label: 'OpenAI' },
];

type Props = {
  seatCount: number;
  selected: string[];
  stepSeconds: string;
  totalMinutes: string;
  busy: boolean;
  onSeatCountChange: (count: number) => void;
  onToggleAi: (channel: string) => void;
  onStepSecondsChange: (value: string) => void;
  onTotalMinutesChange: (value: string) => void;
  onCreate: () => void;
};

export default function RoomCreateCard({ seatCount, selected, stepSeconds, totalMinutes, busy, onSeatCountChange, onToggleAi, onStepSecondsChange, onTotalMinutesChange, onCreate }: Props) {
  const seats = summarizeRoomSeats(seatCount, selected);
  const maxAi = Math.min(3, seatCount - 1);

  return (
    <form onSubmit={event => { event.preventDefault(); if (!busy && seats.valid) onCreate(); }} className="rounded-3xl border border-white/10 bg-[#111820] p-5 shadow-xl sm:p-6">
      <header className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-amber-200/15 bg-amber-200/10 text-amber-200"><Plus size={20} /></span>
        <div><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-amber-200/65">New table</p><h2 className="mt-1 text-xl font-semibold text-white">Build your room</h2><p className="mt-1 text-sm text-slate-400">Choose who fills each seat. You host the table.</p></div>
      </header>

      <fieldset className="mt-6">
        <legend className="mb-2 flex w-full items-center justify-between text-xs font-semibold uppercase tracking-[0.12em] text-slate-300"><span>Total seats</span><span className="font-mono text-amber-200">{seatCount} players</span></legend>
        <div className="grid grid-cols-4 gap-2">
          {[3, 4, 5, 6].map(count => <button key={count} type="button" aria-pressed={seatCount === count} onClick={() => onSeatCountChange(count)} className={`min-h-12 rounded-xl border font-mono text-sm font-bold transition ${seatCount === count ? 'border-amber-200/60 bg-amber-200/15 text-amber-100 shadow-[inset_0_0_0_1px_rgba(253,230,138,.1)]' : 'border-white/10 bg-black/10 text-slate-400 hover:border-white/25 hover:text-white'}`}>{count}</button>)}
        </div>
      </fieldset>

      <fieldset className="mt-6">
        <legend className="mb-2 flex w-full items-center justify-between text-xs font-semibold uppercase tracking-[0.12em] text-slate-300"><span>AI agents</span><span className="font-normal normal-case tracking-normal text-slate-500">Up to {maxAi}</span></legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {channels.map((channel, index) => {
            const isSelected = selected.includes(channel.id);
            const isDisabled = !isSelected && selected.length >= maxAi;
            return <button key={channel.id} type="button" aria-pressed={isSelected} disabled={isDisabled} onClick={() => onToggleAi(channel.id)} className={`flex min-h-12 items-center justify-between gap-2 rounded-xl border px-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${isSelected ? 'border-amber-200/45 bg-amber-200/10 text-amber-100' : 'border-white/10 bg-black/10 text-slate-300 hover:border-white/25'}`}>
              <span className="flex min-w-0 items-center gap-2"><Bot size={16} className={isSelected ? 'shrink-0 text-amber-200' : 'shrink-0 text-slate-500'} /><span className="min-w-0"><span className="block truncate text-xs font-semibold">AI {roomAiLabels([channel.id])[0]}</span><span className="block truncate text-[10px] text-slate-500">{channel.label}</span></span></span>
              {isSelected && <Check size={15} className="shrink-0" />}
              {!isSelected && index === 2 && <span className="sr-only">Optional</span>}
            </button>;
          })}
        </div>
      </fieldset>

      <section aria-live="polite" className="mt-5 rounded-2xl border border-white/[0.08] bg-black/20 p-4">
        <div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">Seat plan</h3><span className="font-mono text-[10px] text-slate-500">{seats.totalSeats} total</span></div>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-white/[0.04] p-3"><UserRound size={15} className="text-sky-200" /><p className="mt-2 font-mono text-lg font-bold text-white">1</p><p className="text-[10px] text-slate-500">You · host</p></div>
          <div className="rounded-xl bg-white/[0.04] p-3"><Bot size={15} className="text-amber-200" /><p className="mt-2 font-mono text-lg font-bold text-white">{seats.aiSeats}</p><p className="text-[10px] text-slate-500">AI agents</p></div>
          <div className="rounded-xl bg-white/[0.04] p-3"><Users size={15} className="text-emerald-200" /><p className="mt-2 font-mono text-lg font-bold text-white">{seats.openGuestSeats}</p><p className="text-[10px] text-slate-500">Guest seats</p></div>
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-400">Invite one human for each open guest seat. Each invite link admits one player.</p>
      </section>

      <details className="group mt-4 rounded-xl border border-white/[0.08] bg-black/10">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 text-xs font-semibold text-slate-300 [&::-webkit-details-marker]:hidden"><span className="flex items-center gap-2"><ChevronDown size={15} className="transition group-open:rotate-180" /> Optional turn clocks</span><span className="text-[10px] font-normal text-slate-500">Default: unlimited</span></summary>
        <div className="grid gap-3 border-t border-white/[0.07] p-3 sm:grid-cols-2">
          <label className="text-[11px] text-slate-400">Seconds per human turn<input min="10" type="number" inputMode="numeric" value={stepSeconds} onChange={event => onStepSecondsChange(event.target.value)} placeholder="Unlimited" className="mt-1 min-h-11 w-full rounded-lg border border-white/10 bg-[#090d12] px-3 text-sm text-slate-100 outline-none focus:border-amber-200/50" /></label>
          <label className="text-[11px] text-slate-400">Total minutes per human<input min="1" type="number" inputMode="numeric" value={totalMinutes} onChange={event => onTotalMinutesChange(event.target.value)} placeholder="Unlimited" className="mt-1 min-h-11 w-full rounded-lg border border-white/10 bg-[#090d12] px-3 text-sm text-slate-100 outline-none focus:border-amber-200/50" /></label>
        </div>
      </details>

      <button type="submit" disabled={busy || !seats.valid} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 font-semibold text-[#17130a] shadow-[0_8px_28px_rgba(245,158,11,.16)] transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Creating room…' : 'Create room'}</button>
    </form>
  );
}
