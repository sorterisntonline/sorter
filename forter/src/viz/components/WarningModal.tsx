import { useState } from "react";

interface WarningModalProps {
    isOpen: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

export const WarningModal: React.FC<WarningModalProps> = ({ isOpen, onConfirm, onCancel }) => {
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
