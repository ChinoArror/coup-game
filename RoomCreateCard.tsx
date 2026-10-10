import { Bot, Check, ChevronDown, Plus, UserRound, Users } from 'lucide-react';
import { roomAiLabels, summarizeRoomSeats } from './services/roomUi';
import { Button, Input, Segmented } from './ui';
import { cn } from './ui/cn';

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
    <form onSubmit={event => { event.preventDefault(); if (!busy && seats.valid) onCreate(); }} className="ui-card rounded-2xl border border-border/60 bg-card p-5 sm:p-6">
      <header className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><Plus size={20} /></span>
        <div><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">New table</p><h2 className="mt-1 text-xl font-semibold tracking-tight">Build your room</h2><p className="mt-1 text-sm text-muted-foreground">Choose who fills each seat. You host the table.</p></div>
      </header>

      <fieldset className="mt-6">
        <legend className="mb-2 flex w-full items-center justify-between text-xs font-medium uppercase tracking-wider text-muted-foreground"><span>Total seats</span><span className="font-mono normal-case tracking-normal tabular-nums text-foreground">{seatCount} players</span></legend>
        <Segmented
          ariaLabel="Total seats"
          className="w-full"
          options={[3, 4, 5, 6].map(count => ({ value: String(count), label: String(count) }))}
          value={String(seatCount)}
          onChange={value => onSeatCountChange(Number(value))}
        />
      </fieldset>

      <fieldset className="mt-6">
        <legend className="mb-2 flex w-full items-center justify-between text-xs font-medium uppercase tracking-wider text-muted-foreground"><span>AI agents</span><span className="font-normal normal-case tracking-normal">Up to {maxAi}</span></legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {channels.map((channel, index) => {
            const isSelected = selected.includes(channel.id);
            const isDisabled = !isSelected && selected.length >= maxAi;
            return <button key={channel.id} type="button" aria-pressed={isSelected} disabled={isDisabled} onClick={() => onToggleAi(channel.id)} className={cn('flex min-h-12 items-center justify-between gap-2 rounded-xl border px-3 text-left outline-none transition-colors duration-150 focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-40', isSelected ? 'border-primary/50 bg-primary/10 text-foreground' : 'border-border bg-muted/40 text-muted-foreground hover:border-primary/30 hover:text-foreground')}>
              <span className="flex min-w-0 items-center gap-2"><Bot size={16} className={cn('shrink-0', isSelected ? 'text-primary' : 'text-muted-foreground')} /><span className="min-w-0"><span className="block truncate text-xs font-semibold">AI {roomAiLabels([channel.id])[0]}</span><span className="block truncate text-micro text-muted-foreground">{channel.label}</span></span></span>
              {isSelected && <Check size={15} className="shrink-0 text-primary" />}
              {!isSelected && index === 2 && <span className="sr-only">Optional</span>}
            </button>;
          })}
        </div>
      </fieldset>

      <section aria-live="polite" className="mt-5 rounded-xl border border-border/60 bg-background/50 p-4">
        <div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Seat plan</h3><span className="font-mono text-micro tabular-nums text-muted-foreground">{seats.totalSeats} total</span></div>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-card p-3"><UserRound size={15} className="text-primary" /><p className="mt-2 font-mono text-lg font-bold tabular-nums">1</p><p className="text-micro text-muted-foreground">You · host</p></div>
          <div className="rounded-lg bg-card p-3"><Bot size={15} className="text-primary" /><p className="mt-2 font-mono text-lg font-bold tabular-nums">{seats.aiSeats}</p><p className="text-micro text-muted-foreground">AI agents</p></div>
          <div className="rounded-lg bg-card p-3"><Users size={15} className="text-primary" /><p className="mt-2 font-mono text-lg font-bold tabular-nums">{seats.openGuestSeats}</p><p className="text-micro text-muted-foreground">Guest seats</p></div>
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">Invite one human for each open guest seat. Each invite link admits one player.</p>
      </section>

      <details className="group mt-4 rounded-xl border border-border/60 bg-background/50">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 text-xs font-semibold [&::-webkit-details-marker]:hidden"><span className="flex items-center gap-2"><ChevronDown size={15} className="transition group-open:rotate-180" /> Optional turn clocks</span><span className="text-micro font-normal text-muted-foreground">Default: unlimited</span></summary>
        <div className="grid gap-3 p-3 sm:grid-cols-2">
          <Input label="Seconds per human turn" type="number" min="10" inputMode="numeric" value={stepSeconds} onChange={event => onStepSecondsChange(event.target.value)} placeholder="Unlimited" />
          <Input label="Total minutes per human" type="number" min="1" inputMode="numeric" value={totalMinutes} onChange={event => onTotalMinutesChange(event.target.value)} placeholder="Unlimited" />
        </div>
      </details>

      <Button type="submit" size="lg" disabled={busy || !seats.valid} className="mt-5 w-full">{busy ? 'Creating room…' : 'Create room'}</Button>
    </form>
  );
}
