import { NavLink } from "react-router-dom";

const TABS = [
  { to: "/admin/chatbot/tickets", label: "Support Tickets" },
  { to: "/admin/chatbot/knowledge", label: "Knowledge Base" },
  { to: "/admin/chatbot/faq", label: "FAQs" },
  { to: "/admin/chatbot/analytics", label: "Analytics" },
];

export function ChatbotNav() {
  return (
    <div className="flex flex-wrap gap-2 mb-6">
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          className={({ isActive }) =>
            `px-3 py-1.5 rounded-lg text-sm border transition-colors ${
              isActive
                ? "bg-primary text-primary-foreground border-transparent"
                : "border-[hsl(var(--glass-border))] hover:bg-[hsl(var(--glass-bg))]"
            }`
          }
        >
          {t.label}
        </NavLink>
      ))}
    </div>
  );
}
