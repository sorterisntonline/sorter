import { Item } from "./components/Item";
import { showAllSorted, showAllUnsorted, toggle } from "./App";
import { selected_item } from "./App";
import { useState } from "react";

const SortedList = ({ items, showAll, setShowAll, inVotePanel }) => {
  const displayCount = 25;
  const hasMore = items?.length > displayCount;
  const displayItems = !showAll && hasMore ? items?.slice(0, displayCount) : items;

  return (
    <div>
      <div>
        <div>
          <div colSpan="2">sorted items</div>
        </div>
      </div>
      <ol className="list-decimal">
        {displayItems?.map((item) => (
          <Item 
            key={item["id"]} 
            item={item} 
            onClick={() => {
              selected_item.value = item;
            }}
          />
        )) ?? [
          <div key="2">
            <div>no items </div>
          </div>,
        ]}
      </ol>
      {hasMore && (
        <button 
          onClick={() => setShowAll(!showAll)}
          className="w-full text-center text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        >
          {showAll ? '[show less]' : '[show more]'}
        </button>
      )}
    </div>
  );
};

const UnsortedList = ({ items, showAll, setShowAll, inVotePanel }) => {
  const displayCount = 25;
  const hasMore = items?.length > displayCount;
  const displayItems = !showAll && hasMore ? items?.slice(0, displayCount) : items;

  return (
    <div>
      <div>
        <div>
          <div colSpan="2">unsorted items</div>
        </div>
      </div>
      <ol className="list-disc ml-3">
        {displayItems?.map((item) => (
          <Item 
            key={item["id"]} 
            item={item} 
            onClick={() => {
              selected_item.value = item;
            }}
          />
        )) ?? [<tr key="2"></tr>]}
      </ol>
      {hasMore && (
        <button 
          onClick={() => setShowAll(!showAll)}
          className="w-full text-center text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        >
          {showAll ? '[show less]' : '[show more]'}
        </button>
      )}
    </div>
  );
};

export const ItemsLists = ({ sorteditems = [], unsorteditems = [], skippedItems = [] }) => {
  return (
    <div className={" p-3 " + (toggle.value ? "lg:w-2/3" : "lg:w-1/3")}>
      <div className="lg:flex lg:space-x-12">
        {sorteditems?.length > 0 && (
          <div className={unsorteditems?.length > 0 ? "lg:w-1/2" : "lg:w-full"}>
            <SortedList 
              items={sorteditems} 
              showAll={showAllSorted.value} 
              setShowAll={(val) => showAllSorted.value = val} 
            />
          </div>
        )}
        {unsorteditems?.length > 0 && (
          <div className={sorteditems?.length > 0 ? "lg:w-1/2" : "lg:w-full"}>
            <UnsortedList 
              items={unsorteditems} 
              showAll={showAllUnsorted.value} 
              setShowAll={(val) => showAllUnsorted.value = val} 
            />
          </div>
        )}
      </div>
      {skippedItems?.length > 0 && (
        <div>
          <div>
            <div>
              <div colSpan="2">skipped items</div>
            </div>
          </div>
          <ol className="list-disc ml-3">
            {skippedItems?.map((item) => (
              <Item 
                key={item["id"]} 
                item={item} 
                onClick={() => {
                  selected_item.value = item;
                }}
              />
            )) ?? [<tr key="2"></tr>]}
          </ol>
        </div>
      )}
    </div>
  );
}; 