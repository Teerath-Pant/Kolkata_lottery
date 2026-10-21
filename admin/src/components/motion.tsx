import { ReactNode, useEffect } from 'react';
import { animate, motion, useMotionValue, useTransform, Variants } from 'framer-motion';

export const container: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.2, staggerChildren: 0.06, delayChildren: 0.02 } },
};

export const item: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 320, damping: 26 } },
};

/** Route wrapper: remount on route change (key it by pathname) so every page fades/slides in and staggers its Items. */
export const Page = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <motion.div variants={container} initial="hidden" animate="show" className={className}>{children}</motion.div>
);

/** Any block that should animate in with its Page (variants propagate through plain elements). */
export const Item = ({ children, className = '', style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) => (
  <motion.div variants={item} className={className} style={style}>{children}</motion.div>
);

/** Number that counts up/down to its new value. */
export function CountUp({ value, className = '' }: { value: number; className?: string }) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => Math.round(v).toLocaleString('en-IN'));
  useEffect(() => {
    const c = animate(mv, value, { duration: 0.8, ease: 'easeOut' });
    return () => c.stop();
  }, [value, mv]);
  return <motion.span className={className}>{text}</motion.span>;
}
