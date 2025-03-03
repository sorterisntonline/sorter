import { useEffect, useState } from "react";
import { tag } from "./App";
import { current_session } from "./session";
import Select from "react-select";
import { useLocation } from "wouter";
import { loadTag } from "./Network";
import { dark_mode } from "./utils/themeUtils";

const UserPanel = ({ onChange, value, users }) => {
  const [selected, setSelected] = useState(
    value.split(".").map((user) => {
      return { value: user, label: "@" + user };
    })
  );

  const options = users
    .filter((user) => user !== current_session.value.user_name) // dont show current user
    .map((user) => {
      return { value: user.user_name, label: (user.owner ? "@@" : "@") + user.user_name };
    });

  return (
    <div className="border-4 border-blue-400 ">
      <Select
        options={options}
        unstyled={true}
        onChange={(e) => {
          setSelected(e);
          onChange(e);
        }}
        placeholder="select user"
        value={selected}
        styles={{
          control: (base) => ({
            ...base,
            height: 30,
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

export const TagPreferences = ({ onSubmit }) => {
  const [_, setLocation] = useLocation();
  const [perms, setPerms] = useState([]);
  const [newPerm, setNewPerm] = useState({});
  const [namespace, setNamespace] = useState(tag.value.tag.ns);
  const [unlisted, setUnlisted] = useState(tag.value.tag.unlisted);
  const [nsfw, setNsfw] = useState(tag.value.tag.nsfw);
  const [hideAuthor, setHideAuthor] = useState(tag.value.tag.hide_item_authors);
  const [description, setDescription] = useState(tag.value.tag.description || "");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Track initial values for comparison
  const initialValues = {
    namespace: tag.value.tag.ns,
    unlisted: tag.value.tag.unlisted,
    nsfw: tag.value.tag.nsfw,
    hideAuthor: tag.value.tag.hide_item_authors,
    description: tag.value.tag.description || "",
  };

  // Check for changes whenever any value changes
  useEffect(() => {
    const hasChanges = 
      namespace !== initialValues.namespace ||
      unlisted !== initialValues.unlisted ||
      nsfw !== initialValues.nsfw ||
      hideAuthor !== initialValues.hideAuthor ||
      description !== initialValues.description ||
      JSON.stringify(newPerm) !== JSON.stringify(
        Object.fromEntries(
          perms.map((perm) => [perm["capability"], perm["user_id"]])
        )
      );
    
    setHasUnsavedChanges(hasChanges);
  }, [namespace, unlisted, nsfw, hideAuthor, description, newPerm]);

  useEffect(() => {
    const fetchData = async () => {
      const response = await fetch(
        "/api/tag/permissions?tag_id=" + tag.value.tag["id"]
      );
      if (!response.ok) {
        throw new Error("Failed to fetch permissions");
      } else {
        const data = await response.json();
        setPerms(data);
        setNewPerm(
          Object.fromEntries(
            data.map((perm) => [
              perm["capability"],
              perm["user_id"],
            ])
          )
        );
      }
    };
    fetchData();
  }, []);

  const [users, setUsers] = useState([]);
  useEffect(() => { //ewwwwww
    fetch("/api/users?user_name=" + current_session.value.user_name)
      .then((r) => r.json())
      .then((r) => setUsers([r]));
  }, []);

  const canEditPerms =
    tag.value.tag["owner"] === current_session.value.user_name;

  const [error, setError] = useState(false);

  const detectError = (newPerms) => {
    // check if all perms are set
    const values = Object.values(newPerms);
    // none are equal to empty string
    const empty = values.filter((perm) => perm === "").length > 0;
    if (empty) {
      setError("Please fill all fields");
      return;
    }

    // check if all perms are valid
    // cant have both all and none
    const valid =
      values.filter((perm) => {
        const split = perm.split(".");
        return split.includes("all") && split.includes("none");
      }).length > 0;

    if (valid) {
      setError("cant have both all and none");
      return;
    }

    // all and none must be individual
    const all =
      values.filter((perm) => {
        const split = perm.split(".");
        if (split.includes("all") || split.includes("none")) {
          return split.length > 1;
        }
      }).length > 0;

    if (all) {
      setError("all and nobody stand alone");
      return;
    }

    setError(false);
  };


  const onChange = (capability, e) => {
    const userString = e.map(({ value, label }) => value).join(".");
    const newPerms = { ...newPerm, [capability]: userString };
    setNewPerm(newPerms);
    detectError(newPerms);
  };

  const onSubmitForm = async () => {
    if (error) return;

    const perm_data = {
      tag_id: tag.value.tag["id"],
      perms: newPerm,
    };

    const tag_data = {
      tag_id: tag.value.tag.id,
      ns: namespace,
      nsfw: nsfw,
      unlisted: unlisted,
      hide_item_authors: hideAuthor,
      description: description,
    }

    const r_perms = await fetch("/api/tag/permissions", {
      credentials: "include",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(perm_data),
    });
    await r_perms.json();

    const r_tag = await fetch("/api/tag", {
      credentials: "include",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(tag_data),
    })

    await r_tag.json();
    loadTag();
    onSubmit();
  };

  const deleteTag = async () => {
    if (confirm("are you sure?") === false) return;

    const r = await fetch("/api/tag?id=" + tag.value.tag["id"], {
      method: "DELETE",
      credentials: "include",
    });

    const resp = await r.json();
    setLocation("/");
  };

  const permsTable = (
    <table className="text-base border-2">
      <tbody>
        <tr className="text-sm border-b">
          <td>note:</td>
          <td>owners of tags will always be able to do all actions</td>
        </tr>
        <tr className="text-sm border-b">
          <td>capability</td>
          <td>user</td>
        </tr>
        {perms.map((perm) => (
          <tr>
            <td>{perm["capability"]}</td>
            <td>
              <UserPanel
                users={users}
                value={perm["user_id"]}
                onChange={(e) => onChange(perm["capability"], e)}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="text-sm flex flex-col border-2 border-purple-400">
      {hasUnsavedChanges && (
        <div className="bg-yellow-100 dark:bg-yellow-900 p-2 text-center">
          You have unsaved changes
        </div>
      )}
      <table>
        <tbody>
          <tr>
            <td>title</td>
            <td className="text-xl">{tag.value.tag["title"]}</td>
          </tr>
          <tr>
            <td>slug</td>
            <td className="text-xl">#{tag.value.tag["slug"]}</td>
          </tr>
          <tr>
            <td>owner</td>
            <td className="text-xl text-blue-500">
              @{tag.value.tag["owner"]}
            </td>
          </tr>
          <tr>
            <td>description</td>
            <td>
              {canEditPerms ? (
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="dark:text-black"
                />
              ) : (
                <span className="text-xl">{tag.value.tag["description"]}</span>
              )}
            </td>
          </tr>
          <tr>
            <td className="">namespace</td>
            <td className="dark:text-black">
              <input value={namespace} onChange={(e) => setNamespace(e.target.value)}></input>
            </td>
          </tr>
          <tr>
            <td className="">unlisted</td>
            <td className="">
              <input type="checkbox" checked={unlisted} onChange={(e) => setUnlisted(e.target.checked)}></input>
            </td>
          </tr>
          <tr>
            <td className="">nsfw</td>
            <td className="">
              <input type="checkbox" checked={nsfw} onChange={(e) => setNsfw(e.target.checked)}></input>
            </td>
          </tr>
          <tr>
            <td className="">hide authors (anonymous items)</td>
            <td className="">
              <input type="checkbox" checked={hideAuthor} onChange={(e) => setHideAuthor(e.target.checked)}></input>
            </td>
          </tr>
        </tbody>
      </table>
      <br />

      {canEditPerms ? permsTable : <></>}

      {canEditPerms ? (
        <button
          className={`border-2 ${hasUnsavedChanges ? "border-yellow-500" : ""} ${error ? "text-red-600" : ""}`}
          onClick={onSubmitForm}
        >
          {error ? error : (hasUnsavedChanges ? "save changes*" : "save changes")}
        </button>
      ) : (
        <></>
      )}

      <br />

      {tag.value.tag["owner"] === current_session.value.user_name && (
        <button className="border-2 border-red-500" onClick={deleteTag}>
          delete
        </button>
      )}
    </div>
  );
};
