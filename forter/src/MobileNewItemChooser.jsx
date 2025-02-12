import { useState } from 'react';
import { FloatingActionButton } from './components/FloatingActionButton';
import { ItemPanel } from './ItemPanel';

export const MobileNewItemChooser = () => {
  const [showItemForm, setShowItemForm] = useState(false);

  const buttons = [
    {
      label: 'Add Item',
      color: 'bg-purple-500 hover:bg-purple-600',
      textColor: 'text-purple-500',
      onClick: () => setShowItemForm(true),
    }
  ];

  return (
    <FloatingActionButton
      buttons={buttons}
      modalContent={<ItemPanel />}
      showModal={showItemForm}
      setShowModal={setShowItemForm}
    />
  );
}; 