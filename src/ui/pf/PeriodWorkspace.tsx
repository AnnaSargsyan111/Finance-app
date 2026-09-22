"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { deletePeriod, getPeriod, putPeriod } from "../api/pf";
import { errorMessage, isApiError } from "../api/client";
import type { PeriodView } from "../api/types";
import { Button } from "../components/Button";
import { Card, ConfirmDialog, Figure } from "../components/Display";
import { ErrorState, Note, Skeleton } from "../components/Feedback";
import { AmountField, TextField } from "../components/Fields";
import { IconPlus, IconTrash } from "../components/Icons";
import { useResource } from "../hooks/useResource";
import { formatAmd, formatDateTime } from "../lib/format";
import { buildPreview, fingerprint, fromView, MAX_CUSTOM_CATEGORIES, newId, selectionFromPeriod, selectionKey, selectionRef, toPutBody, validateForm, type FormRow, type FormState, type Selection } from "./calc";
import { CashFlowChart, ExpenseBreakdownChart } from "./Charts";
import s from "./pf.module.css";

interface Props {
  selection: Selection;
  onDirtyChange: (dirty: boolean) => void;
  onSaved: () => void;
  onNormalize: (sel: Selection) => void;
}

function WorkspaceSkeleton() {
  return (
    <div className={s.grid} role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading this period</span>
      <div className={s.overviewSlot}>
        <Card>
          <div className={s.kpis}>
            {[0, 1, 2].map((i) => (
              <div key={i} className={s.kpi}>
                <Skeleton width={90} height={12} />
                <Skeleton width="70%" height={40} />
              </div>
            ))}
          </div>
        </Card>
      </div>
      <Card>
        <Skeleton height={16} width="40%" />
        <div style={{ height: 16 }} />
        <Skeleton height={340} />
      </Card>
      <div className={s.charts}>
        <Card>
          <Skeleton height={260} />
        </Card>
        <Card>
          <Skeleton height={260} />
        </Card>
      </div>
    </div>
  );
}

