type ClosericeWindow = Window & {
  CLOSERICE_API_BASE?: string;
  CLOSERICE_PAGE_BASE?: string;
};

export function apiUrl(path: string): string {
  if (typeof window === "undefined") return path;
  const base = (window as ClosericeWindow).CLOSERICE_API_BASE?.replace(/\/$/, "");
  return base ? `${base}${path}` : path;
}

export function pageAsset(path: string): string {
  if (typeof window === "undefined") return `/${path.replace(/^\//, "")}`;
  const base = (window as ClosericeWindow).CLOSERICE_PAGE_BASE ?? "/";
  return `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}
