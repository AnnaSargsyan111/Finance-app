"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { askAssistant } from "../api/assistant";
import { Button, LinkButton } from "../components/Button";
import { Note } from "../components/Feedback";
import { IconArrowRight, IconArrowUp, IconInfo, IconRefresh } from "../components/Icons";
import { useLocale, useT } from "../i18n/LocaleProvider";
import { cx } from "../lib/cx";
import { Disclaimer, PageHeader } from "../shell/AppShell";
import { AiSources, ConfidenceLabel } from "./AiParts";
import { PlanCardView } from "./PlanCardView";
import { initialConversation, respond, starterChips } from "./script";
import type { BotMessage, ChatMessage, Chip, ConvState } from "./types";
import s from "./assistant.module.css";

const MAX_LEN = 400;
const TYPING_MS = 450;
const GAP_MS = 250;
// after this long the written answer is shown instead of waiting for the AI layer
const AI_TIMEOUT_MS = 25_000;

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function Sparkle({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M12 2.5l2.2 6.3 6.3 2.2-6.3 2.2L12 19.5l-2.2-6.3L3.5 11l6.3-2.2L12 2.5z" />
      <path d="M19 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" />
    </svg>
  );
}

function Avatar() {
  return (
    <span className={s.avatar} aria-hidden="true">
      <Sparkle size={15} />
    </span>
  );
}

