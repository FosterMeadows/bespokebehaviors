// src/components/icons.jsx
export function Chevron({ collapsed }) {
  return (
    <svg width="18" height="18" className="inline-block ml-2"
      style={{ transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
      viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M6 8l4 4 4-4" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
export function CopyIcon() {
  return (
    <svg width="18" height="18" fill="none" className="inline-block ml-2" viewBox="0 0 20 20" aria-hidden="true">
      <rect x="4" y="6" width="10" height="10" rx="2" fill="#aaa"/>
      <rect x="7" y="4" width="9" height="12" rx="2" stroke="#aaa" strokeWidth="1.5"/>
    </svg>
  );
}
export function PasteIcon() {
  return (
    <svg width="18" height="18" fill="none" className="inline-block ml-2" viewBox="0 0 20 20" aria-hidden="true">
      <rect x="4" y="6" width="10" height="10" rx="2" fill="#34d399"/>
      <path d="M9 9v3h2V9m0 3v2" stroke="#047857" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}