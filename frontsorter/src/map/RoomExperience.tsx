import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CSSTransition, SwitchTransition } from 'react-transition-group';
import { MapProvider } from './MapContext';
import { useRoomMap } from './useRoomMap';
import { panelRegistry } from './panelRegistry';
import { PanelDefinition } from './types';
import '../styles/map-room.css';

const directionClassMap: Record<string, string> = {
  N: 'slide-from-bottom',
  S: 'slide-from-top',
  E: 'slide-from-left',
  W: 'slide-from-right',
};

const renderPanels = (panels: PanelDefinition[]) => {
  return panels.map((panel) => {
    const Component = panelRegistry[panel.kind];
    return (
      <div key={panel.id} className={`room-column room-column--${panel.width ?? 'full'}`}>
        <Component />
      </div>
    );
  });
};

const RoomView: React.FC = () => {
  const { currentRoom, move, teleport, lastDirection, progress, progressLoading } = useRoomMap();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [announce, setAnnounce] = useState('');

  const directionClass = lastDirection ? directionClassMap[lastDirection] : 'slide-in-place';

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.focus();
    }
    if (currentRoom) {
      setAnnounce(`Moved to ${currentRoom.name}.`);
    }
  }, [currentRoom]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const dirMap: Record<string, any> = { w: 'N', arrowup: 'N', d: 'E', arrowright: 'E', s: 'S', arrowdown: 'S', a: 'W', arrowleft: 'W' };
      const dir = dirMap[key];
      if (!dir) return;
      event.preventDefault();
      if (event.shiftKey) {
        const result = teleport(dir);
        if (!result.success) {
          setAnnounce(result.reason || 'Cannot teleport in that direction.');
        }
      } else {
        const result = move(dir);
        if (!result.success) {
          setAnnounce(result.reason || 'Door is locked.');
        }
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [move, teleport]);

  const directionButtons = useMemo(() => {
    if (!currentRoom) return [];
    return currentRoom.doors.map((door) => ({
      id: `${currentRoom.coord}-${door.dir}`,
      dir: door.dir,
      label: door.label,
      locked: Boolean(door.lock && progress.votesToday < door.lock.threshold),
      requirement: door.lock?.description,
    }));
  }, [currentRoom, progress]);

  if (!currentRoom) {
    return <div className="room-shell">Loading room…</div>;
  }

  return (
    <div className="room-shell">
      <div className="room-shell__hud">
        <div className="room-shell__title">
          <span className="room-shell__coord">{currentRoom.coord}</span>
          <h2>{currentRoom.name}</h2>
        </div>
        <div className="room-shell__status">
          {progressLoading ? 'Checking progress…' : `${progress.votesToday} votes today`}
        </div>
      </div>
      <div className="room-shell__doors">
        {directionButtons.map((door) => (
          <button
            key={door.id}
            className={`door-button door-button--${door.dir} ${door.locked ? 'door-button--locked' : ''}`}
            onClick={() => {
              const result = move(door.dir as any);
              if (!result.success) {
                setAnnounce(result.reason || 'Door locked');
              }
            }}
            onMouseEnter={() => door.requirement && setAnnounce(door.requirement)}
          >
            <span className="door-button__dir">{door.dir}</span>
            <span className="door-button__label">{door.label}</span>
            {door.locked && <span className="door-button__lock">Locked</span>}
          </button>
        ))}
      </div>
      <div className="room-shell__content" ref={containerRef} tabIndex={-1}>
        <SwitchTransition mode="out-in">
          <CSSTransition key={currentRoom.coord} addEndListener={(node, done) => node.addEventListener('transitionend', done, false)} classNames={directionClass}>
            <div className="room-panels">
              {renderPanels(currentRoom.panels)}
            </div>
          </CSSTransition>
        </SwitchTransition>
      </div>
      <div className="sr-only" aria-live="polite">{announce}</div>
    </div>
  );
};

export const RoomExperience: React.FC = () => {
  return (
    <MapProvider>
      <RoomView />
    </MapProvider>
  );
};
