import { tag } from "./App";
import Select from "react-select";
import { current_session } from "./session";
import { signal } from "@preact/signals-react";
import { loadTag } from "./Network";
import { dark_mode } from "./Profile";

const allUsers = {
  value: "all",
  label: "@all",
};
const users = new URLSearchParams(window.location.search).get('users');
export const selected_users = signal(users ? users.split('.').map(user => {
  return { value: user, label: '@' + user };
}) : [allUsers]);

export const resetSelectedUsers = () => {
  if (current_session.value === null) return;
  console.log("resetting selected users")
  const uname = current_session.value.user_name;
  if (uname === undefined) return;

  const yourself = { value: uname, label: '@' + uname };
  selected_users.value = [yourself];
}


export const UserPanel = ({ users, selected_users }) => {


  if (users === undefined || users === null) return null;
  if (current_session.value === null) return null;

  const uname = current_session.value.user_name;
  const yourself = { value: uname, label: '@' + uname };

  console.log(users);
  const options = [
    allUsers,
    ...users
      .filter((user) => user.user_name !== uname)
      .map((user) => {
        return { value: user.user_name, label: (user.owner ? '@@' : '@') + user.user_name };
      }),
  ];


  if (yourself.value !== undefined) {
    options.unshift(yourself);
  }

  const onChange = (e) => {
    // if we are on all, we move out of all
    if (e.length === 0) {
      selected_users.value = [allUsers];
    } else if (
      selected_users.value.length === 1 &&
      selected_users.value[0].value === "all"
    ) {
      selected_users.value = e.filter((user) => user.value !== "all");
    } else if (
      // if we are not on all, we wipe to all
      e.some((user) => user.value === "all")
    ) {
      selected_users.value = [allUsers];
    } else {
      selected_users.value = e;
    }

    loadTag(undefined);
  };

  return (
    <div className="border-4 border-blue-400 "
      style={{ borderStyle: 'double' }}
    >
      <Select
        options={options}
        unstyled={true}
        onChange={onChange}
        placeholder="select user"
        value={selected_users.value}
        styles={{
          control: (base) => ({
            ...base,
            minHeight: 30,
            padding: 0,
            margin: 0,
            backgroundColor: dark_mode.value ? "#181a1b" : "white",
            border: 2,
            borderStyle: "none",
          }),
          menu: (base) => ({
            ...base,
            backgroundColor: dark_mode.value ? "#181a1b" : "white",
            border: 2,
            width: 'max-content',
            borderStyle: "solid",
            borderColor: "lavender",
          }),
          singleValue: (base) => ({
            ...base,
            padding: 0,
            margin: 0,
            backgroundColor: "red",
          }),
        }}
        isMulti={true}
      />
    </div>
  );
};
