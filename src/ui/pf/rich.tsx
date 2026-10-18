import { Fragment, type ReactNode } from "react";
import type { Key, Params } from "../i18n/translate";

const MARK = "\u0001";

/**
 * A translated sentence with parts that need their own markup (bold amounts, coloured figures). The whole sentence stays one
 * dictionary text with {placeholders}, so each language keeps its own word order; the placeholders are swapped for elements afterwards.
 */
export function rich(t: (key: Key, params?: Params) => string, key: Key, values: Record<string, ReactNode>, plain: Params = {}): ReactNode[] {
  const marks: Params = { ...plain };
  for (const name of Object.keys(values)) marks[name] = `${MARK}${name}${MARK}`;
  return t(key, marks)
    .split(MARK)
    .map((part, i) => (i % 2 === 1 ? <Fragment key={i}>{values[part]}</Fragment> : part));
}
