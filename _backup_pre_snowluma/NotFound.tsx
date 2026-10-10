import { ArrowLeft, BookOpen } from 'lucide-react';
import ProtocolPage from './ProtocolPage';

export default function NotFound() {
  return <ProtocolPage eyebrow="Navigation" title="This page is not on the table." description="The address may be mistyped or the page may have moved. Return home or review the rules." status="Page not found" width="max-w-4xl">
    <div className="flex flex-wrap gap-3">
      <a href="/" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-amber-300 px-5 text-sm font-bold text-[#17130a] hover:bg-amber-200"><ArrowLeft size={18} />Return home</a>
      <a href="/rules" className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-white/10 px-5 text-sm font-semibold text-slate-200 hover:bg-white/[0.05]"><BookOpen size={18} />Read the rules</a>
    </div>
  </ProtocolPage>;
}
