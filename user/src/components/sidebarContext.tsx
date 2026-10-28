import { createContext, useContext, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';

interface SidebarCtx { open: boolean; setOpen: (v: boolean) => void }
const Ctx = createContext<SidebarCtx>({ open: false, setOpen: () => {} });

export const useSidebar = () => useContext(Ctx);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { pathname, search } = useLocation();

  // close on navigation
  useEffect(() => setOpen(false), [pathname, search]);

  // Esc closes, page behind does not scroll while open
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return <Ctx.Provider value={{ open, setOpen }}>{children}</Ctx.Provider>;
}

/** The ☰ button; opens the side drawer. Phones only. */
export function MenuButton({ className = '' }: { className?: string }) {
  const { setOpen } = useSidebar();
  return (
    <motion.button
      type="button" aria-label="Menu" onClick={() => setOpen(true)}
      whileTap={{ scale: 0.8 }} whileHover={{ scale: 1.1 }}
      className={`px-1 text-2xl leading-none md:hidden ${className}`}
    >☰</motion.button>
  );
}
