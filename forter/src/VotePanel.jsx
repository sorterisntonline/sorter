import { makeRequest, loadTag } from "./Network";
import { tag, magnitude, selected_item, drawer_open, current_attribute } from "./App";
import { ItemFull } from "./ItemPanel";
import { current_session } from "./session";
import { useEffect, useState, useRef } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { Item } from "./Item";
import { VoteStreak } from './components/VoteStreak';
import { getWavelength, wavelengthToColor, getRainbowColor } from './utils/colorUtils';
import { getVoteEmoji } from './constants/voting_extras';
import { handleApiError } from './ErrorHandler';
import { withAuth } from './utils/withAuth';
import { TopBanner } from './components/TopBanner';

const calculateMargin = (magnitude) => {
  if (magnitude < 50) {
    return { leftMargin: 50 - magnitude, rightMargin: 0 };
  } else {
    return { leftMargin: 0, rightMargin: magnitude - 50 };
  }
};

const MobileVoteCard = ({ item, isTop, dragX, magnitudeMotionValue }) => {
  const [mediaUrl, setMediaUrl] = useState(null);
  const [isIframeSupported, setIsIframeSupported] = useState(true);
  const lastClickTime = useRef(0);
  
  // Add click handler for title area
  const handleTitleClick = (e) => {
    e.stopPropagation();
    
    const clickTime = Date.now();
    if (clickTime - lastClickTime.current < 300) {
      console.log('Double tap on title - resetting magnitude');
      magnitude.value = 50;
      magnitudeMotionValue.set(50);
      dragX.set(0);
      lastClickTime.current = 0;
      return;
    }
    
    lastClickTime.current = clickTime;
    console.log('Opening drawer for item:', item.id);
    selected_item.value = item;
    drawer_open.value = true;
  };

  // Helper to extract first media from markdown
  const extractFirstMedia = (markdown) => {
    const imageRegex = /!\[.*?\]\((.*?)\)/;
    const videoRegex = /\[video\]\((.*?)\)/;  // Adjust based on your markdown format
    
    const imageMatch = markdown.match(imageRegex);
    const videoMatch = markdown.match(videoRegex);
    
    return imageMatch?.[1] || videoMatch?.[1] || null;
  };

  useEffect(() => {
    const setupMedia = async () => {
      // Case 1: Direct image/URL
      if (item.url && (item.domain_pk_namespace === "IMG" || item.domain_pk_namespace === "reddit.post")) {
        setMediaUrl(item.url);
        return;
      }

      // Case 2: Spotify content
      if (item.domain_pk_namespace === "spotify.track") {
        setIsIframeSupported(true);
        return;
      }

      // Case 3: Media in description
      if (item.description) {
        const mediaFromDescription = extractFirstMedia(item.description);
        if (mediaFromDescription) {
          setMediaUrl(mediaFromDescription);
          return;
        }
      }
    };

    setupMedia();
  }, [item]);

  return (
    <motion.div
      className="absolute w-[90vw] h-[38vh] rounded-xl overflow-hidden bg-white dark:bg-gray-800 shadow-lg"
      style={{
        top: isTop ? '4vh' : '42vh',
        y: useTransform(
          magnitudeMotionValue,
          [0, 50, 100],
          isTop ? [200, 0, 0] : [0, 0, -200]
        ),
        opacity: useTransform(
          magnitudeMotionValue,
          [0, 50, 100],
          isTop ? [1, 1, 0.6] : [0.6, 1, 1]
        ),
        scale: useTransform(
          magnitudeMotionValue,
          [0, 50, 100],
          isTop ? [1.05, 0.95, 0.95] : [0.95, 0.95, 1.05]
        ),
        zIndex: useTransform(
          magnitudeMotionValue,
          [0, 50, 100],
          isTop ? [2, 1, 1] : [1, 1, 2]
        ),
      }}
    >
      {/* Media Content */}
      {mediaUrl ? (
        <div
          className="absolute inset-0 bg-center bg-cover"
          style={{ 
            backgroundImage: `url(${mediaUrl})`,
          }}
        />
      ) : item.domain_pk_namespace === "spotify.track" ? (
        <div className="absolute inset-0 pointer-events-auto">
          <iframe
            src={`https://open.spotify.com/embed/track/${item.domain_pk}`}
            width="100%"
            height="100%"
            allowtransparency="true"
            allow="encrypted-media"
            style={{ border: 'none' }}
          />
        </div>
      ) : null}

      {/* Text Content - Always clickable */}
      <div 
        onClick={handleTitleClick}
        className={`absolute bottom-0 left-0 right-0 p-4 cursor-pointer
          ${(mediaUrl || item.domain_pk_namespace === "spotify.track") ? 
            'bg-gradient-to-t from-black/80 to-transparent' : 
            'h-full flex flex-col justify-center'}`}
      >
        <h3 className={`text-xl font-bold ${(mediaUrl || item.domain_pk_namespace === "spotify.track") ? 
          'text-white' : 'text-black dark:text-white'}`}>
          {item.title}
        </h3>
        {!mediaUrl && !item.domain_pk_namespace === "spotify.track" && item.description && (
          <p className="text-sm text-gray-600 dark:text-gray-300 text-left mt-2">
            {item.description.substring(0, 150)}
            {item.description.length > 150 ? '...' : ''}
          </p>
        )}
      </div>
    </motion.div>
  );
};

