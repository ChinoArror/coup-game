import { ArrowLeft, Languages } from 'lucide-react';
import { useEffect, useState } from 'react';
import ProtocolPage from './ProtocolPage';
import { RULES_COPY, type RulesLocale } from './services/rules';
import { Button, Card, CardContent, CardHeader, CardTitle, buttonClassName } from './ui';

export default function Rules({ backHref = '/game' }: { backHref?: string }) {
  const [locale, setLocale] = useState<RulesLocale>('zh');
  const copy = RULES_COPY[locale];
  useEffect(() => { document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'; }, [locale]);
  return <ProtocolPage eyebrow={copy.subtitle} title={copy.title} description="" status="" width="max-w-3xl" actions={<>
    <a href={backHref} className={buttonClassName('ghost', 'default', 'h-11 px-3 text-xs font-semibold')}><ArrowLeft size={16} />{backHref === '/' ? locale === 'zh' ? '返回首页' : 'Home' : copy.back}</a>
    <Button variant="outline" onClick={() => setLocale(value => value === 'zh' ? 'en' : 'zh')} className="h-11 px-3 text-xs font-semibold"><Languages size={16} />{locale === 'zh' ? 'English' : '中文'}</Button>
  </>}>
    <div className="space-y-4">
      {copy.sections.map(section => (
        <Card key={section.title}>
          <CardHeader className="pb-0"><CardTitle className="font-mono text-xs uppercase tracking-widest text-primary">{section.title}</CardTitle></CardHeader>
          <CardContent className="pt-3">
            <ul className="space-y-2 text-sm leading-6 text-muted-foreground">{section.items.map(item => <li key={item}>{item}</li>)}</ul>
          </CardContent>
        </Card>
      ))}
    </div>
  </ProtocolPage>;
}
