import { appConfig } from "../config";

export function CampaignBrand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand campaign-brand ${compact ? "compact" : ""}`} aria-label={`Ste Vilela 40180 - ${appConfig.name}`}>
      <span className="brand-wordmark">
        <small>{appConfig.name}</small>
        <b>Ste Vilela</b>
      </span>
      <span className="brand-mark" aria-hidden="true">40180</span>
    </div>
  );
}
