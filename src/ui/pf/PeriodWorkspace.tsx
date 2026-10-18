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
import { translate, useT, type Key, type Params } from "../i18n";
import { formatAmd, formatDateTime } from "../lib/format";
import { buildPreview, categoryLabel, fingerprint, fromView, MAX_CUSTOM_CATEGORIES, newId, selectionFromPeriod, selectionKey, selectionRef, toPutBody, validateForm, type FormRow, type FormState, type Selection } from "./calc";
import { Advice } from "./Advice";
import { CashFlowChart, ExpenseBreakdownChart } from "./Charts";
import s from "./pf.module.css";

/** A message under the form. It is kept as a key (or as the error itself), not as finished text, so it follows a language change. */
type Msg = { key: Key; params?: Params } | { raw: string } | { err: unknown; fallback: Key };

/** English messages the server sends for the checks the form also makes: shown in the chosen language, any other server text as it is */
const SERVER_KEYS = ["pf.serverMsg.amountFormat", "pf.serverMsg.amountTooLarge", "pf.serverMsg.nameRequired", "pf.serverMsg.nameDefault", "pf.serverMsg.nameUnique"] as const satisfies readonly Key[];
const SERVER_BY_TEXT = new Map<string, Key>(SERVER_KEYS.map((k) => [translate("en", k), k]));
const SERVER_MAX_RE = /^At most (\d+) custom categories per period$/;
function serverText(t: (key: Key, params?: Params) => string, msg: string | undefined): string | undefined {
  if (msg === undefined) return undefined;
  const k = SERVER_BY_TEXT.get(msg);
  if (k) return t(k);
  const m = SERVER_MAX_RE.exec(msg);
  return m ? t("pf.serverMsg.tooManyCustom", { n: m[1] }) : msg;
}

interface Props {
  selection: Selection;
  onDirtyChange: (dirty: boolean) => void;
  onSaved: () => void;
  onNormalize: (sel: Selection) => void;
}

