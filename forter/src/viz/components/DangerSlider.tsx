import React, { useState } from 'react';
import styled from 'styled-components';
import { WarningModal } from './WarningModal';

interface Zone {
    max: number;
    color: string;
}

interface DangerSliderProps {
    value: number;
    onChange: (value: number) => void;
    min: number;
    max: number;
    defaultValue: number;
    zones: Zone[];
    label: string;
    warningThreshold: number;
}

const StyledInput = styled.input`
    width: 100%;
    height: 100%;
    appearance: none;
    background: transparent;
    outline: none;

    &::-webkit-slider-thumb {
        appearance: none !important;
        width: 24px !important;
        height: 24px !important;
        background: #fff !important;
        cursor: pointer !important;
        margin-top: -12px !important;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2) !important;
        clip-path: polygon(50% 75%, 100% 25%, 0 25%) !important;
    }
    &::-moz-range-thumb {
        width: 24px !important;
        height: 24px !important;
        background: #fff !important;
        cursor: pointer !important;
        border: none !important;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2) !important;
        clip-path: polygon(50% 75%, 100% 25%, 0 25%) !important;
    }
    &:focus {
        outline: none;
    }
    &::-moz-focus-outer {
        border: 0;
    }
`;

export const DangerSlider: React.FC<DangerSliderProps> = ({
    value,
    onChange,
    min,
    max,
    defaultValue,
    zones,
    label,
    warningThreshold
}) => {
    const [showWarning, setShowWarning] = useState(false);

    const handleSliderChange = (newValue: number) => {
        // Remove warning check here - just update the value
        onChange(newValue);
    };

    // Add these to parent component (AllSortViz)
    const handleWarningConfirm = () => {
        setShowWarning(false);
        // Will be handled by parent
    };

    const handleWarningCancel = () => {
        setShowWarning(false);
        // Will be handled by parent
    };

    const getBackgroundGradient = () => {
        return `linear-gradient(to right, ${zones.map((zone, index) => {
            const prevMax = index === 0 ? min : zones[index - 1].max;
            const percentage = ((zone.max - min) / (max - min)) * 100;
            return `${zone.color} ${(prevMax - min) / (max - min) * 100}% ${percentage}%`;
        }).join(', ')})`;
    };

    return (
        <div style={{ margin: '10px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <label>{label}</label>
                <span>{value}</span>
            </div>
            <div style={{ 
                position: 'relative',
                height: '20px',
                background: getBackgroundGradient(),
                borderRadius: '4px',
                padding: '2px'
            }}>
                <StyledInput
                    type="range"
                    min={min}
                    max={max}
                    value={value}
                    onChange={(e) => handleSliderChange(Number(e.target.value))}
                    style={{
                        width: '100%',
                        height: '100%',
                        appearance: 'none',
                        background: 'transparent',
                        outline: 'none',
                    } as React.CSSProperties & {
                        '--thumb-color': string;
                        '--thumb-size': string;
                        '--thumb-height': string;
                    }}
                />
            </div>
            <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                fontSize: '0.8em',
                color: '#999',
                marginTop: '4px'
            }}>
                <span>Min: {min}</span>
                <span>Default: {defaultValue}</span>
                <span>Max: {max}</span>
            </div>
            <WarningModal
                isOpen={showWarning}
                onConfirm={handleWarningConfirm}
                onCancel={handleWarningCancel}
            />
        </div>
    );
}; 