import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const base = 'inline-flex items-center justify-center gap-2 font-semibold transition-colors disabled:pointer-events-none disabled:opacity-45';
const variants: Record<Variant, string> = {
  primary: 'bg-primario text-white hover:bg-primario-scuro',
  secondary: 'bg-superficie text-testo border border-bordo hover:border-primario hover:text-primario',
  ghost: 'text-testo-2 hover:bg-primario-chiaro hover:text-primario',
  danger: 'bg-superficie text-ko border border-ko/30 hover:bg-ko-chiaro',
};
const sizes: Record<Size, string> = { sm: 'h-8 rounded-lg px-3 text-sm', md: 'h-10 rounded-[10px] px-4 text-sm' };

export const buttonClass = (variant: Variant = 'primary', size: Size = 'md', extra = '') => `${base} ${variants[variant]} ${sizes[size]} ${extra}`;

export function Button({ variant = 'primary', size = 'md', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button type="button" className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({ variant = 'primary', size = 'md', className = '', children, ...props }: LinkProps & { variant?: Variant; size?: Size; children: ReactNode }) {
  return (
    <Link className={buttonClass(variant, size, className)} {...props}>
      {children}
    </Link>
  );
}

export function IconButton({ label, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-testo-2 transition-colors hover:bg-primario-chiaro hover:text-primario ${className}`} {...props} />
  );
}