const MobileVoteSlider = ({ dragX, onSliderDrag, voteCount }) => {
  const maxSliderWidth = window.innerWidth * 0.45;

  const sliderX = useTransform(
    dragX,
    [-300, 0, 300],
    [-maxSliderWidth, 0, maxSliderWidth]
  );

  return (
    <div className="h-14 flex items-center justify-center">
      <div className="w-[90vw] h-0.5 bg-gray-300 dark:bg-gray-600 rounded relative">
        <motion.div
          className="absolute top-0 left-1/2 -translate-y-[10px] -translate-x-1/2"
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
          {/* Container for indicator with right offset */}
          <div className="relative right-3 -top-2 w-6 h-6 flex items-center justify-center cursor-grab active:cursor-grabbing">
            <div className="text-2xl select-none">
              {getVoteEmoji(voteCount) || (
                <div className="w-0 h-0 
                            border-l-[6px] border-l-transparent
                            border-r-[6px] border-r-transparent
                            border-b-[8px] border-yellow-400
                            dark:border-yellow-500" />
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

const MobileVotePanel = ({ left, right, onSubmitVote, voteCount }) => {
  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);
  const magnitudeMotionValue = useMotionValue(50);
  const [rainbowTime, setRainbowTime] = useState(0);
  const lastClickTime = useRef(0);
  const tapTimeout = useRef(null);
  const tapStartPosition = useRef({ x: 0, y: 0 });
  const isTapSequence = useRef(false);
  
  // Add refs to track state
  const hasMagnitudeChanged = useRef(false);
  const mountTime = useRef(Date.now());

  useEffect(() => {
    requestAnimationFrame(() => {
      dragX.set(0);
      dragY.set(0);
      magnitudeMotionValue.set(50);
      magnitude.value = 50;
      mountTime.current = Date.now();
      hasMagnitudeChanged.current = false;
    });
  }, []);

  // Background color animation
  useEffect(() => {
    let animationFrame;
    
    const updateBackground = () => {
      if (voteCount >= 400) {
        // Rainbow mode
        setRainbowTime(prev => (prev + 16) % 6000); // Increment by 16ms (roughly 60fps)
      }
      animationFrame = requestAnimationFrame(updateBackground);
    };

    if (voteCount >= 25) {
      animationFrame = requestAnimationFrame(updateBackground);
    }

    return () => {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, [voteCount]);

  // Calculate background color
  const getBgColor = () => {
    if (voteCount < 25) return 'bg-gray-100 dark:bg-gray-900';
    
    const color = voteCount >= 400 
      ? getRainbowColor(rainbowTime)
      : wavelengthToColor(getWavelength(voteCount));
    
    // Convert RGB to RGBA with low opacity
    const opacity = voteCount >= 400 ? 0.15 : 0.1;
    return color.replace('rgb', 'rgba').replace(')', `, ${opacity})`);
  };

  const handleDrag = (_, info) => {
    // Update X position and magnitude
    dragX.set(info.offset.x);
    const newMagnitude = Math.min(Math.max((info.offset.x + 300) / 6, 0), 100);
    
    // Check if magnitude has changed significantly (more than 1%)
    if (Math.abs(newMagnitude - 50) > 1) {
      hasMagnitudeChanged.current = true;
    }
    
    magnitude.value = newMagnitude;
    magnitudeMotionValue.set(newMagnitude);
    dragY.set(info.offset.y);
  };

  const handleTapStart = (e) => {
    // Record the starting position of the tap
    tapStartPosition.current = {
      x: dragX.get(),
      y: dragY.get()
    };
    isTapSequence.current = true;
    console.log('Tap start detected at:', tapStartPosition.current);
  };

  const handleDragEnd = async (_, info) => {
    // Reset tap sequence flag since this was a drag
    isTapSequence.current = false;
    
    if (info.event?.preventDefault) {
      info.event.preventDefault();
      info.event.stopPropagation();
    }

    const upwardVelocityThreshold = -300;
    const downwardVelocityThreshold = 300;
    const upwardOffsetThreshold = -50;
    const downwardOffsetThreshold = 50;
    
    const isVerticalMotion = Math.abs(info.velocity.y) > Math.abs(info.velocity.x);
    const isSwipe = 
      (info.velocity.y < upwardVelocityThreshold || info.offset.y < upwardOffsetThreshold) || 
      (info.velocity.y > downwardVelocityThreshold || info.offset.y > downwardOffsetThreshold);
    
    const timeElapsed = Date.now() - mountTime.current;
    const canSubmit = hasMagnitudeChanged.current || timeElapsed > 3000;

    if (isVerticalMotion && isSwipe && canSubmit) {
      animate(dragY, 0, { duration: 0.2 });
      await new Promise(resolve => setTimeout(resolve, 50));
      await onSubmitVote();
      animate(dragX, 0, { duration: 0.3 });
      animate(magnitudeMotionValue, 50, { duration: 0.3 });
      magnitude.value = 50;
      mountTime.current = Date.now();
      hasMagnitudeChanged.current = false;
    } else {
      // Only animate Y back to center, preserve X for slider position
      animate(dragY, 0, { duration: 0.3 });
    }
  };

  const handleTap = (e) => {
    console.log('Tap detected', Date.now() - lastClickTime.current);

    // Only process tap if we're in a tap sequence
    if (!isTapSequence.current) {
      console.log('Ignoring tap - not part of tap sequence');
      return;
    }

    // Get current position
    const currentX = dragX.get();
    const currentY = dragY.get();
    const startX = tapStartPosition.current.x;
    const startY = tapStartPosition.current.y;

    // Calculate total movement during the tap
    const totalMovement = Math.sqrt(
      Math.pow(currentX - startX, 2) + 
      Math.pow(currentY - startY, 2)
    );

    const dragThreshold = 20;
    if (totalMovement > dragThreshold) {
      console.log('Ignoring tap due to movement', { 
        start: tapStartPosition.current,
        end: { x: currentX, y: currentY },
        movement: totalMovement 
      });
      isTapSequence.current = false;
      return;
    }

    if (tapTimeout.current) {
      clearTimeout(tapTimeout.current);
    }

    const clickTime = Date.now();
    if (clickTime - lastClickTime.current < 300) {
      console.log('Double tap detected - resetting magnitude');
      animate(magnitudeMotionValue, 50, { duration: 0.3 });
      animate(dragX, 0, { duration: 0.3 });
      animate(dragY, 0, { duration: 0.3 });
      magnitude.value = 50;
      lastClickTime.current = 0;
      isTapSequence.current = false;
      return;
    }
    
    lastClickTime.current = clickTime;

    tapTimeout.current = setTimeout(() => {
      if (Date.now() - lastClickTime.current >= 300) {
        const tapY = e.clientY;
        const windowHeight = window.innerHeight;
        const isTopHalf = tapY < windowHeight / 2;
        
        const selectedItem = isTopHalf ? left : right;
        console.log('Opening drawer for item:', selectedItem.id);
        selected_item.value = selectedItem;
        drawer_open.value = true;
      }
      isTapSequence.current = false;
    }, 300);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (tapTimeout.current) {
        clearTimeout(tapTimeout.current);
      }
    };
  }, []);

  return (
    <motion.div
      className="fixed inset-0 touch-none transition-colors duration-1000"
      style={{ backgroundColor: getBgColor() }}
    >
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
          onSliderDrag={handleDrag}
          voteCount={voteCount}
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
        onTapStart={handleTapStart}
        onTap={handleTap}
        style={{ 
          x: dragX,
          y: dragY,
          pointerEvents: 'auto' 
        }}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      />
    </motion.div>
  );
};

const VotePanelComponent = ({ handleError, isMobile = false }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [voteCount, setVoteCount] = useState(0);
  const [justVoted, setJustVoted] = useState(false);
  const [isRateLimited, setIsRateLimited] = useState(false);
  
  const hasPair = tag.value.pair !== undefined && tag.value.pair[0] && tag.value.pair[1];
  const left = hasPair ? tag.value.pair[0] : null;
  const right = hasPair ? tag.value.pair[1] : null;

  useEffect(() => {
    if (hasPair && tag.value.votes) {
      const existingVote = tag.value.votes.find(vote => 
        (vote.right_item_id === left.id && vote.left_item_id === right.id) ||
        (vote.right_item_id === right.id && vote.left_item_id === left.id)
      );

      if (existingVote && current_session.value !== null && 
          existingVote.owner === current_session.value.user_name) {
        magnitude.value = existingVote.left_item_id === left.id ? 
          existingVote.magnitude : 100 - existingVote.magnitude;
      }
    }
  }, [tag.value.votes, hasPair, left, right]);

  if (!hasPair) {
    return <div className="text-xl">no pair</div>;
  }

  const submitVote = async () => {
    try {
      await makeRequest("POST", "/api/vote", {
        "left_item_id": left["id"],
        "right_item_id": right["id"],
        "magnitude": magnitude.value,
        "attribute": current_attribute.value?.id,
        "tag_id": tag.value.tag["id"],
      });

      setVoteCount(prev => prev + 1);
      setJustVoted(true);
      setTimeout(() => setJustVoted(false), 300);

      magnitude.value = 50;
      await loadTag(tag.value.tag["id"]);
    } catch (error) {
      if (error.status === 429) {
        setIsRateLimited(true);
      } else {
        handleApiError(error);
      }
    }
  };

  if (isMobile) {
    return (
      <>
        <TopBanner
          isOpen={isRateLimited}
          onClose={() => setIsRateLimited(false)}
          duration={5000}
        >
          Please consider your vote more carefully before submitting. You're voting too quickly!
        </TopBanner>
        <MobileVotePanel 
          left={left} 
          right={right} 
          onSubmitVote={submitVote}
          voteCount={voteCount}
        />
        <VoteStreak voteCount={voteCount} justVoted={justVoted} />
      </>
    );
  }

  // Desktop version remains unchanged
  const { leftMargin, rightMargin } = calculateMargin(magnitude.value);
  return (
    <>
      <TopBanner
        isOpen={isRateLimited}
        onClose={() => setIsRateLimited(false)}
        duration={5000}
      >
        Please consider your vote more carefully before submitting. You're voting too quickly!
      </TopBanner>
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
    </>
  );
};

export const VotePanel = withAuth(VotePanelComponent, { showError: false });
