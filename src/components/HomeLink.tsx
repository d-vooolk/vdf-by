"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export function HomeLink({
  className,
  ariaLabel,
  children,
}: {
  className?: string;
  ariaLabel?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const leavingForHome = useRef(false);

  useEffect(() => {
    if (pathname !== "/" || !leavingForHome.current) return;
    leavingForHome.current = false;
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);

  const onClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    if (pathname === "/") {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    leavingForHome.current = true;
  };

  return (
    <Link href="/" className={className} aria-label={ariaLabel} onClick={onClick}>
      {children}
    </Link>
  );
}
