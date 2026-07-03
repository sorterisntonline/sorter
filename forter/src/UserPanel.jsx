import { tag } from './App';
import Select from 'react-select';
import { current_session } from './session';
import { signal } from '@preact/signals-react';
import { loadTag } from './Network';
import { useEffect } from 'react';
import { createSelectStyles } from './styles/selectStyles';

const allUsers = { value: 'all', label: '@all' };
const users = new URLSearchParams(window.location.search).get('users');

export const selected_users = signal(
  users && typeof users === 'string'
    ? users.split('.').map((user) => ({ value: user, label: `@${user}` }))
    : [allUsers]
);

export const resetSelectedUsers = () => {
  if (!current_session.value) return;
  const uname = current_session.value.user_name;
  if (!uname) return;
  selected_users.value = [{ value: uname, label: `@${uname}` }];
};

export const UserPanel = ({ users, selected_users: initialSelectedUsers, compact = false }) => {
  useEffect(() => {
    if (initialSelectedUsers) {
      selected_users.value = initialSelectedUsers;
    }
  }, [initialSelectedUsers]);

  if (!users || !current_session.value) return null;

  const uname = current_session.value.user_name;
  const yourself = { value: uname, label: `@${uname}` };

  const options = [
    allUsers,
    ...users
      .filter((user) => user.user_name !== uname)
      .map((user) => ({
        value: user.user_name,
        label: `${user.owner ? '@@' : '@'}${user.user_name}`,
      })),
  ];

  if (yourself.value !== undefined) {
    options.unshift(yourself);
  }

  const onChange = (e) => {
    if (!e || e.length === 0) {
      selected_users.value = [allUsers];
    } else if (selected_users.value.length === 1 && selected_users.value[0].value === 'all') {
      selected_users.value = e.filter((user) => user.value !== 'all');
    } else if (e.some((user) => user.value === 'all')) {
      selected_users.value = [allUsers];
    } else {
      selected_users.value = e;
    }
    loadTag(undefined);
  };

  return (
    <div className={compact ? 'w-full' : 'w-full lg:max-w-sm'}>
      {!compact && <div className="field-label mb-1">voters</div>}
      <Select
        options={options}
        onChange={onChange}
        placeholder="select voters"
        value={selected_users.value}
        styles={createSelectStyles({ isMulti: true })}
        isMulti
      />
    </div>
  );
};
