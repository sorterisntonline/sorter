import { makeRequest, loadTag } from "./Network";
import { tag, magnitude } from "./App";
import { ItemFull } from "./ItemPanel";
import { current_session } from "./session";
import { useEffect, useState } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { Item } from "./components/Item";

const calculateMargin = (magnitude) => {
  if (magnitude < 50) {
    return { leftMargin: 50 - magnitude, rightMargin: 0 };
  } else {
    return { leftMargin: 0, rightMargin: magnitude - 50 };
  }
};

const MobileVoteCard = ({ item, isTop, dragX, magnitudeMotionValue }) => {
  const opacity = useTransform(
    magnitudeMotionValue,
    [0, 50, 100],
    isTop 
      ? [1, 1, 0.6]
      : [0.6, 1, 1]
  );

  return (
    <motion.div
      className="absolute w-[90vw] h-[38vh] rounded-xl overflow-hidden bg-white dark:bg-gray-800 shadow-lg"
      style={{
        top: isTop ? '4vh' : '46vh',  // 4vh gap between cards (was 44vh)
        y: useTransform(
          magnitudeMotionValue,
          [0, 50, 100],
          isTop 
            ? [200, 0, 0]
            : [0, 0, -200]
        ),
        opacity,
        scale: useTransform(
          magnitudeMotionValue,
          [0, 50, 100],
          isTop 
            ? [0.9, 1, 1]
            : [1, 1, 0.9]
        ),
        zIndex: useTransform(
          magnitudeMotionValue,
          [0, 50, 100],
          isTop 
            ? [2, 1, 1]
            : [1, 1, 2]
        ),
      }}
    >
      {(item.domain_pk_namespace === "IMG" || item.domain_pk_namespace === "reddit.post") && item.url && (
        <div
          className="absolute inset-0 bg-center"
          style={{ 
            backgroundImage: `url(${item.url})`,
            backgroundSize: 'cover',  // Ensure image covers the whole area
            backgroundPosition: 'center',  // Center the image
          }}
        />
      )}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
        <h3 className="text-xl font-bold text-white">{item.title}</h3>
        <p className="text-sm text-white/90">{item.description}</p>
      </div>
    </motion.div>
  );
};

const MobileVoteSlider = ({ dragX, onSliderDrag }) => {
  const maxSliderWidth = window.innerWidth * 0.45;

  const sliderX = useTransform(
    dragX,
    [-300, 0, 300],
    [-maxSliderWidth, 0, maxSliderWidth]
  );

  return (
    <div className="h-14 bg-white dark:bg-black flex items-center justify-center">
      <div className="w-[90vw] h-1 bg-gray-300 dark:bg-gray-600 rounded">
        <motion.div
          className="w-3 h-3 -translate-y-1 flex justify-center absolute left-1/2 -translate-x-1/2 cursor-grab active:cursor-grabbing"
          initial={{ x: 0 }}
          animate={{ x: sliderX }}
          style={{ x: sliderX }}
          drag="x"
          dragConstraints={{ left: -maxSliderWidth, right: maxSliderWidth }}
          onDrag={(_, info) => {
            const dragValue = (info.offset.x / maxSliderWidth) * 300;
            onSliderDrag(dragValue);
          }}
        >
          <div className="w-0 h-0 
                      border-l-[6px] border-l-transparent
                      border-r-[6px] border-r-transparent
                      border-t-[8px] border-t-yellow-400" />
        </motion.div>
      </div>
    </div>
  );
};

