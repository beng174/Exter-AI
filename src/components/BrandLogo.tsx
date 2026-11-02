import { useEffect, useState } from "react";

export function BrandLogo() {
  const [logo, setLogo] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    fetch("/api/branding").then(response => response.ok ? response.json() : null).then(brand => {
      if (!active || !brand) return;
      if (brand.logoMark === "/brand/exter-logo-mark.svg") setLogo(brand.logoMark);
      if (brand.appIcon === "/brand/exter-app-icon.svg") {
        const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
        if (icon) icon.href = brand.appIcon;
      }
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  return logo ? <img className="exter-brand-logo" src={logo} alt="Exter Media" onError={() => setLogo(null)} />
    : <span className="exter-brand-wordmark" aria-label="Exter Media">EXTER <span>MEDIA</span></span>;
}
