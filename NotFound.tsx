import { ArrowLeft, BookOpen } from 'lucide-react';
import ProtocolPage from './ProtocolPage';
import { buttonClassName } from './ui';

export default function NotFound() {
  return <ProtocolPage eyebrow="Navigation" title="This page is not on the table." description="The address may be mistyped or the page may have moved. Return home or review the rules." status="Page not found" width="max-w-4xl">
    <div className="flex flex-wrap gap-3">
      <a href="/" className={buttonClassName('default', 'lg', 'px-5')}><ArrowLeft size={18} />Return home</a>
      <a href="/rules" className={buttonClassName('outline', 'lg', 'px-5')}><BookOpen size={18} />Read the rules</a>
    </div>
  </ProtocolPage>;
}
