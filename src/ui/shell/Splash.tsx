import { Logo } from "../components/Icons";
import s from "./shell.module.css";

/** The app's normal loading transition (shown while the session is confirmed, and right after sign-up). */
export function Splash({ text = "Loading" }: { text?: string }) {
  return (
    <div className={s.splash} role="status" aria-live="polite" aria-busy="true">
      <div className={s.splashInner}>
        <div className={s.splashBrand}>
          <Logo size={34} />
          <span>Finova</span>
        </div>
        <div className={s.splashBar} aria-hidden="true" />
        <p className={s.splashText}>{text}...</p>
      </div>
    </div>
  );
}
