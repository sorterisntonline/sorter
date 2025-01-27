import { useEffect } from 'react';

export const MetaTags = ({ title, description, image }) => {
  useEffect(() => {
    // Update standard meta tags
    document.title = title;
    
    // Update OpenGraph meta tags
    const ogTitle = document.querySelector('meta[property="og:title"]');
    const ogDesc = document.querySelector('meta[property="og:description"]');
    
    if (ogTitle) ogTitle.setAttribute('content', title);
    if (ogDesc) ogDesc.setAttribute('content', description);
  }, [title, description, image]);

  return null;
};
