import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import { getWavelength, wavelengthToColor } from '../utils/colorUtils';

export const VoteStreak = ({ voteCount, justVoted }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isStar, setIsStar] = useState(false);

  useEffect(() => {
    if (voteCount > 0) {
      setIsVisible(true);
    }
    if (voteCount >= 400) {
      setIsStar(true);
    }
  }, [voteCount]);

  if (!isVisible) return null;

  const color = wavelengthToColor(getWavelength(voteCount));

  return (
    <AnimatePresence>
      <motion.div
        className="fixed bottom-4 left-4 z-[99999]"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0 }}
      >
        <motion.div
          className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center
                     text-white font-bold text-xl`}
          style={{ 
            backgroundColor: color,
            boxShadow: `0 0 15px ${color}`,
          }}
          animate={justVoted ? {
            scale: [1, 1.2, 1],
            transition: { duration: 0.3 }
          } : {}}
        >
          {isStar ? (
            <motion.div
              initial={{ rotate: 0 }}
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            >
              ⭐
            </motion.div>
          ) : (
            voteCount
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}; 