"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays,
  ClipboardList,
  SlidersHorizontal,
  ExternalLink,
  LogOut,
} from "lucide-react";
import { Brand } from "../brand";
import { request } from "@/services/api";
import { useState } from "react";
export function AdminShell({ children }: { children: React.ReactNode }) {
  const path = usePathname(),
    router = useRouter();
  const [error, setError] = useState("");
  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <Brand />
        <div className="sidebar-label">RECRUITMENT WORKSPACE</div>
        <nav>
          {[
            { href: "/admin", label: "Responses", icon: ClipboardList },
            {
              href: "/admin/schedules",
              label: "Interview schedule",
              icon: CalendarDays,
            },
            {
              href: "/admin/configuration",
              label: "Form configuration",
              icon: SlidersHorizontal,
            },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={path === item.href ? "active" : ""}
            >
              <item.icon size={19} />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link href="/" target="_blank">
            View public form <ExternalLink size={16} />
          </Link>
          <button
            onClick={async () => {
              try {
                await request("admin/logout", "POST");
                router.push("/admin/login");
                router.refresh();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <LogOut size={17} /> Sign out
          </button>
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          <span>Made for meaningful beginnings.</span>
        </div>
      </aside>
      <div className="admin-content">
        <header className="admin-topbar">
          <span>
            BSSC <span className="muted">/ Recruitment 2026</span>
          </span>
          <span className="admin-user">
            <span>C</span> Committee
          </span>
        </header>
        <main className="admin-main">{children}</main>
      </div>
    </div>
  );
}
