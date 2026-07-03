import { dark_mode } from '../utils/themeUtils';

const palette = () => ({
  bg: dark_mode.value ? '#18181b' : '#ffffff',
  border: dark_mode.value ? '#3f3f46' : '#e4e4e7',
  text: dark_mode.value ? '#fafafa' : '#09090b',
  muted: dark_mode.value ? '#a1a1aa' : '#71717a',
  chip: dark_mode.value ? '#27272a' : '#f4f4f5',
});

export const createSelectStyles = ({ isMulti = false } = {}) => {
  const colors = palette();

  return {
    control: (base, state) => ({
      ...base,
      minHeight: '2.5rem',
      borderRadius: '0.5rem',
      border: `1px solid ${state.isFocused ? '#7c3aed' : colors.border}`,
      backgroundColor: colors.bg,
      boxShadow: state.isFocused ? '0 0 0 3px rgb(124 58 237 / 0.15)' : 'none',
      padding: '0 0.25rem',
      cursor: 'pointer',
      '&:hover': {
        borderColor: state.isFocused ? '#7c3aed' : colors.border,
      },
    }),
    valueContainer: (base) => ({
      ...base,
      padding: '0 0.5rem',
    }),
    placeholder: (base) => ({
      ...base,
      color: colors.muted,
      fontSize: '0.875rem',
    }),
    singleValue: (base) => ({
      ...base,
      color: colors.text,
      fontSize: '0.875rem',
    }),
    input: (base) => ({
      ...base,
      color: colors.text,
      fontSize: '0.875rem',
    }),
    menu: (base) => ({
      ...base,
      backgroundColor: colors.bg,
      border: `1px solid ${colors.border}`,
      borderRadius: '0.75rem',
      overflow: 'hidden',
      boxShadow: '0 8px 24px rgb(0 0 0 / 0.12)',
      zIndex: 80,
    }),
    menuList: (base) => ({
      ...base,
      maxHeight: '40vh',
      padding: '0.25rem',
    }),
    option: (base, state) => ({
      ...base,
      fontSize: '0.875rem',
      borderRadius: '0.5rem',
      backgroundColor: state.isSelected
        ? dark_mode.value ? '#3f3f46' : '#ede9fe'
        : state.isFocused
          ? dark_mode.value ? '#27272a' : '#f4f4f5'
          : 'transparent',
      color: colors.text,
      cursor: 'pointer',
    }),
    multiValue: (base) => ({
      ...base,
      backgroundColor: colors.chip,
      borderRadius: '9999px',
    }),
    multiValueLabel: (base) => ({
      ...base,
      color: colors.text,
      fontSize: '0.8125rem',
      padding: '0 0.25rem',
    }),
    multiValueRemove: (base) => ({
      ...base,
      color: colors.muted,
      borderRadius: '9999px',
      ':hover': {
        backgroundColor: dark_mode.value ? '#3f3f46' : '#e4e4e7',
        color: colors.text,
      },
    }),
    indicatorSeparator: () => ({ display: 'none' }),
    dropdownIndicator: (base) => ({
      ...base,
      color: colors.muted,
      padding: '0 0.5rem',
      ':hover': { color: colors.text },
    }),
    clearIndicator: (base) => ({
      ...base,
      color: colors.muted,
      padding: '0 0.25rem',
      ':hover': { color: colors.text },
    }),
  };
};
