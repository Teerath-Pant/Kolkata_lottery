import { ReactNode } from 'react';
import { motion } from 'framer-motion';

/**
 * Route wrapper: key it by pathname so each page fades in exactly once.
 * Cards/lists inside do NOT animate on their own, so data arriving later never replays an entrance.
 */
export const Page = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }} className={className}>{children}</motion.div>
);