export function PeriodWorkspace({ selection, onDirtyChange, onSaved, onNormalize }: Props) {
  const key = selectionKey(selection);
  const res = useResource<PeriodView>((signal) => getPeriod(selectionRef(selection), signal), [key]);
  const [form, setForm] = useState<FormState | null>(null);
  const [baseline, setBaseline] = useState<string>("");
  const [view, setView] = useState<PeriodView | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<{ income?: string; rows: Record<string, { label?: string; amount?: string }> }>({ rows: {} });
  const [showErrors, setShowErrors] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const focusRow = useRef<string | null>(null);

  // load -> form
  useEffect(() => {
    if (res.status === "success" && res.data) {
      const f = fromView(res.data);
      setForm(f);
      setBaseline(fingerprint(f));
      setView(res.data);
      setSaveError(null);
      setServerErrors({ rows: {} });
      setShowErrors(false);
    }
  }, [res.status, res.data]);

  const dirty = form !== null && fingerprint(form) !== baseline;
  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);

  const preview = useMemo(() => (form ? buildPreview(form) : null), [form]);
  const errors = useMemo(() => (form ? validateForm(form) : null), [form]);

  if (res.status === "error" && !form) {
    return <ErrorState title="We couldn't load this period" message={errorMessage(res.error)} onRetry={res.reload} />;
  }
  if (!form || !preview || !errors || !view) return <WorkspaceSkeleton />;

  const setIncome = (v: string) => {
    setJustSaved(false);
    setForm({ ...form, income: v });
    setServerErrors((e) => ({ ...e, income: undefined }));
  };
  const setRow = (id: string, patch: Partial<FormRow>) => {
    setJustSaved(false);
    setForm({ ...form, rows: form.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
    setServerErrors((e) => ({ ...e, rows: { ...e.rows, [id]: {} } }));
  };
  const customCount = form.rows.filter((r) => r.isCustom).length;
  const addCategory = () => {
    const id = newId();
    focusRow.current = id;
    setJustSaved(false);
    setForm({ ...form, rows: [...form.rows, { id, key: null, label: "", amount: "", isCustom: true }] });
  };
  const removeRow = (id: string) => {
    setJustSaved(false);
    setForm({ ...form, rows: form.rows.filter((r) => r.id !== id) });
  };
  const discard = () => {
    const f = fromView(view);
    setForm(f);
    setShowErrors(false);
    setSaveError(null);
    setServerErrors({ rows: {} });
  };

  async function save() {
    if (!form || !errors) return;
    setShowErrors(true);
    if (!errors.ok) {
      setSaveError(errors.general ?? "Fix the highlighted fields to save.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    setServerErrors({ rows: {} });
    const { body, indexToRow } = toPutBody(form, selectionRef(selection));
    try {
      const saved = await putPeriod(body);
      const f = fromView(saved);
      setForm(f);
      setBaseline(fingerprint(f));
      setView(saved);
      setShowErrors(false);
      setJustSaved(true);
      onSaved();
      // a custom range that is exactly one calendar month is stored as that month
      const sel = selectionFromPeriod(saved.period);
      if (selectionKey(sel) !== key) onNormalize(sel);
    } catch (e) {
      if (isApiError(e) && e.fields) {
        const rows: Record<string, { label?: string; amount?: string }> = {};
        let income: string | undefined;
        let general: string | undefined;
        for (const [k, msg] of Object.entries(e.fields)) {
          const m = /^expenses\.(\d+)\.(amount|label|key)$/.exec(k);
          if (k === "income") income = msg;
          else if (m) {
            const rowId = indexToRow[Number(m[1])];
            if (rowId) rows[rowId] = { ...rows[rowId], [m[2] === "amount" ? "amount" : "label"]: msg };
          } else general = msg;
        }
        setServerErrors({ income, rows });
        setSaveError(general ?? "Some values need attention.");
      } else setSaveError(errorMessage(e, "We couldn't save your changes. Please try again."));
    } finally {
      setSaving(false);
    }
  }

  async function removePeriod() {
    setDeleting(true);
    try {
      await deletePeriod(selectionRef(selection));
      setConfirmDelete(false);
      onSaved();
      res.reload();
    } catch (e) {
      setConfirmDelete(false);
      setSaveError(errorMessage(e, "We couldn't delete this period."));
    } finally {
      setDeleting(false);
    }
  }

  const incomeErr = (showErrors ? errors.income : undefined) ?? serverErrors.income;
  const rowErr = (id: string) => ({ label: (showErrors ? errors.rows[id]?.label : undefined) ?? serverErrors.rows[id]?.label, amount: (showErrors ? errors.rows[id]?.amount : undefined) ?? serverErrors.rows[id]?.amount });

  const avail = preview.availableCents / 100;
  const negative = preview.availableCents < 0;

  return (
    <div className={s.grid}>
      {/* ---------------------------------------------------------------- overview */}
      <div className={s.overviewSlot}>
        <Card title="Financial Overview" eyebrow="This period" aria-label="Financial Overview">
          {preview.isEmpty ? (
            <p className={s.emptyHint}>Nothing entered for this period yet. Add your income and expenses below and your overview will appear here.</p>
          ) : null}
          <div className={s.kpis}>
            <div className={s.kpi}>
              <span className={s.kpiLabel}>Income</span>
              {preview.isEmpty || !preview.incomeEntered ? <Figure value={null} size="md" /> : <Figure value={preview.incomeCents / 100} decimals={2} unit="AMD" />}
              {!preview.isEmpty && !preview.incomeEntered ? <span className={s.kpiNote}>Not entered</span> : null}
            </div>
            <div className={s.kpi}>
              <span className={s.kpiLabel}>Expenses</span>
              {preview.isEmpty ? <Figure value={null} size="md" /> : <Figure value={preview.expensesCents / 100} decimals={2} unit="AMD" />}
            </div>
            <div className={s.kpi}>
              <span className={s.kpiLabel}>Available / Difference</span>
              {preview.isEmpty ? <Figure value={null} size="md" /> : <Figure value={avail} decimals={2} unit="AMD" negTone />}
              <span className={s.kpiNote}>{negative ? "Expenses are higher than income. " : ""}Income minus expenses. Not your bank balance.</span>
            </div>
          </div>
        </Card>
      </div>

      {/* ---------------------------------------------------------------- inputs */}
      <Card
        title="Income & Expenses"
        eyebrow="Enter amounts for this period"
        actions={view.exists ? <span className={s.saved}>Saved {formatDateTime(view.updatedAt)}</span> : <span className={s.saved}>Not saved yet</span>}
        className={s.inputsCard}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          noValidate
          className={s.form}
        >
          <AmountField label="Income" name="income" unit="AMD" placeholder="e.g. 850,000" value={form.income} onChange={setIncome} error={incomeErr} hint="One overall amount for the whole period." />

          <fieldset className={s.fieldset}>
            <legend className={s.legend}>Expenses</legend>
            <p className={s.legendHint}>All optional. Leave a category empty if it doesn&apos;t apply.</p>
            <div className={s.rows}>
              {form.rows.map((r) => {
                const err = rowErr(r.id);
                if (!r.isCustom)
                  return <AmountField key={r.id} label={r.label} name={`expense-${r.key}`} unit="AMD" value={r.amount} onChange={(v) => setRow(r.id, { amount: v })} error={err.amount} />;
                return (
                  <div key={r.id} className={s.customRow}>
                    <TextField
                      label="Category name"
                      name={`custom-label-${r.id}`}
                      value={r.label}
                      maxLength={60}
                      ref={(el) => {
                        if (el && focusRow.current === r.id) {
                          el.focus();
                          focusRow.current = null;
                        }
                      }}
                      onChange={(e) => setRow(r.id, { label: e.target.value })}
                      error={err.label}
                      placeholder="e.g. Pets"
                    />
                    <AmountField label={`${r.label.trim() || "Custom category"} amount`} name={`custom-amount-${r.id}`} unit="AMD" value={r.amount} onChange={(v) => setRow(r.id, { amount: v })} error={err.amount} />
                    <Button variant="ghost" icon aria-label={`Remove category ${r.label.trim() || "(unnamed)"}`} className={s.removeBtn} onClick={() => removeRow(r.id)}>
                      <IconTrash />
                    </Button>
                  </div>
                );
              })}
            </div>
            <div className={s.addRow}>
              <Button variant="secondary" size="sm" onClick={addCategory} disabled={customCount >= MAX_CUSTOM_CATEGORIES}>
                <IconPlus size={16} />
                Add category
              </Button>
              {customCount >= MAX_CUSTOM_CATEGORIES ? <span className={s.legendHint}>Limit of {MAX_CUSTOM_CATEGORIES} custom categories reached.</span> : null}
            </div>
          </fieldset>

          {saveError ? <Note tone="error">{saveError}</Note> : null}
          {preview.incomeMissing ? <Note tone="warn">Income isn&apos;t entered for this period. Available / Difference counts income as 0 until you add it.</Note> : null}

          <div className={s.saveBar}>
            <p className={s.status} role="status" aria-live="polite">
              {dirty ? <span className={s.dirtyDot}>Unsaved changes</span> : justSaved ? <span className={s.okText}>Saved. Charts now show the saved values.</span> : view.exists ? "All changes saved." : "Nothing saved yet."}
            </p>
            <div className={s.saveActions}>
              {view.exists && !dirty ? (
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
                  <IconTrash size={16} />
                  Delete period
                </Button>
              ) : null}
              {dirty ? (
                <Button variant="ghost" onClick={discard} disabled={saving}>
                  Discard changes
                </Button>
              ) : null}
              <Button type="submit" variant="primary" loading={saving} disabled={!dirty || (preview.isEmpty && !view.exists)}>
                Save
              </Button>
            </div>
          </div>
        </form>
      </Card>

      {/* ---------------------------------------------------------------- charts */}
      <div className={s.charts}>
        <Card title="Expense Breakdown" eyebrow="Where the money goes" aria-label="Expense Breakdown">
          <ExpenseBreakdownChart preview={preview} />
        </Card>
        <Card title="Cash Flow" eyebrow="Income vs expenses" aria-label="Cash Flow">
          <CashFlowChart preview={preview} />
        </Card>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this period?"
        onClose={() => setConfirmDelete(false)}
        actions={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button variant="danger" loading={deleting} onClick={removePeriod}>
              Delete period
            </Button>
          </>
        }
      >
        This removes the saved income and expenses for this period ({formatAmd(preview.expensesCents / 100)} of expenses). Other periods are not affected.
      </ConfirmDialog>
    </div>
  );
}
