"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { listPeriods } from "../api/pf";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/Display";
import { useResource } from "../hooks/useResource";
import { currentMonthYerevan, formatDate, formatMonth } from "../lib/format";
import { PageHeader } from "../shell/AppShell";
import { selectionKey, type Selection } from "./calc";
import { PeriodSelector } from "./PeriodSelector";
import { PeriodWorkspace } from "./PeriodWorkspace";
import s from "./pf.module.css";

const labelOf = (sel: Selection) => (sel.kind === "month" ? formatMonth(sel.month) : `${formatDate(sel.start)} - ${formatDate(sel.end)}`);

/**
 * Personal Finance: independent feature (no data is shared with the Investment Recommendation). The period
 * workspace is keyed by the selected period, so switching periods always starts from that period's saved data.
 */
export function PersonalFinancePage() {
  const [selection, setSelection] = useState<Selection>(() => ({ kind: "month", month: currentMonthYerevan() }));
  const [pending, setPending] = useState<Selection | null>(null);
  const dirtyRef = useRef(false);
  const [, force] = useState(0);
  const saved = useResource((signal) => listPeriods(signal), []);

  const onDirtyChange = useCallback((d: boolean) => {
    dirtyRef.current = d;
    force((n) => n + 1);
  }, []);

  const requestSelect = useCallback(
    (next: Selection) => {
      if (selectionKey(next) === selectionKey(selection)) return;
      if (dirtyRef.current) setPending(next);
      else setSelection(next);
    },
    [selection],
  );

  // leaving the page (reload, close tab, in-app links) with unsaved changes
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e: MouseEvent) => {
      if (!dirtyRef.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank") return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      if (!window.confirm("You have unsaved changes in this period. Leave without saving?")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  const key = selectionKey(selection);

  return (
    <>
      <PageHeader title="Personal Finance" subtitle="Enter your income and expenses for a period and see where your money goes. Everything here stays separate from investment recommendations." />
      <div className={s.top}>
        <PeriodSelector selection={selection} onSelect={requestSelect} saved={saved.data ?? []} />
      </div>
      <PeriodWorkspace key={key} selection={selection} onDirtyChange={onDirtyChange} onSaved={saved.reload} onNormalize={setSelection} />

      <ConfirmDialog
        open={pending !== null}
        title="Discard unsaved changes?"
        onClose={() => setPending(null)}
        actions={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Keep editing
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (pending) {
                  dirtyRef.current = false;
                  setSelection(pending);
                }
                setPending(null);
              }}
            >
              Discard and switch
            </Button>
          </>
        }
      >
        You have unsaved changes for {labelOf(selection)}. Switching to {pending ? labelOf(pending) : "another period"} will discard them.
      </ConfirmDialog>
    </>
  );
}
