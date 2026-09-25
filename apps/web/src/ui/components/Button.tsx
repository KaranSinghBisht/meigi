import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router'
import { Spinner } from './Spinner'
import './button.css'

export type ButtonVariant = 'primary' | 'accent' | 'ghost' | 'quiet'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl'

interface Look {
  readonly variant?: ButtonVariant
  readonly size?: ButtonSize
}

function classes({ variant = 'primary', size = 'md' }: Look, extra?: string): string {
  return ['btn', `btn--${variant}`, `btn--${size}`, extra].filter(Boolean).join(' ')
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, Look {
  /** Shows a spinner, ignores clicks (including form submits) and sets aria-busy. */
  readonly busy?: boolean
  readonly icon?: ReactNode
}

/** While busy the button keeps keyboard focus (aria-disabled, clicks ignored) instead of dropping it. */
export function Button({
  variant,
  size,
  busy = false,
  icon,
  className,
  children,
  disabled,
  onClick,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={classes({ variant, size }, className)}
      disabled={disabled}
      aria-disabled={busy || undefined}
      aria-busy={busy || undefined}
      onClick={busy ? (event) => event.preventDefault() : onClick}
    >
      {busy ? <Spinner /> : icon}
      <span>{children}</span>
    </button>
  )
}

export function LinkButton({ variant, size, className, children, ...rest }: LinkProps & Look) {
  return (
    <Link {...rest} className={classes({ variant, size }, className)}>
      {children}
    </Link>
  )
}

export function ExternalLinkButton({
  variant,
  size,
  className,
  children,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & Look) {
  return (
    <a target="_blank" rel="noreferrer" {...rest} className={classes({ variant, size }, className)}>
      {children}
    </a>
  )
}
