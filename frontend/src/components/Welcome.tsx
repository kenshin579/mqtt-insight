import { t } from "../lib/i18n";
import { Logo } from "./Logo";

// Onboarding view (A1): centered hero + 3-step cards + CTA. Also used as the
// guide overlay (Task 12 wiring) when `onClose` is provided.
export function Welcome({ onConnect, onClose }: { onConnect: () => void; onClose?: () => void }) {
  return (
    <div className="welcome">
      <div className="welcome-inner">
        <div className="hero-icon"><Logo size={60} /></div>
        <h1>{t("welcomeTitle")}</h1>
        <p className="welcome-sub">{t("welcomeSub")}</p>
        <div className="steps">
          {[1, 2, 3].map((n) => (
            <div className="step-card" key={n}>
              <span className="step-num">{n}</span>
              <div className="step-title">{t(`step${n}Title`)}</div>
              <div className="step-desc">
                {n === 2 ? (<><span className="mono-chip">#</span> {t("step2Desc")}</>) : t(`step${n}Desc`)}
              </div>
            </div>
          ))}
        </div>
        <button className="cta" onClick={onConnect}>{t("welcomeCta")}</button>
        {onClose && <button className="btn-outline guide-back" onClick={onClose}>{t("guideClose")}</button>}
      </div>
    </div>
  );
}
