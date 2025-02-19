import { FloatingActionButton } from './FloatingActionButton';
import { editing_item } from '../ItemPanel';
import { drawer_open } from '../App';

export const MobileNewItemChooser = () => {
  const buttons = [
    {
      label: '+',
      color: 'bg-gray-200 dark:bg-gray-800',
      hoverColor: 'hover:bg-gray-300 dark:hover:bg-gray-700',
      textColor: 'text-gray-800 dark:text-gray-200',
      onClick: () => {
        if (editing_item.value) {
          editing_item.value = null;
          drawer_open.value = false;
        } else {
          editing_item.value = {};
          drawer_open.value = true;
        }
      },
      animate: { rotate: editing_item.value ? 45 : 0 },
      transition: { duration: 0.2 }
    }
  ];

  return <FloatingActionButton buttons={buttons} />;
}; 