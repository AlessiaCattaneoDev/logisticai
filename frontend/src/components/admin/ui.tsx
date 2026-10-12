import type { ReactNode } from 'react';

export { PageHeader } from '../ui/Card';
export { BudgetBar, QueryState } from '../ui/Status';

export function Panel({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-5 ${className}`} aria-label={title}>
      {title && <h2 className="mb-4 text-[15px] font-semibold">{title}</h2>}
      {children}
    </section>
  );
}
