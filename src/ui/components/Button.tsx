import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "../lib/cx";
import { Spinner } from "./Feedback";
import s from "./ui.module.css";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface BaseProps {
  variant?: Variant;
  size?: "md" | "sm";
  block?: boolean;
  loading?: boolean;
  icon?: boolean;
  children?: ReactNode;
}

const classes = ({ variant = "secondary", size = "md", block, icon }: BaseProps, extra?: string) =>
  cx(s.btn, s[variant], size === "sm" && s.sm, block && s.block, icon && s.icon, extra);

export function Button({ variant, size, block, loading, icon, children, className, disabled, type = "button", ...rest }: BaseProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={classes({ variant, size, block, icon }, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

export function LinkButton({ variant, size, block, icon, children, href, className, ...rest }: BaseProps & { href: string; className?: string; target?: string; rel?: string; "aria-label"?: string }) {
  return (
    <Link href={href} className={classes({ variant, size, block, icon }, className)} {...rest}>
      {children}
    </Link>
  );
}

/** external link styled as a button (opens in a new tab safely) */
export function ExternalButton({ variant, size, block, children, href, className }: BaseProps & { href: string; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={classes({ variant, size, block }, className)}>
      {children}
    </a>
  );
}
