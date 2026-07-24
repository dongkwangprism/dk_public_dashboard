import { useEffect, useState } from "react";
import { isMobileMediaQuery } from "./mobileUtils.js";

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia(isMobileMediaQuery).matches
  );

  useEffect(() => {
    const media = window.matchMedia(isMobileMediaQuery);
    const onChange = (event) => setIsMobile(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
