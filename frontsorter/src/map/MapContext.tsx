import React, { createContext, useContext, useMemo, useState } from 'react';

export interface EntitySummary {
  ns: string;
  pk: string;
  title: string | null;
  profile_picture_url?: string | null;
  metadata?: any;
}

interface MapContextValue {
  selectedEntity: EntitySummary | null;
  setSelectedEntity: (entity: EntitySummary | null) => void;
  rankFilter: string;
  setRankFilter: (value: string) => void;
}

const MapContext = createContext<MapContextValue | undefined>(undefined);

export const useMapContext = () => {
  const ctx = useContext(MapContext);
  if (!ctx) {
    throw new Error('useMapContext must be used inside MapProvider');
  }
  return ctx;
};

export const MapProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedEntity, setSelectedEntity] = useState<EntitySummary | null>(null);
  const [rankFilter, setRankFilter] = useState('');

  const value = useMemo(
    () => ({ selectedEntity, setSelectedEntity, rankFilter, setRankFilter }),
    [selectedEntity, rankFilter],
  );

  return <MapContext.Provider value={value}>{children}</MapContext.Provider>;
};
