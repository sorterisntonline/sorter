import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { tag } from "../App";
import { editing_item } from "../ItemPanel";
import { Voting } from "../Voting";
import { MetaTags } from "../MetaTags";
import { IntegrationsPanel } from "../integrations/IntegrationsPanel";
import { ItemsLists } from "../ItemsLists";
import { ItemPanel } from "../ItemPanel";
import { toggle } from "../App";
import { useElo } from "../App";
import { showPin } from "../App";
import { MobileNewItemChooser } from "./MobileNewItemChooser";
import { WarningPopup } from "./WarningPopup";
import { errorState, clearError } from "../ErrorHandler";
import { TextSummary } from "./TextSummary";
import { selected_item } from "../App";

export const Tag = ({ isVoting, handleError }) => {
  const [location, setLocation] = useLocation();
  const isMobileDevice = () => window.innerWidth < 1024;

  const { can_vote = false, can_view = false, can_add = false } = tag.value?.perms || {};

  if (!tag.value || !can_view) {
    return <div>you do not have permission to view this tag</div>;
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('newItem') === 'true') {
      editing_item.value = {};
      params.delete('newItem');
      window.history.replaceState({}, "", window.location.pathname + "?" + params.toString());
    }
  }, [location]);

  if (isVoting) {
    return <Voting handleError={handleError} />;
  }

  return (
    <>
      <MetaTags 
        title={`sorter - #${tag.value.tag.slug}`}
        image="/logoanim.gif"
      />
      <div className="dark:text-white justify-start">
        <IntegrationsPanel />
        <TextSummary can_vote={can_vote} can_add={can_add} />
        
        {/* Mobile ItemPanel - positioned between TextSummary and ItemsLists */}
        {isMobileDevice() && editing_item.value && (
          <div className="p-4 bg-white dark:bg-black">
            <div className="relative">
              <ItemPanel />
              <button
                className="absolute top-0 right-0 text-2xl p-4"
                onClick={() => {
                  editing_item.value = null;
                  selected_item.value = false;
                }}
              >
                ×
              </button>
            </div>
          </div>
        )}

        <div className="flex lg:flex-row flex-col lg:space-x-24">
          <div className="flex-1">
            <ItemsLists 
              sorteditems={tag.value.sorted}
              unsorteditems={tag.value.unsorted}
              skippedItems={tag.value.skipped}
            />
            {/* Mobile selected item view */}
            {isMobileDevice() && selected_item.value && (
              <div className="fixed inset-0 bg-white dark:bg-black z-50 overflow-auto p-4">
                <ItemPanel />
                <button
                  className="fixed top-4 right-4 text-2xl p-4"
                  onClick={() => {
                    selected_item.value = false;
                  }}
                >
                  ×
                </button>
              </div>
            )}
          </div>
          
          {/* Desktop sidebar */}
          <div className="lg:ml-auto lg:w-1/4">
            <div className="flex flex-col">
              <div
                className="justify-self-start cursor-pointer border-1 border-gray-300 whitespace-nowrap"
                onClick={() => toggle.value = !toggle.value}
                role="button"
              >
                {toggle.value ? "[more space <-]" : "[less space ->]"}
              </div>
              <div
                className="justify-self-start cursor-pointer border-1 border-gray-300 whitespace-nowrap"
                onClick={() => {
                  useElo.value = !useElo.value;
                  loadTag(undefined);
                }}
                role="button"
              >
                {useElo.value ? "[use pagerank]" : "[use elo]"}
              </div>
              <div
                className="justify-self-start cursor-pointer border-1 border-gray-300 whitespace-nowrap"
                onClick={() => {
                  setLocation('/' + tag.value.tag.id + '/' + tag.value.tag.slug + '/graph');
                }}
                role="button"
              >
                [show graph]
              </div>
              <div
                className="justify-self-start cursor-pointer border-1 border-gray-300 whitespace-nowrap"
                onClick={() => {
                  showPin.value = !showPin.value;
                }}
                role="button"
              >
                {showPin.value ? "[hide pin]" : "[show pin]"}
              </div>
            </div>
            <div className="page-padding-top hidden lg:block">
              <div className="sticky top-0 z-10">
                {(editing_item.value || selected_item.value) && <ItemPanel />}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Show MobileNewItemChooser on mobile when not editing/viewing */}
      {isMobileDevice() && can_add && !isVoting && !selected_item.value && (
        <div className="fixed bottom-4 right-4 z-[99999]">
          <MobileNewItemChooser />
        </div>
      )}
    </>
  );
}; 