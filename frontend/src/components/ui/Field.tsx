import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

export const inputClass = 'w-full rounded-[10px] border border-bordo bg-superficie px-3 py-2 text-sm text-testo placeholder:text-testo-2/70 focus:border-primario focus:outline-none focus:ring-4 focus:ring-primario/10';

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="text-sm">
      <label className="block">
        <span className="font-medium">{label}</span>
        <div className="mt-1.5">{children}</div>
      </label>
      {hint && <p className="mt-1 text-xs text-testo-2">{hint}</p>}
    </div>
  );
}

export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={`${inputClass} ${p.className ?? ''}`} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={`${inputClass} ${p.className ?? ''}`} />;
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={`${inputClass} ${p.className ?? ''}`} />;
