import { makeRequest, loadTag } from "./Network";
import { tag, magnitude } from "./App";
import { ItemFull } from "./ItemPanel";
import { current_session } from "./session";
import { useEffect, useState, useRef } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { Item } from "./Item";
import { VoteStreak } from './components/VoteStreak';
import { getWavelength, wavelengthToColor, getRainbowColor } from './utils/colorUtils';
import { getVoteEmoji } from './constants/voting_extras';

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

  // Helper to extract first media from markdown
  const extractFirstMedia = (markdown) => {
    const imageRegex = /!\[.*?\]\((.*?)\)/;
    const videoRegex = /\[video\]\((.*?)\)/;  // Adjust based on your markdown format
    
    const imageMatch = markdown.match(imageRegex);
    const videoMatch = markdown.match(videoRegex);
    
    return imageMatch?.[1] || videoMatch?.[1] || null;
  };

  // Handle Spotify content
  const getSpotifyContent = async () => {
    if (!item.domain_pk_namespace?.startsWith('spotify.')) return null;
    
    const [type, id] = item.domain_pk_namespace.split('.');
    try {
      // For now, just return the artwork URL
      // TODO: Implement proper Spotify API call to get artwork
      return `https://i.scdn.co/image/${item.domain_pk}`;
    } catch (error) {
      console.error('Failed to fetch Spotify content:', error);
      return null;
    }
  };

  useEffect(() => {
    const setupMedia = async () => {
      // Case 1: Direct image/URL
      if (item.url) {
        setMediaUrl(item.url);
        return;
      }

      // Case 2: Spotify content
      if (item.domain_pk_namespace?.startsWith('spotify.')) {
        const spotifyContent = await getSpotifyContent();
        if (spotifyContent) {
          setMediaUrl(spotifyContent);
          return;
        }
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

  const opacity = useTransform(
    magnitudeMotionValue,
    [0, 50, 100],
    isTop ? [1, 1, 0.6] : [0.6, 1, 1]
  );

  const scale = useTransform(
    magnitudeMotionValue,
    [0, 50, 100],
    isTop ? [1.05, 0.95, 0.95] : [0.95, 0.95, 1.05]
  );

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
        opacity,
        scale,
        zIndex: useTransform(
          magnitudeMotionValue,
          [0, 50, 100],
          isTop ? [2, 1, 1] : [1, 1, 2]
        ),
      }}
    >
      {/* Media Content */}
      {mediaUrl && (
        <div
          className="absolute inset-0 bg-center bg-cover"
          style={{ 
            backgroundImage: `url(${mediaUrl})`,
          }}
        />
      )}

      {/* Text Content */}
      <div className={`absolute bottom-0 left-0 right-0 p-4 
        ${mediaUrl ? 'bg-gradient-to-t from-black/80 to-transparent' : 'h-full flex flex-col justify-center'}`}>
        <h3 className={`text-xl font-bold ${mediaUrl ? 'text-white' : 'text-black dark:text-white'}`}>
          {item.title}
        </h3>
        {!mediaUrl && item.description && (
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
        cancelAnimationFrame(animationFrame);
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

  const handleDragEnd = async (_, info) => {
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
      (info.velocity.y < upwardVelocityThreshold || info.offset.y < upwardOffsetThreshold) || // Upward swipe
      (info.velocity.y > downwardVelocityThreshold || info.offset.y > downwardOffsetThreshold); // Downward swipe
    
    // Check if enough time has passed or if magnitude has changed
    const timeElapsed = Date.now() - mountTime.current;
    const canSubmit = hasMagnitudeChanged.current || timeElapsed > 3000;

    if (isVerticalMotion && isSwipe && canSubmit) {
      // First reset only the Y position to complete the swipe animation
      animate(dragY, 0, { duration: 0.2 });
      
      // Wait a moment to ensure the swipe animation completes
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Submit the vote
      await onSubmitVote();
      
      // Reset everything after submission
      animate(dragX, 0, { duration: 0.3 });
      animate(magnitudeMotionValue, 50, { duration: 0.3 });
      magnitude.value = 50;
      mountTime.current = Date.now();
      hasMagnitudeChanged.current = false;
    } else {
      // For horizontal motions or non-swipe verticals, just reset Y
      animate(dragY, 0);
    }
  };

  const handleSliderDrag = (dragValue) => {
    dragX.set(dragValue);
    const newMagnitude = Math.min(Math.max((dragValue + 300) / 6, 0), 100);
    
    // Also track magnitude changes from slider
    if (Math.abs(newMagnitude - 50) > 1) {
      hasMagnitudeChanged.current = true;
    }
    
    magnitude.value = newMagnitude;
    magnitudeMotionValue.set(newMagnitude);
  };

  return (
    <motion.div
      className="fixed inset-0 touch-none transition-colors duration-1000"
      style={{ 
        backgroundColor: getBgColor(),
      }}
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
          onSliderDrag={handleSliderDrag}
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

export const VotePanel = ({ handleError, isMobile = false }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [voteCount, setVoteCount] = useState(0);
  const [justVoted, setJustVoted] = useState(false);
  
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

      setVoteCount(prev => prev + 1);
      setJustVoted(true);
      setTimeout(() => setJustVoted(false), 300);

      magnitude.value = 50;
      await loadTag(tag.value.tag["id"]);
    } catch (error) {
      console.log("Error caught in VotePanel:", error);
      handleError(error);
    }
  };

  if (isMobile) {
    return (
      <>
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
