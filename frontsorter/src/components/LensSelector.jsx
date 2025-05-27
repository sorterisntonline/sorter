import React from 'react';
import Select from 'react-select';

const LensSelector = ({ 
  value, 
  onChange, 
  options = [],
  placeholder = "Select evaluation prompt...",
  styles,
  className = "lens-selector"
}) => {
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
    singleValue: (base) => ({
      ...base,
      color: '#333',
      fontFamily: 'Georgia'
    }),
    placeholder: (base) => ({
      ...base,
      color: '#999'
    })
  };

  return (
    <Select
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      styles={styles || defaultStyles}
      className={className}
      classNamePrefix="select"
      isClearable
    />
  );
};

export default LensSelector; 