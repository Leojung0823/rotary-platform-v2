import type { ComponentProps, ReactNode } from "react";

export function Button({ className = "", ...props }: ComponentProps<"button">) {
  return <button className={`button ${className}`} {...props} />;
}

export function Card({ className = "", ...props }: ComponentProps<"section">) {
  return <section className={`card ${className}`} {...props} />;
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "success" | "warning" | "danger"; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="field"><span className="label">{label}</span>{children}{hint && <span className="hint">{hint}</span>}</label>;
}

export function Input(props: ComponentProps<"input">) {
  return <input className="input" {...props} />;
}

export function Select(props: ComponentProps<"select">) {
  return <select className="input" {...props} />;
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return <div className="empty"><div className="empty-icon">R</div><h3>{title}</h3><p>{body}</p></div>;
}

export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "success" | "error" }) {
  return <div role={tone === "error" ? "alert" : "status"} className={`notice notice-${tone}`}>{children}</div>;
}
