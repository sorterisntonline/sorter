import React from 'react';
import '../styles/three-panel-layout.css';

interface ThreePanelLayoutProps {
  leftPanel: React.ReactNode;
  centerPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

const ThreePanelLayout: React.FC<ThreePanelLayoutProps> = ({
  leftPanel,
  centerPanel,
  rightPanel,
  className = '',
  style = {}
}) => {
  return (
    <div className={`three-panel-layout ${className}`} style={style}>
      <div className="three-panel-left">
        {leftPanel}
      </div>
      <div className="three-panel-center">
        {centerPanel}
      </div>
      <div className="three-panel-right">
        {rightPanel}
      </div>
    </div>
  );
};

export default ThreePanelLayout;
