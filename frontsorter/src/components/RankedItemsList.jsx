import React from 'react';
import ItemCard from './ItemCard';

function RankedItemsList({ items, onShowComparison, comparisons }) {
  if (items.length === 0) {
    return <p className="text-gray-500 text-center py-10">No items added to this topic yet. Add some to see them ranked!</p>;
  }

  // Helper to find a comparison involving a specific item
  const findComparisonForItem = (itemId) => {
    return comparisons.find(c => c.itemAId === itemId || c.itemBId === itemId);
  };

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <ItemCard
          key={item.id}
          rank={index + 1}
          item={item}
          onShowComparisonDetails={() => {
            const comp = findComparisonForItem(item.id);
            if (comp) onShowComparison(comp);
          }}
          comparisonAvailable={!!findComparisonForItem(item.id)}
        />
      ))}
    </div>
  );
}

export default RankedItemsList; 