function BotRow({ m }: { m: BotMessage }) {
  const t = useT();
  const notice = m.tone === "notice";
  return (
    <div className={s.row}>
      <Avatar />
      <div className={cx(s.bubble, s.bot, notice && s.notice, m.plan && s.bubblePlan)}>
        <span className="sr-only">{notice ? t("assistant.srBotNote") : t("assistant.srBot")} </span>
        {m.confidence ? <ConfidenceLabel confidence={m.confidence} lang={m.lang ?? "en"} /> : null}
        {notice ? (
          <div className={s.noticeBody}>
            <span className={s.noticeIcon}>
              <IconInfo size={16} />
            </span>
            <p className={s.text}>{m.text}</p>
          </div>
        ) : m.text ? (
          <p className={s.text} lang={m.confidence ? (m.lang ?? "en") : undefined}>
            {m.text}
          </p>
        ) : null}
        {m.confidence ? <AiSources sources={m.sources ?? []} lang={m.lang ?? "en"} /> : null}
        {m.plan ? <PlanCardView plan={m.plan} /> : null}
        {m.link ? (
          <div className={s.linkRow}>
            <LinkButton href={m.link.href} variant="secondary" size="sm" className={s.linkBtn}>
              {m.link.label}
              <IconArrowRight size={14} />
            </LinkButton>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function UserRow({ text }: { text: string }) {
  const t = useT();
  return (
    <div className={cx(s.row, s.rowUser)}>
      <div className={cx(s.bubble, s.mine)}>
        <span className="sr-only">{t("assistant.srYou")} </span>
        <p className={s.text}>{text}</p>
      </div>
    </div>
  );
}

export function AssistantPage() {
  const t = useT();
  const { locale } = useLocale();
  const [init] = useState(() => initialConversation(locale));
  const [messages, setMessages] = useState<ChatMessage[]>(init.messages);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  // the engine state is opaque and only ever read in event handlers, so a ref is enough
  const conv = useRef<ConvState>(init.state);
  const uid = useRef(0);
  const timers = useRef<number[]>([]);
  const cancelAi = useRef<(() => void) | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // before the first question, the welcome message and the suggestions follow the language of the screen
  const shownLocale = useRef(locale);
  useEffect(() => {
    if (shownLocale.current === locale) return;
    shownLocale.current = locale;
    setMessages((m) => {
      if (m.some((x) => x.role === "user")) return m;
      const fresh = initialConversation(locale);
      conv.current = fresh.state;
      return fresh.messages;
    });
  }, [locale]);

  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    cancelAi.current?.();
    cancelAi.current = null;
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  const send = (text: string, shown?: string, fromInput = false) => {
    const value = text.trim();
    if (!value || typing) return;
    const out = respond(conv.current, value);
    conv.current = out.state;
    uid.current += 1;
    setMessages((m) => [...m, { id: `you-${uid.current}`, role: "user", text: shown ?? value }]);
    if (fromInput) setDraft("");
    const reduce = prefersReducedMotion();
    const gap = reduce ? 0 : GAP_MS;
    const reveal = (list: BotMessage[], first: number) => {
      list.forEach((msg, i) => {
        timers.current.push(
          window.setTimeout(() => {
            setMessages((m) => [...m, msg]);
            if (i === list.length - 1) setTyping(false);
          }, first + i * gap),
        );
      });
      if (list.length === 0) timers.current.push(window.setTimeout(() => setTyping(false), first));
    };
    setTyping(true);
    if (out.ai) {
      // nothing written in advance fits: ask the AI layer; the written reply is the fallback for ANY failure
      const ctrl = new AbortController();
      let cancelled = false;
      const timeout = window.setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);
      cancelAi.current = () => {
        cancelled = true;
        window.clearTimeout(timeout);
        ctrl.abort();
      };
      askAssistant(out.ai.question, ctrl.signal)
        .then((ans) => {
          if (cancelled) return;
          window.clearTimeout(timeout);
          if (!ans.text.trim()) throw new Error("empty answer");
          uid.current += 1;
          const reply: BotMessage = { id: `ai-${uid.current}`, role: "bot", text: ans.text, confidence: ans.status, sources: ans.sources, lang: ans.lang };
          setMessages((m) => [...m, reply]);
          setTyping(false);
        })
        .catch(() => {
          if (cancelled) return;
          window.clearTimeout(timeout);
          reveal(out.messages, 0);
        })
        .finally(() => {
          if (!cancelled) cancelAi.current = null;
        });
    } else {
      reveal(out.messages, reduce ? 0 : TYPING_MS);
    }
    inputRef.current?.focus({ preventScroll: true });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    send(draft, undefined, true);
  };

  const pickChip = (c: Chip) => send(c.value, c.label);

  const newChat = () => {
    clearTimers();
    const fresh = initialConversation(locale);
    conv.current = fresh.state;
    setMessages(fresh.messages);
    setTyping(false);
    setDraft("");
    scrollerRef.current?.scrollTo({ top: 0 });
    inputRef.current?.focus({ preventScroll: true });
  };

  // Keep the newest message in view by scrolling the message area only (never the page). A message taller than the
  // area (a plan card) is aligned to its top so the reader starts at the headline figure.
  useEffect(() => {
    const sc = scrollerRef.current;
    if (!sc) return;
    // before the first question the welcome message and the suggestions stay at the top, so the start of the chat is never cut off
    if (!messages.some((m) => m.role === "user")) {
      sc.scrollTo({ top: 0 });
      return;
    }
    const last = logRef.current?.lastElementChild as HTMLElement | null | undefined;
    const tall = !typing && last && last.offsetHeight > sc.clientHeight - 48;
    const top = tall && last ? Math.max(0, last.offsetTop - 12) : sc.scrollHeight;
    sc.scrollTo({ top, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [messages, typing]);

  const last = messages[messages.length - 1];
  const started = messages.some((m) => m.role === "user");
  const lastChips = last && last.role === "bot" ? (last.chips ?? (!started ? starterChips(locale) : undefined)) : undefined;
  const chips = typing ? undefined : lastChips;
  const canSend = draft.trim().length > 0 && !typing;
  const left = MAX_LEN - draft.length;

  return (
    <>
      <PageHeader title={t("assistant.title")} subtitle={t("assistant.subtitle")} />
      <div className={s.stage}>
        <Note>{t("assistant.prototype")}</Note>

        <section className={s.chat} aria-label={t("assistant.chatLabel")}>
          <header className={s.head}>
            <div className={s.headId}>
              <span className={cx(s.avatar, s.avatarLg)} aria-hidden="true">
                <Sparkle size={18} />
              </span>
              <h2 className={s.headName}>{t("assistant.name")}</h2>
            </div>
            <Button variant="ghost" size="sm" onClick={newChat}>
              <IconRefresh size={14} />
              {t("assistant.newChat")}
            </Button>
          </header>

          <div ref={scrollerRef} className={s.scroller} role="region" aria-label={t("assistant.conversation")} tabIndex={0}>
            <div ref={logRef} className={s.log} role="log" aria-live="polite" aria-relevant="additions" aria-label={t("assistant.messages")}>
              {messages.map((m) => (m.role === "bot" ? <BotRow key={m.id} m={m} /> : <UserRow key={m.id} text={m.text} />))}
            </div>

            {typing ? (
              <div className={s.row}>
                <Avatar />
                <div className={cx(s.bubble, s.bot, s.typing)}>
                  <span className={s.dot} aria-hidden="true" />
                  <span className={s.dot} aria-hidden="true" />
                  <span className={s.dot} aria-hidden="true" />
                  <span className="sr-only">{t("assistant.typing")}</span>
                </div>
              </div>
            ) : null}

            {chips && chips.length > 0 ? (
              <div className={s.chips}>
                {!started ? <p className={s.chipsHint}>{t("assistant.tryOne")}</p> : null}
                <div className={cx(s.chipList, !started && s.chipGrid)} role="group" aria-label={t("assistant.quickReplies")}>
                  {chips.map((c) => (
                    <button key={c.label + c.value} type="button" className={cx(s.chipBtn, !started && s.chipCard)} onClick={() => pickChip(c)}>
                      <span>{c.label}</span>
                      {!started ? <IconArrowRight size={16} /> : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <form className={s.composer} onSubmit={submit}>
            <label htmlFor="assistant-input" className="sr-only">
              {t("assistant.composerLabel")}
            </label>
            <div className={s.pill}>
              <input
                ref={inputRef}
                id="assistant-input"
                className={s.input}
                type="text"
                value={draft}
                maxLength={MAX_LEN}
                placeholder={t("assistant.placeholder")}
                autoComplete="off"
                enterKeyHint="send"
                onChange={(e) => setDraft(e.target.value)}
              />
              <Button type="submit" variant="primary" icon disabled={!canSend} aria-label={t("assistant.send")}>
                <IconArrowUp size={18} />
              </Button>
            </div>
            {left <= 80 ? (
              <p className={s.counter}>
                <span className="num">{t("assistant.charsLeft", { n: left })}</span>
              </p>
            ) : null}
          </form>
        </section>
      </div>
      <Disclaimer>{t("assistant.footer")}</Disclaimer>
    </>
  );
}
