import Link from "next/link";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

const navItems: NavItem[] = [
  {
    href: "/",
    label: "Home",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 10.5 12 4l8 6.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6.5 10.5V19h11v-8.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path
          d="M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M4.5 12.8c.1.5.1 1 .3 1.5l-1 1.7 1.5 1.5 1.7-1c.5.2 1 .3 1.5.3l.5 1.9h2.1l.5-1.9c.5-.1 1-.1 1.5-.3l1.7 1 1.5-1.5-1-1.7c.2-.5.3-1 .3-1.5l1.9-.5v-2.1l-1.9-.5c-.1-.5-.1-1-.3-1.5l1-1.7-1.5-1.5-1.7 1c-.5-.2-1-.3-1.5-.3l-.5-1.9h-2.1l-.5 1.9c-.5.1-1 .1-1.5.3l-1.7-1-1.5 1.5 1 1.7c-.2.5-.3 1-.3 1.5l-1.9.5v2.1l1.9.5Z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    href: "/account",
    label: "Account",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 20c1.5-2.5 4-3.8 7-3.8s5.5 1.3 7 3.8" strokeLinecap="round" />
      </svg>
    ),
  },
];

export function Navbar() {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-md items-center justify-between px-4">
        <p className="text-sm font-semibold text-slate-800">Welcome to physiovapp</p>
        <nav className="flex items-center gap-3 text-slate-700">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              className="rounded-full p-2 transition hover:bg-slate-100"
            >
              {item.icon}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
