import { ArrowLeft, BookOpen, Languages } from 'lucide-react';
import { useEffect, useState } from 'react';
import { RULES_COPY, type RulesLocale } from './services/rules';

export default function Rules({ backHref = '/game' }: { backHref?: string }) {
  const [locale, setLocale] = useState<RulesLocale>('zh');
  const copy = RULES_COPY[locale];
  useEffect(() => { document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'; }, [locale]);
  return <main className="min-h-screen bg-slate-950 p-4 text-slate-200 md:p-8">
    <section className="mx-auto max-w-3xl">
      <header className="mb-6 flex items-center justify-between border-b border-slate-800 pb-4">
        <a href={backHref} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 font-mono text-xs font-bold tracking-wider text-slate-300 hover:bg-slate-800 hover:text-amber-500"><ArrowLeft size={17} />{backHref === '/' ? locale === 'zh' ? '返回首页' : 'Home' : copy.back}</a>
        <button onClick={() => setLocale(value => value === 'zh' ? 'en' : 'zh')} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 font-mono text-xs font-bold text-amber-400 hover:bg-slate-800"><Languages size={16} />{locale === 'zh' ? 'English' : '中文'}</button>
      </header>
      <div className="mb-6 flex items-center gap-3"><BookOpen className="text-amber-500" size={28} /><div><h1 className="font-mono text-2xl font-bold tracking-wider text-amber-500">{copy.title}</h1><p className="text-sm text-slate-400">{copy.subtitle}</p></div></div>
      <div className="space-y-4">{copy.sections.map(section => <article key={section.title} className="rounded-xl border border-slate-800 bg-slate-900/70 p-5"><h2 className="mb-3 font-mono text-sm font-bold tracking-widest text-amber-400">{section.title}</h2><ul className="space-y-2 text-sm leading-6 text-slate-300">{section.items.map(item => <li key={item}>{item}</li>)}</ul></article>)}</div>
    </section>
  </main>;
}
