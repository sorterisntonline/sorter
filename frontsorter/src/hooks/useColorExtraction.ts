import { useState, useEffect, useRef } from 'react';
import ColorThief from 'colorthief';
import chroma from 'chroma-js';

const useColorExtraction = (imageUrl) => {
  const [colors, setColors] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const imageRef = useRef(null);

  useEffect(() => {
    if (!imageUrl) {
      setColors(null);
      return;
    }

    console.log('🎨 useColorExtraction: Starting extraction for', imageUrl);
    setIsLoading(true);
    const colorThief = new ColorThief();

    const extractColors = async () => {
      try {
        if (imageRef.current && imageRef.current.complete && imageRef.current.naturalWidth > 0) {
          // Extract palette of 5 colors
          const palette = colorThief.getPalette(imageRef.current, 5, 10);
          const dominant = colorThief.getColor(imageRef.current, 10);

          if (palette && palette.length > 0) {
            // Convert RGB arrays to chroma objects
            const chromaColors = palette.map(rgb => chroma.rgb(rgb[0], rgb[1], rgb[2]));
            const dominantChroma = chroma.rgb(dominant[0], dominant[1], dominant[2]);

            // Find the most vibrant color for accents
            const vibrantColor = chromaColors.reduce((most, color) => {
              return color.get('hsl.s') > most.get('hsl.s') ? color : most;
            }, chromaColors[0]);

            // Create dark mode compatible colors
            const darkVibrant = vibrantColor.set('hsl.l', 0.3); // Darker version
            const accent = vibrantColor.set('hsl.l', 0.6); // Medium lightness for accents
            const lightAccent = vibrantColor.set('hsl.l', 0.8); // Light version

            // Create gradient scale: low scores = black (fade to background), high scores = vibrant
            const gradientScale = chroma.scale([
              chroma('#000000'),  // Low scores = pure black (disappears into background)
              chroma('#1a1a1a'),  // Very low = almost black
              darkVibrant,        // Medium-high scores = dark vibrant
              accent,             // High scores = vibrant accent
              vibrantColor        // Highest scores = most vibrant
            ]).mode('lch');

            const colorResult = {
              palette: chromaColors,
              dominant: dominantChroma,
              vibrant: vibrantColor,
              darkVibrant,
              accent,
              lightAccent,
              gradientScale,
              // CSS-ready colors
              css: {
                dominant: dominantChroma.hex(),
                vibrant: vibrantColor.hex(),
                darkVibrant: darkVibrant.hex(),
                accent: accent.hex(),
                lightAccent: lightAccent.hex(),
                gradient: `linear-gradient(135deg, ${darkVibrant.hex()}, ${accent.hex()}, ${lightAccent.hex()})`,
                radialGradient: `radial-gradient(circle at center, ${accent.hex()}, ${darkVibrant.hex()})`
              }
            };
            
            console.log('🎨 Color extraction complete:', colorResult.css);
            setColors(colorResult);
          }
        }
      } catch (error) {
        console.error('Color extraction error:', error);
        setColors(null);
      } finally {
        setIsLoading(false);
      }
    };

    // Create a fresh image element for each extraction to avoid caching issues
    const img = new Image();
    img.crossOrigin = 'anonymous';
    imageRef.current = img;
    
    if (img.complete && img.naturalWidth > 0) {
      extractColors();
    } else {
      img.onload = extractColors;
      img.onerror = () => {
        console.error('Failed to load image for color extraction:', imageUrl);
        setColors(null);
        setIsLoading(false);
      };
      img.src = imageUrl;
    }

    return () => {
      if (img) {
        img.onload = null;
        img.onerror = null;
      }
    };
  }, [imageUrl]);

  return { colors, isLoading };
};

export default useColorExtraction;
