// Convert vote count to wavelength (400nm to 700nm)
export const getWavelength = (voteCount) => {
  // Start tinting after 24 votes
  const logScale = Math.log(Math.max(voteCount - 24, 1)) / Math.log(300);
  const wavelength = 400 + (logScale * 300);
  return Math.min(700, Math.max(400, wavelength));
};

// Convert wavelength to RGB color
export const wavelengthToColor = (wavelength) => {
  let r, g, b;
  
  if (wavelength >= 380 && wavelength < 440) {
    r = -(wavelength - 440) / (440 - 380);
    g = 0;
    b = 1;
  } else if (wavelength >= 440 && wavelength < 490) {
    r = 0;
    g = (wavelength - 440) / (490 - 440);
    b = 1;
  } else if (wavelength >= 490 && wavelength < 510) {
    r = 0;
    g = 1;
    b = -(wavelength - 510) / (510 - 490);
  } else if (wavelength >= 510 && wavelength < 580) {
    r = (wavelength - 510) / (580 - 510);
    g = 1;
    b = 0;
  } else if (wavelength >= 580 && wavelength < 645) {
    r = 1;
    g = -(wavelength - 645) / (645 - 580);
    b = 0;
  } else if (wavelength >= 645 && wavelength <= 700) {
    r = 1;
    g = 0;
    b = 0;
  } else {
    r = 0;
    g = 0;
    b = 0;
  }

  // Convert to RGB values
  r = Math.floor(r * 255);
  g = Math.floor(g * 255);
  b = Math.floor(b * 255);

  return `rgb(${r}, ${g}, ${b})`;
};

// Get rainbow color based on time
export const getRainbowColor = (time) => {
  // Cycle through wavelengths over time
  const wavelength = 400 + ((time % 6000) / 6000) * 300;
  return wavelengthToColor(wavelength);
}; 