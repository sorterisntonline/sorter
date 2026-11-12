// Special one-time-only emoji thresholds
export const SPECIAL_VOTE_EMOJIS = {
  69: "🍆",
  100: "💯",
  420: "🍃",
};

// Progressive emoji thresholds
export const PROGRESSIVE_VOTE_EMOJIS = [
  { threshold: 10, emoji: "😎" },
  { threshold: 20, emoji: "🤭" },
  { threshold: 50, emoji: "🥳" },
  { threshold: 75, emoji: "❤️‍🔥" },
  { threshold: 101, emoji: "🍾" },
  { threshold: 144, emoji: "🚔²" },
];

// Random emojis for after 420
export const POST_420_EMOJIS = [
  "🌈", "🎨", "🎭", "🎪", "🎢", "🎡", "🎠", "🎮",
  "🎲", "🎯", "🎳", "🎹", "🎷", "🎺", "🎸", "🎻",
  "🎬", "🎨", "🎭", "🎪", "🎢", "🎡", "🎠", "🎮",
];

export const getVoteEmoji = (voteCount) => {
  // Check special one-time emojis first
  if (SPECIAL_VOTE_EMOJIS[voteCount]) {
    return SPECIAL_VOTE_EMOJIS[voteCount];
  }

  // After 420, cycle through random emojis every 25 votes
  if (voteCount > 420) {
    const index = Math.floor((voteCount - 421) / 25) % POST_420_EMOJIS.length;
    return POST_420_EMOJIS[index];
  }

  // Before 10 votes, return null to show triangle
  if (voteCount < 10) {
    return null;
  }

  // Find the appropriate progressive emoji
  const progressiveEmoji = [...PROGRESSIVE_VOTE_EMOJIS]
    .reverse()
    .find(({ threshold }) => voteCount >= threshold);

  return progressiveEmoji?.emoji || null;
}; 