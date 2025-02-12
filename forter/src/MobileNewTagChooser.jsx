import { useState } from 'react';
import { useLocation } from 'wouter';
import { current_session } from './session';
import { loginLinear } from './integrations/Linear';
import { NEW_TAG_ROUTES, NEW_TAG_BUTTONS } from './constants/navigation';
import { TagForm } from './TagForm';
import { FloatingActionButton } from './components/FloatingActionButton';

export const MobileNewTagChooser = () => {
  const [showTagForm, setShowTagForm] = useState(false);
  const [location] = useLocation();
  const [isSpotifyOpen, setIsSpotifyOpen] = useState(false);

  // Add debug logging
  console.log('MobileNewTagChooser:', {
    location,
    shouldShow: NEW_TAG_ROUTES.includes(location),
    isLoggedIn: !!current_session.value?.user_name
  });

  // Check if we should show the button
  const shouldShow = NEW_TAG_ROUTES.includes(location) && current_session.value?.user_name;
  
  if (!shouldShow) return null;

  const buttons = NEW_TAG_BUTTONS.map(button => ({
    ...button,
    onClick: () => {
      switch(button.action) {
        case 'linear':
          loginLinear();
          break;
        case 'spotify':
          setIsSpotifyOpen(true);
          break;
        case 'normal':
          setShowTagForm(true);
          break;
      }
    }
  }));

  return (
    <FloatingActionButton
      buttons={buttons}
      modalContent={<TagForm onClose={() => setShowTagForm(false)} />}
      showModal={showTagForm}
      setShowModal={setShowTagForm}
    />
  );
}; 