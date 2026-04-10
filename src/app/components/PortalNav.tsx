/**
 * PortalNav — shared header nav for portal, gallery, userimages, and jumpdoc routes.
 * Renders "Your Chains & Jumpdocs" and "Browse JumpDocs" links with standard nav styling.
 */

import { Link, useLocation } from "@tanstack/react-router";
import { navButtonClass } from "@/app/components/AppHeader";

export function PortalNav() {
  const { pathname } = useLocation();

  return (
    <>
      <Link to="/portal" className={navButtonClass(pathname === "/portal")}>
        Cosmic Portal
      </Link>
      <Link to="/gallery" className={navButtonClass(pathname === "/gallery")}>
        Explore Jumpdocs
      </Link>
      <Link to="/purchases" className={navButtonClass(pathname === "/purchases")}>
        Perks &amp; Items
      </Link>
    </>
  );
}