const MobileVotePanel = ({ left, right, onSubmitVote }) => {
  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);
  const magnitudeMotionValue = useMotionValue(50);

  useEffect(() => {
    requestAnimationFrame(() => {
      dragX.set(0);
      dragY.set(0);
      magnitudeMotionValue.set(50);
      magnitude.value = 50;
    });
  }, []);

  const handleDrag = (_, info) => {
    // Update X position and magnitude
    dragX.set(info.offset.x);
    const newMagnitude = Math.min(Math.max((info.offset.x + 300) / 6, 0), 100);
    magnitude.value = newMagnitude;
    magnitudeMotionValue.set(newMagnitude);

    // Track Y position
    dragY.set(info.offset.y);
  };

  const handleDragEnd = async (_, info) => {
    if (info.event?.preventDefault) {
      info.event.preventDefault();
      info.event.stopPropagation();
    }

    const upwardVelocityThreshold = -300;
    const upwardOffsetThreshold = -50;
    
    const isVerticalMotion = Math.abs(info.velocity.y) > Math.abs(info.velocity.x);
    const isUpwardSwipe = info.velocity.y < upwardVelocityThreshold || info.offset.y < upwardOffsetThreshold;

    if (isVerticalMotion && isUpwardSwipe) {
      // First reset only the Y position to complete the swipe animation
      animate(dragY, 0, { duration: 0.2 });
      
      // Wait a moment to ensure the swipe animation completes
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Submit the vote
      await onSubmitVote();
      
      // Only after vote is submitted, reset the other positions
      animate(dragX, 0, { duration: 0.3 });
      animate(magnitudeMotionValue, 50, { duration: 0.3 });
      magnitude.value = 50;
    } else {
      // For horizontal motions or non-swipe verticals, just reset Y
      animate(dragY, 0);
    }
  };

  const handleSliderDrag = (dragValue) => {
    dragX.set(dragValue);
    const newMagnitude = Math.min(Math.max((dragValue + 300) / 6, 0), 100);
    magnitude.value = newMagnitude;
    magnitudeMotionValue.set(newMagnitude);
  };

  return (
    <div className="fixed inset-0 touch-none bg-gray-100 dark:bg-gray-900">
      <div className="absolute inset-0 flex flex-col items-center z-10">
        <MobileVoteCard 
          item={left} 
          isTop={true}
          dragX={dragX}
          magnitudeMotionValue={magnitudeMotionValue}
        />
        <MobileVoteCard 
          item={right} 
          isTop={false}
          dragX={dragX}
          magnitudeMotionValue={magnitudeMotionValue}
        />
      </div>

      <div className="fixed bottom-16 left-0 right-0 z-30">
        <MobileVoteSlider 
          dragX={dragX} 
          onSliderDrag={handleSliderDrag}
        />
      </div>

      <motion.div
        className="absolute inset-0 z-20 touch-none"
        drag={true}
        dragDirectionLock={false}
        dragElastic={0.9}
        dragConstraints={{ left: -300, right: 300, top: 0, bottom: 0 }}
        dragMomentum={false}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        style={{ 
          x: dragX,
          y: dragY,
          pointerEvents: 'auto' 
        }}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      />
    </div>
  );
};

export const VotePanel = ({ handleError, isMobile = false }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  
  if (tag.value.pair === undefined || !tag.value.pair[0] || !tag.value.pair[1]) {
    return <div className="text-xl">no pair</div>;
  }

  const left = tag.value.pair[0];
  const right = tag.value.pair[1];

  useEffect(() => {
    const existingVote = tag.value.votes.find(vote => 
      (vote.right_item_id === left.id && vote.left_item_id === right.id) ||
      (vote.right_item_id === right.id && vote.left_item_id === left.id)
    );

    if (existingVote && current_session.value !== null && 
        existingVote.owner === current_session.value.user_name) {
      magnitude.value = existingVote.left_item_id === left.id ? 
        existingVote.magnitude : 100 - existingVote.magnitude;
    }
  }, [tag.value.votes]);

  const submitVote = async () => {
    try {
      await makeRequest("POST", "/api/vote", {
        "left_item_id": left["id"],
        "right_item_id": right["id"],
        "magnitude": magnitude.value,
        "attribute": tag.value.selected_attribute,
        "tag_id": tag.value.tag["id"],
      });

      magnitude.value = 50;
      await loadTag(tag.value.tag["id"]);
    } catch (error) {
      console.log("Error caught in VotePanel:", error);
      handleError(error);
    }
  };

  if (isMobile) {
    return <MobileVotePanel 
      left={left} 
      right={right} 
      onSubmitVote={submitVote}
    />;
  }

  // Desktop version remains unchanged
  const { leftMargin, rightMargin } = calculateMargin(magnitude.value);
  return (
    <div className="w-full justify-center page-padding-top">
      <div className="text-xl flex flex-row items-end">
        <div
          className="flex-1"
          style={{
            left: 0,
            width: "50%",
            marginBottom: leftMargin,
          }}
        >
          <ItemFull item={left} />
        </div>
        <div
          className="flex-2"
          style={{
            right: 0,
            width: "50%",
            marginBottom: rightMargin,
            justifyContent: "right",
          }}
        >
          <ItemFull item={right} right={true} />
        </div>
      </div>
      <input
        className="w-full h-10 bg-gray-300 dark:bg-gray-600 appearance-none cursor-pointer"
        type="range"
        min="0"
        max="100"
        step="1"
        value={magnitude.value}
        onChange={(e) => {
          magnitude.value = parseInt(e.target.value);
        }}
      />
      <button
        className="bigbutton border-8 w-full h-12 border-yellow-500"
        onClick={submitVote}
      >
        vote
      </button>
    </div>
  );
};