function WorkspaceSkeleton() {
  const t = useT();
  return (
    <div className={s.grid} role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">{t("pf.workspace.loading")}</span>
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
  const t = useT();
  const key = selectionKey(selection);
  const res = useResource<PeriodView>((signal) => getPeriod(selectionRef(selection), signal), [key]);
  const [form, setForm] = useState<FormState | null>(null);
  const [baseline, setBaseline] = useState<string>("");
  const [view, setView] = useState<PeriodView | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<Msg | null>(null);
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

    // these write category names and messages in the chosen language, so they are worked out again when it changes
  const preview = useMemo(() => (form ? buildPreview(form) : null), [form, t]);
  const errors = useMemo(() => (form ? validateForm(form) : null), [form, t]);

  if (res.status === "error" && !form) {
    return <ErrorState title={t("pf.workspace.loadErrorTitle")} message={errorMessage(res.error, t("pf.workspace.genericError"))} onRetry={res.reload} retryLabel={t("pf.workspace.retry")} />;
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
      setSaveError(errors.general !== undefined ? { key: "pf.validation.tooManyCustom", params: { n: MAX_CUSTOM_CATEGORIES } } : { key: "pf.workspace.form.fixFields" });
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
        setSaveError(general !== undefined ? { raw: general } : { key: "pf.workspace.form.needAttention" });
      } else setSaveError({ err: e, fallback: "pf.workspace.form.saveFailed" });
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
      setSaveError({ err: e, fallback: "pf.workspace.form.deleteFailed" });
    } finally {
      setDeleting(false);
    }
  }

  const incomeErr = (showErrors ? errors.income : undefined) ?? serverText(t, serverErrors.income);
  const rowErr = (id: string) => ({
    label: (showErrors ? errors.rows[id]?.label : undefined) ?? serverText(t, serverErrors.rows[id]?.label),
    amount: (showErrors ? errors.rows[id]?.amount : undefined) ?? serverText(t, serverErrors.rows[id]?.amount),
  });
  const saveErrorText = saveError === null ? null : "key" in saveError ? t(saveError.key, saveError.params) : "raw" in saveError ? (serverText(t, saveError.raw) ?? saveError.raw) : errorMessage(saveError.err, t(saveError.fallback));

  const avail = preview.availableCents / 100;
  const negative = preview.availableCents < 0;

  return (
    <div className={s.grid}>
      {/* ---------------------------------------------------------------- overview */}
      <div className={s.overviewSlot}>
        <Card title={t("pf.workspace.overview.title")} eyebrow={t("pf.workspace.overview.eyebrow")} aria-label={t("pf.workspace.overview.title")}>
          {preview.isEmpty ? (
            <p className={s.emptyHint}>{t("pf.workspace.overview.emptyHint")}</p>
          ) : null}
          <div className={s.kpis}>
            <div className={s.kpi}>
              <span className={s.kpiLabel}>{t("pf.workspace.overview.income")}</span>
              {preview.isEmpty || !preview.incomeEntered ? <Figure value={null} size="md" /> : <Figure value={preview.incomeCents / 100} decimals={2} unit="AMD" />}
              {!preview.isEmpty && !preview.incomeEntered ? <span className={s.kpiNote}>{t("pf.workspace.overview.notEntered")}</span> : null}
            </div>
            <div className={s.kpi}>
              <span className={s.kpiLabel}>{t("pf.workspace.overview.expenses")}</span>
              {preview.isEmpty ? <Figure value={null} size="md" /> : <Figure value={preview.expensesCents / 100} decimals={2} unit="AMD" />}
            </div>
            <div className={s.kpi}>
              <span className={s.kpiLabel}>{t("pf.workspace.overview.available")}</span>
              {preview.isEmpty ? <Figure value={null} size="md" /> : <Figure value={avail} decimals={2} unit="AMD" negTone />}
              <span className={s.kpiNote}>{negative ? `${t("pf.workspace.overview.negative")} ` : ""}{t("pf.workspace.overview.note")}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* ---------------------------------------------------------------- inputs */}
      <Card
        title={t("pf.workspace.form.title")}
        eyebrow={t("pf.workspace.form.eyebrow")}
        actions={view.exists ? <span className={s.saved}>{t("pf.workspace.form.saved", { when: formatDateTime(view.updatedAt) })}</span> : <span className={s.saved}>{t("pf.workspace.form.notSaved")}</span>}
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
          <AmountField label={t("pf.workspace.form.income")} name="income" unit="AMD" placeholder={t("pf.workspace.form.incomePlaceholder")} value={form.income} onChange={setIncome} error={incomeErr} hint={t("pf.workspace.form.incomeHint")} />

          <fieldset className={s.fieldset}>
            <legend className={s.legend}>{t("pf.workspace.form.expensesLegend")}</legend>
            <p className={s.legendHint}>{t("pf.workspace.form.expensesHint")}</p>
            <div className={s.rows}>
              {form.rows.map((r) => {
                const err = rowErr(r.id);
                if (!r.isCustom)
                  return <AmountField key={r.id} label={categoryLabel(r.key, false, r.label)} name={`expense-${r.key}`} unit="AMD" value={r.amount} onChange={(v) => setRow(r.id, { amount: v })} error={err.amount} />;
                return (
                  <div key={r.id} className={s.customRow}>
                    <TextField
                      label={t("pf.workspace.form.categoryName")}
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
                      placeholder={t("pf.workspace.form.categoryPlaceholder")}
                    />
                    <AmountField label={t("pf.workspace.form.customAmount", { name: r.label.trim() || t("pf.category.customFallback") })} name={`custom-amount-${r.id}`} unit="AMD" value={r.amount} onChange={(v) => setRow(r.id, { amount: v })} error={err.amount} />
                    <Button variant="ghost" icon aria-label={t("pf.workspace.form.removeCategory", { name: r.label.trim() || t("pf.workspace.form.unnamed") })} className={s.removeBtn} onClick={() => removeRow(r.id)}>
                      <IconTrash />
                    </Button>
                  </div>
                );
              })}
            </div>
            <div className={s.addRow}>
              <Button variant="secondary" size="sm" onClick={addCategory} disabled={customCount >= MAX_CUSTOM_CATEGORIES}>
                <IconPlus size={16} />
                {t("pf.workspace.form.addCategory")}
              </Button>
              {customCount >= MAX_CUSTOM_CATEGORIES ? <span className={s.legendHint}>{t("pf.workspace.form.limitReached", { n: MAX_CUSTOM_CATEGORIES })}</span> : null}
            </div>
          </fieldset>

          {saveErrorText ? <Note tone="error">{saveErrorText}</Note> : null}
          {preview.incomeMissing ? <Note tone="warn">{t("pf.workspace.form.incomeMissing")}</Note> : null}

          <div className={s.saveBar}>
            <p className={s.status} role="status" aria-live="polite">
              {dirty ? <span className={s.dirtyDot}>{t("pf.workspace.form.unsaved")}</span> : justSaved ? <span className={s.okText}>{t("pf.workspace.form.justSaved")}</span> : view.exists ? t("pf.workspace.form.allSaved") : t("pf.workspace.form.nothingSaved")}
            </p>
            <div className={s.saveActions}>
              {view.exists && !dirty ? (
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
                  <IconTrash size={16} />
                  {t("pf.workspace.form.deletePeriod")}
                </Button>
              ) : null}
              {dirty ? (
                <Button variant="ghost" onClick={discard} disabled={saving}>
                  {t("pf.workspace.form.discardChanges")}
                </Button>
              ) : null}
              <Button type="submit" variant="primary" loading={saving} disabled={!dirty || (preview.isEmpty && !view.exists)}>
                {t("pf.workspace.form.save")}
              </Button>
            </div>
          </div>
        </form>
      </Card>

      {/* ---------------------------------------------------------------- charts */}
      <div className={s.charts}>
        <Card title={t("pf.workspace.breakdown.title")} eyebrow={t("pf.workspace.breakdown.eyebrow")} aria-label={t("pf.workspace.breakdown.title")}>
          <ExpenseBreakdownChart preview={preview} />
        </Card>
        <Card title={t("pf.workspace.cashFlow.title")} eyebrow={t("pf.workspace.cashFlow.eyebrow")} aria-label={t("pf.workspace.cashFlow.title")}>
          <CashFlowChart preview={preview} />
        </Card>
      </div>

      {/* ---------------------------------------------------------------- insights, alerts and suggestions that follow the form, at the bottom */}
      <div className={s.adviceSlot}>
        <Advice form={form} selection={selection} dirty={dirty} />
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={t("pf.workspace.deleteDialog.title")}
        onClose={() => setConfirmDelete(false)}
        actions={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              {t("pf.workspace.deleteDialog.keepIt")}
            </Button>
            <Button variant="danger" loading={deleting} onClick={removePeriod}>
              {t("pf.workspace.form.deletePeriod")}
            </Button>
          </>
        }
      >
        {t("pf.workspace.deleteDialog.body", { amount: formatAmd(preview.expensesCents / 100, { suffix: false }) })}
      </ConfirmDialog>
    </div>
  );
}
