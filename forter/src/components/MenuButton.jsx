import React, { useState } from "react";
import { WarningPopup } from "./WarningPopup";

export const MenuButton = ({
  onClick,
  children,
  icon,
  variant = "default", // default, filled, outline, danger
  className = "",
  disabled = false,
  tooltip = "",
  confirmWarning = false,
  warningMessage = "Are you sure you want to proceed?",
  showLoginOnWarning = false
}) => {
  const [showWarning, setShowWarning] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipTimer, setTooltipTimer] = useState(null);

  // Base styles
  const baseStyles = "w-full text-left py-2 px-4 rounded-md transition-all duration-200 flex items-center";
  
  // Variant-specific styles
  const variantStyles = {
    default: "hover:bg-gray-100 dark:hover:bg-gray-700",
    filled: "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 hover:bg-blue-200 dark:hover:bg-blue-800",
    outline: "border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700",
    danger: "text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
  };
  
  // Disabled styles
  const disabledStyles = "opacity-50 cursor-not-allowed";
  
  // Combined styles
  const buttonStyles = `${baseStyles} ${variantStyles[variant] || variantStyles.default} ${disabled ? disabledStyles : ""} ${className}`;

  const handleMouseEnter = () => {
    if (disabled) return;
    if (tooltip) {
      // Show tooltip after a delay (500ms)
      const timer = setTimeout(() => {
        setShowTooltip(true);
      }, 500);
      setTooltipTimer(timer);
    }
  };

  const handleMouseLeave = () => {
    if (tooltipTimer) {
      clearTimeout(tooltipTimer);
      setTooltipTimer(null);
    }
    setShowTooltip(false);
  };

  const handleClick = (e) => {
    if (disabled) return;
    
    if (confirmWarning) {
      setShowWarning(true);
    } else {
      onClick && onClick(e);
    }
  };

  const handleConfirm = () => {
    setShowWarning(false);
    onClick && onClick();
  };

  return (
    <>
      <button
        className={buttonStyles}
        onClick={handleClick}
        disabled={disabled}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        title={tooltip}
      >
        {icon && <span className="mr-2">{icon}</span>}
        {children}
        
        {/* Tooltip (optional) */}
        {tooltip && showTooltip && (
          <div className="absolute left-full ml-2 bg-gray-800 text-white p-2 rounded text-sm whitespace-nowrap">
            {tooltip}
          </div>
        )}
      </button>
      
      {/* Warning Popup */}
      {confirmWarning && (
        <WarningPopup
          isOpen={showWarning}
          onClose={() => setShowWarning(false)}
          showLogin={showLoginOnWarning}
        >
          <div className="mb-4">
            <p className="font-medium">{warningMessage}</p>
          </div>
          <div className="flex gap-2">
            <button
              className="bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-200 py-1 px-3 rounded hover:bg-gray-400 dark:hover:bg-gray-500"
              onClick={() => setShowWarning(false)}
            >
              Cancel
            </button>
            <button
              className="bg-red-500 text-white py-1 px-3 rounded hover:bg-red-600"
              onClick={handleConfirm}
            >
              Confirm
            </button>
          </div>
        </WarningPopup>
      )}
    </>
  );
}; 