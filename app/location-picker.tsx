"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Search, X } from "lucide-react";
import { districtGroups, districtNames, type District } from "../lib/districts";

type LocationPickerProps = {
  value: string;
  recent: District[];
  onChange: (value: string) => void;
  allowAll?: boolean;
  allowUnclassified?: boolean;
};

const normalized = (value: string) => value.normalize("NFKC").toLocaleLowerCase().replace(/[\s·•.．()（）_—-]+/g, "");

export default function LocationPicker({ value, recent, onChange, allowAll = false, allowUnclassified = false }: LocationPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const search = normalized(query.trim());
  const recentSet = new Set(recent);
  const display = value === "all" ? "所有地點" : value === "unclassified" ? "未分類" : value ? districtNames[value as District] : "請選擇地點";
  const matches = districtGroups.map((group) => ({
    label: group.label,
    options: group.options.filter((option) => {
      if (!search) return !recentSet.has(option.value);
      return normalized(group.label).includes(search) || normalized(option.label).includes(search) || normalized(option.value).includes(search);
    }),
  })).filter((group) => group.options.length > 0);

  function close() {
    setQuery("");
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus());
  }

  function choose(next: string) {
    onChange(next);
    close();
  }

  return <>
    <button ref={trigger} type="button" className={`location-picker-trigger ${value ? "" : "is-placeholder"}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}><span>{display}</span><Search size={18} aria-hidden="true" /></button>
    {open && createPortal(<div className="overlay location-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section className="location-dialog" role="dialog" aria-modal="true" aria-labelledby="location-picker-title" onKeyDown={(event) => { if (event.key === "Escape") close(); }}>
      <div className="location-dialog-head"><button type="button" className="location-back" onClick={close} aria-label="返回"><ArrowLeft size={20} aria-hidden="true" /></button><h2 id="location-picker-title">選擇地點</h2><button type="button" className="location-close" onClick={close} aria-label="關閉地點選擇"><X size={20} aria-hidden="true" /></button></div>
      <div className="location-search"><Search size={18} aria-hidden="true" /><input autoFocus type="search" aria-label="搜尋香港地點" placeholder="搜尋地點，例如佐敦或 Jordan" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      <div className="location-results">
        {allowAll && (!search || normalized("所有地點").includes(search)) && <button type="button" className="location-choice" aria-current={value === "all" ? "true" : undefined} onClick={() => choose("all")}>所有地點</button>}
        {!search && recent.length > 0 && <div className="location-group"><h3>最近使用</h3>{recent.map((item) => <button type="button" className="location-choice" aria-current={value === item ? "true" : undefined} key={item} onClick={() => choose(item)}>{districtNames[item]}</button>)}</div>}
        {matches.map((group) => <div className="location-group" key={group.label}><h3>{group.label}</h3>{group.options.map((option) => <button type="button" className="location-choice" aria-current={value === option.value ? "true" : undefined} key={option.value} onClick={() => choose(option.value)}>{option.label}</button>)}</div>)}
        {allowUnclassified && (!search || normalized("未分類").includes(search)) && <button type="button" className="location-choice" aria-current={value === "unclassified" ? "true" : undefined} onClick={() => choose("unclassified")}>未分類</button>}
        {matches.length === 0 && !(allowAll && normalized("所有地點").includes(search)) && !(allowUnclassified && normalized("未分類").includes(search)) && <p className="location-empty">找不到地點，試試區名、中文或英文名稱。</p>}
      </div>
    </section></div>, document.body)}
  </>;
}
