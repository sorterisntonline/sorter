import React from 'react';
import AsyncSelect from 'react-select/async';

const OpenRouterModelSelector = ({ 
  value, 
  onChange, 
  isMulti = true, 
  placeholder = "Type to search AI models...",
  styles,
  className = "model-selector"
}) => {
  // Models loader for AsyncSelect
  const loadModelOptions = async (inputValue) => {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models');
      const data = await response.json();
      
      if (data.data && Array.isArray(data.data)) {
        const allModels = data.data
          .filter(model => model.id && (!inputValue || model.id.toLowerCase().includes(inputValue.toLowerCase())))
          .sort((a, b) => {
            return b.created - a.created;
          });
        
        return allModels.slice(0, 50).map(model => ({
          value: model.id,
          label: `@${model.id}`,
          data: model
        }));
      }
      
      return [];
    } catch (error) {
      console.error('Failed to fetch models:', error);
      return [];
    }
  };

  const defaultStyles = {
    control: (base) => ({
      ...base,
      fontFamily: 'Georgia',
      fontSize: '1em',
      backgroundColor: '#fff',
      borderColor: '#ccc',
      minHeight: '2.5em',
      '&:hover': {
        borderColor: '#68693F'
      }
    }),
    menu: (base) => ({
      ...base,
      fontFamily: 'Georgia',
      backgroundColor: '#fff',
      border: '1px solid #ccc',
      marginTop: '0.25em'
    }),
    option: (base, state) => ({
      ...base,
      fontFamily: 'Georgia',
      backgroundColor: state.isSelected ? '#D2D6BC' : state.isFocused ? '#f5f5f5' : '#fff',
      color: state.isSelected ? '#68693F' : '#333',
      cursor: 'pointer',
      '&:active': {
        backgroundColor: '#D2D6BC'
      }
    }),
    multiValue: (base) => ({
      ...base,
      backgroundColor: '#D2D6BC',
      borderRadius: '0.25em'
    }),
    multiValueLabel: (base) => ({
      ...base,
      color: '#68693F',
      fontFamily: 'monospace',
      fontSize: '0.9em'
    }),
    multiValueRemove: (base) => ({
      ...base,
      color: '#68693F',
      cursor: 'pointer',
      '&:hover': {
        backgroundColor: '#68693F',
        color: '#fff'
      }
    }),
    placeholder: (base) => ({
      ...base,
      color: '#999'
    })
  };

  return (
    <AsyncSelect
      isMulti={isMulti}
      cacheOptions
      defaultOptions
      loadOptions={loadModelOptions}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      styles={styles || defaultStyles}
      className={className}
      classNamePrefix="select"
      formatOptionLabel={(option) => (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: 'monospace', fontSize: '0.9em' }}>
            {option.label}
            {option.hasVotes && <span style={{ marginLeft: '0.5em', color: '#68693F' }}>✓</span>}
          </span>
          {option.data?.pricing?.prompt && (
            <span style={{ fontSize: '0.8em', color: '#666', marginLeft: '1em' }}>
              ${(parseFloat(option.data.pricing.prompt) * 1000000).toFixed(2)}/M
            </span>
          )}
        </div>
      )}
    />
  );
};

export default OpenRouterModelSelector; 