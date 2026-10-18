import { Fragment, type ReactNode } from "react";

/**
 * A translated sentence with elements inside it (a number in its own span, a link): translate the sentence with each placeholder mapped to
 * itself, then replace the placeholders by the elements, so the word order stays the translator's:
 *
 *   rich(t("x.line", { amount: "{amount}" }), { amount: <span className="num">{value}</span> })
 */
export function rich(text: string, parts: Record<string, ReactNode>): ReactNode {
  return text.split(/(\{\w+\})/g).map((piece, i) => {
    const m = /^\{(\w+)\}$/.exec(piece);
    if (m && m[1] in parts) return <Fragment key={i}>{parts[m[1]]}</Fragment>;
    return piece ? <Fragment key={i}>{piece}</Fragment> : null;
  });
}

/** placeholders that map to themselves, for the call above: ph("amount", "goal") -> { amount: "{amount}", goal: "{goal}" } */
export function ph(...names: string[]): Record<string, string> {
  return Object.fromEntries(names.map((n) => [n, `{${n}}`]));
}
