import React, { createContext, useContext, useState, useEffect } from 'react';
import useColorExtraction from '../hooks/useColorExtraction';

const DynamicThemeContext = createContext();

export const useDynamicTheme = () => {
  const context = useContext(DynamicThemeContext);
  if (!context) {
    throw new Error('useDynamicTheme must be used within a DynamicThemeProvider');
  }
  return context;
};

export const DynamicThemeProvider = ({ children }) => {
  const [currentImageUrl, setCurrentImageUrl] = useState(null);
  const [theme, setTheme] = useState({
    isDark: true,
    colors: {
      primary: '#1a1a1a',
      secondary: '#2a2a2a',
      accent: '#3b82f6',
      text: '#ffffff',
      textSecondary: '#a1a1aa',
      border: '#404040'
    }
  });

  const { colors: extractedColors, isLoading } = useColorExtraction(currentImageUrl);

  useEffect(() => {
    if (extractedColors) {
      setTheme(prevTheme => ({
        ...prevTheme,
        colors: {
          ...prevTheme.colors,
          accent: extractedColors.css.accent,
          accentDark: extractedColors.css.darkVibrant,
          accentLight: extractedColors.css.lightAccent,
          gradient: extractedColors.css.gradient,
          radialGradient: extractedColors.css.radialGradient,
          vibrant: extractedColors.css.vibrant
        },
        extractedColors
      }));
    }
  }, [extractedColors]);

  const updateThemeFromImage = (imageUrl) => {
    setCurrentImageUrl(imageUrl);
  };

  const getScoreColors = (score, scoreRange = { min: 0, max: 1 }) => {
    if (!extractedColors || !extractedColors.gradientScale) {
      // Fallback to blue scale
      const normalizedScore = (score - scoreRange.min) / (scoreRange.max - scoreRange.min);
      const blueScale = ['#1e3a8a', '#3b82f6', '#93c5fd', '#dbeafe', '#ffffff'];
      const color = blueScale[Math.floor(normalizedScore * (blueScale.length - 1))] || blueScale[0];
      return {
        backgroundColor: color,
        textColor: normalizedScore > 0.5 ? '#000000' : '#ffffff'
      };
    }

    const normalizedScore = Math.max(0, Math.min(1, (score - scoreRange.min) / (scoreRange.max - scoreRange.min)));
    const backgroundColor = extractedColors.gradientScale(normalizedScore).hex();
    const textColor = extractedColors.gradientScale(normalizedScore).luminance() > 0.5 ? '#000000' : '#ffffff';

    return { backgroundColor, textColor };
  };

  const getCSSVariables = () => {
    return {
      '--theme-primary': theme.colors.primary,
      '--theme-secondary': theme.colors.secondary,
      '--theme-accent': theme.colors.accent,
      '--theme-accent-dark': theme.colors.accentDark || theme.colors.accent,
      '--theme-accent-light': theme.colors.accentLight || theme.colors.accent,
      '--theme-text': theme.colors.text,
      '--theme-text-secondary': theme.colors.textSecondary,
      '--theme-border': theme.colors.border,
      '--theme-gradient': theme.colors.gradient || `linear-gradient(135deg, ${theme.colors.accent}, ${theme.colors.primary})`,
      '--theme-radial-gradient': theme.colors.radialGradient || `radial-gradient(circle at center, ${theme.colors.accent}, ${theme.colors.primary})`
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
      <div style={getCSSVariables()}>
        {children}
      </div>
    </DynamicThemeContext.Provider>
  );
};

export default DynamicThemeProvider;
