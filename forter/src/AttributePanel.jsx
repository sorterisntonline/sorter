import { tag, current_attribute } from './App';
import Select from 'react-select';
import { computed } from '@preact/signals-react';
import { loadTag } from './Network';
import { createSelectStyles } from './styles/selectStyles';

export const selected_attribute = computed(() => {
  if (!current_attribute.value) return null;
  return { value: current_attribute.value, label: `:${current_attribute.value.title}` };
});

export const AttributePanel = ({ compact = false }) => {
  if (!tag.value?.attributes) return null;

  const options = tag.value.attributes.map((attr) => ({
    value: attr,
    label: `:${attr.title} (${attr.votes})`,
  }));

  return (
    <div className={compact ? 'w-full' : 'w-full lg:max-w-xs'}>
      {!compact && <div className="field-label mb-1">attribute</div>}
      <Select
        options={options}
        value={selected_attribute.value}
        styles={createSelectStyles()}
        onChange={(e) => {
          if (e.__isNew__) {
            const title = e.label.startsWith(':') ? e.label.substring(1) : e.label;
            current_attribute.value = { id: -1, title };
          } else {
            current_attribute.value = e.value;
          }
          loadTag(undefined);
        }}
        isMulti={false}
      />
    </div>
  );
};
