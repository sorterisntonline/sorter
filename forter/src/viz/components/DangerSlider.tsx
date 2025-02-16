import React, { useState } from 'react';
import styled from 'styled-components';

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

interface WarningModalProps {
    isOpen: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

const WarningModal: React.FC<WarningModalProps> = ({ isOpen, onConfirm, onCancel }) => {
    const [isChecked, setIsChecked] = useState(false);

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1001
        }}>
            <div style={{
                backgroundColor: '#2b2b2b',
                padding: '20px',
                borderRadius: '8px',
                maxWidth: '500px',
                textAlign: 'center',
                color: '#ffffff',
                border: '2px solid #dc3545'
            }}>
                <h2 style={{ 
                    color: '#dc3545',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    margin: '0 0 20px 0'
                }}>
                    ⚠️ Warning: Dangerous Operation
                </h2>
                <div style={{ margin: '20px 0', textAlign: 'left', lineHeight: '1.5' }}>
                    <p>Setting this value too high will likely crash your browser. This could result in:</p>
                    <ul style={{ 
                        marginTop: '10px',
                        paddingLeft: '20px',
                        listStyle: 'none'
                    }}>
                        <li style={{ margin: '8px 0' }}>• Loss of unsaved work on this site</li>
                        <li style={{ margin: '8px 0' }}>• Loss of work in other browser tabs</li>
                        <li style={{ margin: '8px 0' }}>• Browser freezing or crashing</li>
                    </ul>
                </div>
                <div style={{ marginTop: '20px' }}>
                    <label style={{ 
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '10px',
                        marginBottom: '20px',
                        cursor: 'pointer'
                    }}>
                        <input 
                            type="checkbox" 
                            checked={isChecked}
                            onChange={(e) => setIsChecked(e.target.checked)}
                            style={{ width: '16px', height: '16px' }}
                        />
                        <span>I understand and accept the risks</span>
                    </label>
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                        <button 
                            onClick={onConfirm}
                            disabled={!isChecked}
                            style={{
                                backgroundColor: isChecked ? '#dc3545' : '#6c757d',
                                color: 'white',
                                padding: '8px 16px',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: isChecked ? 'pointer' : 'not-allowed',
                                opacity: isChecked ? 1 : 0.5,
                                fontWeight: 'bold'
                            }}
                        >
                            Proceed Anyway
                        </button>
                        <button 
                            onClick={onCancel}
                            style={{
                                backgroundColor: '#6c757d',
                                color: 'white',
                                padding: '8px 16px',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontWeight: 'bold'
                            }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

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
    const [pendingValue, setPendingValue] = useState<number | null>(null);
    const [showWarning, setShowWarning] = useState(false);

    const handleSliderChange = (newValue: number) => {
        // Only show warning when moving INTO the danger zone
        const isEnteringDangerZone = newValue >= warningThreshold && value < warningThreshold;
        
        if (isEnteringDangerZone) {
            setPendingValue(newValue);
            setShowWarning(true);
        } else {
            onChange(newValue);
        }
    };

    const handleWarningConfirm = () => {
        if (pendingValue !== null) {
            onChange(pendingValue);
            setPendingValue(null);
        }
        setShowWarning(false);
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
                onCancel={() => {
                    setShowWarning(false);
                    setPendingValue(null);
                }}
            />
        </div>
    );
}; 