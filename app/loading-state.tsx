import { loadingAnimationMarkup } from "../lib/loading-markup.mjs";
import "./loading-state.css";

export function LoadingAnimation() {
  return <div className="loading-animation" aria-hidden="true" dangerouslySetInnerHTML={{ __html: loadingAnimationMarkup }} />;
}

export function AppLoadingScreen() {
  return <div className="app-loading-screen" role="status" aria-label="正在載入" aria-busy="true"><LoadingAnimation /></div>;
}

export function InlineLoading({ label = "正在載入" }: { label?: string }) {
  return <div className="inline-loading" role="status" aria-label={label} aria-busy="true"><LoadingAnimation /></div>;
}

export function ReviewCardsSkeleton() {
  return <section className="list restaurant-list" role="status" aria-label="正在載入食評" aria-busy="true">
    {[0, 1, 2, 3].map((item) => <div className="card skeleton-card" key={item} aria-hidden="true"><div className="card-body">
      <span className="skeleton-block skeleton-title" /><span className="skeleton-block skeleton-meta" />
      <span className="skeleton-block skeleton-date" /><span className="skeleton-block skeleton-food" /><span className="skeleton-block skeleton-food-short" />
      <div className="skeleton-contributors"><span className="skeleton-block skeleton-avatar" /><span className="skeleton-block skeleton-avatar" /><span className="skeleton-block skeleton-author" /></div>
      <div className="skeleton-footer"><span className="skeleton-block" /><span className="skeleton-block" /></div>
    </div></div>)}
  </section>;
}

export function MemberRowsSkeleton() {
  return <div className="member-rows-skeleton" role="status" aria-label="正在載入成員" aria-busy="true">{[0, 1].map((item) => <div className="skeleton-member" key={item} aria-hidden="true"><span className="skeleton-block skeleton-avatar" /><div><span className="skeleton-block skeleton-title" /><span className="skeleton-block skeleton-meta" /></div></div>)}</div>;
}
