import React, { createContext, useContext, useState, useEffect, CSSProperties } from 'react';
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
  const [theme, setTheme] = useState<ThemeColors>({
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

  const { colors: extractedColors, isLoading } = useColorExtraction(currentImageUrl);

  useEffect(() => {
    if (extractedColors) {
      console.log('🎨 DynamicThemeContext: Updating theme with new colors', extractedColors.css);
      setTheme(prevTheme => ({
        ...prevTheme,
        accent: extractedColors.css.accent,
        accentDark: extractedColors.css.darkVibrant,
        accentLight: extractedColors.css.lightAccent,
        gradient: extractedColors.css.gradient,
        radialGradient: extractedColors.css.radialGradient
      }));
    }
  }, [extractedColors]);

  const updateThemeFromImage = async (imageUrl: string) => {
    console.log('🎨 updateThemeFromImage called with:', imageUrl);
    setCurrentImageUrl(imageUrl);
  };

  const getScoreColors = (score: number, scoreRange = { min: 0, max: 1 }) => {
    if (!extractedColors || !extractedColors.gradientScale) {
      // Fallback to blue scale
      const normalizedScore = (score - scoreRange.min) / (scoreRange.max - scoreRange.min);
      const blueScale = ['#1e3a8a', '#3b82f6', '#93c5fd', '#dbeafe', '#ffffff'];
      const color = blueScale[Math.floor(normalizedScore * (blueScale.length - 1))] || blueScale[0];
      return {
        color: normalizedScore > 0.5 ? '#000000' : '#ffffff',
        backgroundColor: color
      };
    }

    const normalizedScore = Math.max(0, Math.min(1, (score - scoreRange.min) / (scoreRange.max - scoreRange.min)));
    const backgroundColor = extractedColors.gradientScale(normalizedScore).hex();
    const color = extractedColors.gradientScale(normalizedScore).luminance() > 0.5 ? '#000000' : '#ffffff';

    return { color, backgroundColor };
  };

  const getCSSVariables = () => {
    return {
      '--theme-primary': theme.primary,
      '--theme-secondary': theme.secondary,
      '--theme-accent': theme.accent,
      '--theme-accent-dark': theme.accentDark || theme.accent,
      '--theme-accent-light': theme.accentLight || theme.accent,
      '--theme-text': theme.text,
      '--theme-text-secondary': theme.textSecondary,
      '--theme-border': theme.border,
      '--theme-gradient': theme.gradient || `linear-gradient(135deg, ${theme.accent}, ${theme.primary})`,
      '--theme-radial-gradient': theme.radialGradient || `radial-gradient(circle at center, ${theme.accent}, ${theme.primary})`
    };
  };

  const value = {
    theme,
    updateThemeFromImage,
    getScoreColors,
    getCSSVariables,
    isExtractingColors: isLoading,
    extractedColors
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
