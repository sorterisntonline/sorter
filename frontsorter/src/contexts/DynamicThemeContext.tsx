import React, { createContext, useContext, useState, useEffect, CSSProperties } from 'react';
import chroma from 'chroma-js';
import useColorExtraction from '../hooks/useColorExtraction';
import { DynamicThemeContextType, DynamicThemeProviderProps, ThemeColors } from '../types/contexts';

const DynamicThemeContext = createContext<DynamicThemeContextType | undefined>(undefined);

export const useDynamicTheme = () => {
  const context = useContext(DynamicThemeContext);
  if (!context) {
    throw new Error('useDynamicTheme must be used within a DynamicThemeProvider');
  }
  return context;
};

export const DynamicThemeProvider = ({ children }: DynamicThemeProviderProps) => {
  const [currentImageUrl, setCurrentImageUrl] = useState(null);
  const [rightImageUrl, setRightImageUrl] = useState(null);
  
  // Separate theme states for left and right panels
  const [leftTheme, setLeftTheme] = useState<ThemeColors>({
    primary: '#1a1a1a',
    secondary: '#2a2a2a',
    accent: '#3b82f6',
    accentDark: '#1e40af',
    accentLight: '#60a5fa',
    text: '#ffffff',
    textSecondary: '#a1a1aa',
    border: '#404040',
    gradient: 'linear-gradient(135deg, #3b82f6, #1a1a1a)',
    radialGradient: 'radial-gradient(circle at center, #3b82f6, #1a1a1a)'
  });

  const [rightTheme, setRightTheme] = useState<ThemeColors>({
    primary: '#1a1a1a',
    secondary: '#2a2a2a',
    accent: '#f59e0b',
    accentDark: '#d97706',
    accentLight: '#fbbf24',
    text: '#ffffff',
    textSecondary: '#a1a1aa',
    border: '#404040',
    gradient: 'linear-gradient(135deg, #f59e0b, #1a1a1a)',
    radialGradient: 'radial-gradient(circle at center, #f59e0b, #1a1a1a)'
  });

  const { colors: extractedColors, isLoading } = useColorExtraction(currentImageUrl);
  const { colors: rightExtractedColors, isLoading: isLoadingRight } = useColorExtraction(rightImageUrl);

  // Update left theme when left image colors are extracted
  useEffect(() => {
    if (extractedColors) {
      console.log('🎨 DynamicThemeContext: Updating left theme with new colors', extractedColors.css);
      setLeftTheme(prevTheme => ({
        ...prevTheme,
        accent: extractedColors.css.accent,
        accentDark: extractedColors.css.darkVibrant,
        accentLight: extractedColors.css.lightAccent,
        gradient: extractedColors.css.gradient,
        radialGradient: extractedColors.css.radialGradient
      }));
    }
  }, [extractedColors]);

  // Update right theme when right image colors are extracted
  useEffect(() => {
    if (rightExtractedColors) {
      console.log('🎨 DynamicThemeContext: Updating right theme with new colors', rightExtractedColors.css);
      setRightTheme(prevTheme => ({
        ...prevTheme,
        accent: rightExtractedColors.css.accent,
        accentDark: rightExtractedColors.css.darkVibrant,
        accentLight: rightExtractedColors.css.lightAccent,
        gradient: rightExtractedColors.css.gradient,
        radialGradient: rightExtractedColors.css.radialGradient
      }));
    }
  }, [rightExtractedColors]);

  const updateThemeFromImage = async (imageUrl: string) => {
    console.log('🎨 updateThemeFromImage called with:', imageUrl);
    setCurrentImageUrl(imageUrl);
  };

  const updateRightThemeFromImage = async (imageUrl: string) => {
    console.log('🎨 updateRightThemeFromImage called with:', imageUrl);
    setRightImageUrl(imageUrl);
  };

  const getScoreColors = (score: number, scoreRange = { min: 0, max: 1 }) => {
    console.log('🎨 getScoreColors called with score:', score, 'extractedColors:', !!extractedColors, 'gradientScale:', !!extractedColors?.gradientScale);
    
    if (!extractedColors || !extractedColors.gradientScale) {
      // Fallback to blue scale - but make it more vibrant
      console.log('🎨 Using fallback colors (no extraction available)');
      const normalizedScore = (score - scoreRange.min) / (scoreRange.max - scoreRange.min);
      const blueScale = ['#1e40af', '#3b82f6', '#60a5fa', '#93c5fd', '#dbeafe'];
      const color = blueScale[Math.floor(normalizedScore * (blueScale.length - 1))] || blueScale[0];
      return {
        color: normalizedScore > 0.5 ? '#000000' : '#ffffff',
        backgroundColor: color
      };
    }

    const normalizedScore = Math.max(0, Math.min(1, (score - scoreRange.min) / (scoreRange.max - scoreRange.min)));
    const backgroundColor = extractedColors.gradientScale(normalizedScore).hex();
    const color = extractedColors.gradientScale(normalizedScore).luminance() > 0.5 ? '#000000' : '#ffffff';
    
    console.log('🎨 Using extracted colors - backgroundColor:', backgroundColor, 'textColor:', color);
    return { color, backgroundColor };
  };

  const getRightScoreColors = (score: number, scoreRange = { min: 0, max: 1 }) => {
    if (!rightExtractedColors || !rightExtractedColors.gradientScale) {
      // Fallback to orange scale for right side
      const normalizedScore = (score - scoreRange.min) / (scoreRange.max - scoreRange.min);
      const orangeScale = ['#92400e', '#f59e0b', '#fbbf24', '#fed7aa', '#ffffff'];
      const color = orangeScale[Math.floor(normalizedScore * (orangeScale.length - 1))] || orangeScale[0];
      return {
        color: normalizedScore > 0.5 ? '#000000' : '#ffffff',
        backgroundColor: color
      };
    }

    const normalizedScore = Math.max(0, Math.min(1, (score - scoreRange.min) / (scoreRange.max - scoreRange.min)));
    const backgroundColor = rightExtractedColors.gradientScale(normalizedScore).hex();
    const color = rightExtractedColors.gradientScale(normalizedScore).luminance() > 0.5 ? '#000000' : '#ffffff';

    return { color, backgroundColor };
  };

  const getCSSVariables = () => {
    // Create semi-transparent background colors from the accents
    const leftAccentBg = leftTheme.accent 
      ? chroma(leftTheme.accent).alpha(0.15).css()
      : 'rgba(33, 150, 243, 0.1)';
    
    const rightAccentBg = rightTheme.accent 
      ? chroma(rightTheme.accent).alpha(0.15).css()
      : 'rgba(245, 158, 11, 0.1)';
    
    return {
      // Left panel theme variables (from leftTheme state)
      '--theme-primary': leftTheme.primary,
      '--theme-secondary': leftTheme.secondary,
      '--theme-accent': leftTheme.accent,
      '--theme-accent-dark': leftTheme.accentDark || leftTheme.accent,
      '--theme-accent-light': leftTheme.accentLight || leftTheme.accent,
      '--theme-accent-bg': leftAccentBg,
      '--theme-text': leftTheme.text,
      '--theme-text-secondary': leftTheme.textSecondary,
      '--theme-border': leftTheme.border,
      '--theme-gradient': leftTheme.gradient || `linear-gradient(135deg, ${leftTheme.accent}, ${leftTheme.primary})`,
      '--theme-radial-gradient': leftTheme.radialGradient || `radial-gradient(circle at center, ${leftTheme.accent}, ${leftTheme.primary})`,
      
      // Right panel theme variables (from rightTheme state)
      '--right-theme-primary': rightTheme.primary,
      '--right-theme-secondary': rightTheme.secondary,
      '--right-theme-accent': rightTheme.accent,
      '--right-theme-accent-dark': rightTheme.accentDark || rightTheme.accent,
      '--right-theme-accent-light': rightTheme.accentLight || rightTheme.accent,
      '--right-theme-accent-bg': rightAccentBg,
      '--right-theme-text': rightTheme.text,
      '--right-theme-text-secondary': rightTheme.textSecondary,
      '--right-theme-border': rightTheme.border,
      '--right-theme-gradient': rightTheme.gradient || `linear-gradient(135deg, ${rightTheme.accent}, ${rightTheme.primary})`,
      '--right-theme-radial-gradient': rightTheme.radialGradient || `radial-gradient(circle at center, ${rightTheme.accent}, ${rightTheme.primary})`
    };
  };

  const value = {
    theme: leftTheme, // Keep backward compatibility
    leftTheme,
    rightTheme,
    updateThemeFromImage,
    updateRightThemeFromImage,
    getScoreColors,
    getRightScoreColors,
    getCSSVariables,
    isExtractingColors: isLoading,
    isExtractingRightColors: isLoadingRight,
    extractedColors,
    rightExtractedColors
  };

  return (
    <DynamicThemeContext.Provider value={value}>
      <div style={getCSSVariables() as CSSProperties}>
        {children}
      </div>
    </DynamicThemeContext.Provider>
  );
};

export default DynamicThemeProvider;
