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
      {/* Rest of the Tag component implementation */}
    </>
  );
}; 