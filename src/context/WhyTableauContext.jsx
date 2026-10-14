// "Why Tableau" presenter mode: outlines every Tableau-powered surface in blue and adds a "Why Tableau"
// section to each (i) popover. Off by default (the client-facing portal is unchanged); remembered per browser.
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const KEY = 'apex.whyTableau';
const WhyTableauContext = createContext({ on: false, toggle: () => {} });

export function WhyTableauProvider({ children }) {
  const [on, setOn] = useState(() => localStorage.getItem(KEY) === '1');

  useEffect(() => {
    document.body.classList.toggle('why-tableau', on);
    localStorage.setItem(KEY, on ? '1' : '0');
  }, [on]);

  const toggle = useCallback(() => setOn((x) => !x), []);

  // ⌥W toggles it from anywhere during a demo.
  useEffect(() => {
    const onKey = (e) => {
      if (e.altKey && e.code === 'KeyW') {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  return <WhyTableauContext.Provider value={{ on, toggle }}>{children}</WhyTableauContext.Provider>;
}

export const useWhyTableau = () => useContext(WhyTableauContext);
