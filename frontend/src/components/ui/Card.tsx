import type { HTMLAttributes, ReactNode } from 'react';

export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`card ${className}`} {...props} />;
}

export function Section({ title, action, children, className = '' }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-5 ${className}`} aria-label={title}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold md:text-[28px]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-testo-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function StatCard({ label, value, hint, tone = 'default', children }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'default' | 'primary'; children?: ReactNode }) {
  const primary = tone === 'primary';
  return (
    <div className={`rounded-2xl p-4 ${primary ? 'bg-primario text-testo' : 'card'}`}>
      <p className={`text-sm ${primary ? 'text-testo/80' : 'text-testo-2'}`}>{label}</p>
      <p className="mt-1 text-[28px] font-bold leading-tight tracking-tight tabular-nums">{value}</p>
      {hint && <p className={`mt-1 text-xs ${primary ? 'text-testo/75' : 'text-testo-2'}`}>{hint}</p>}
      {children}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-bordo px-6 py-10 text-center">
      <p className="font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-testo-2">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
