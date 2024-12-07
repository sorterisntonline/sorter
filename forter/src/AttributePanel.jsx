import { tag } from "./App";
import Creatable from "react-select/creatable"
import { signal, computed } from "@preact/signals-react";
import { loadTag } from "./Network";
import { dark_mode } from "./Profile";

export const selected_attribute = computed(() => {
    return { value: tag.value.selected_attribute, label: ":" + tag.value.selected_attribute.title };
});

export const AttributePanel = () => {
    const options = tag.value.attributes.map((attr) => {
        return { value: attr, label: ":" + attr.title + " (" + attr.votes + ")" }
    });

    return (
        <div className="border-4 border-green-400"
            style={{ borderStyle: 'double' }}>
            <Creatable
                options={options}
                unstyled={true}
                value={selected_attribute.value}
                onChange={(e) => {
                    if (e["__isNew__"]) {
                        if (e.label.startsWith(":")) {
                            tag.value.selected_attribute = { id: -1, title: e.label.substring(1) }
                        } else {
                            tag.value.selected_attribute = { id: -1, title: e.label }
                        }
                    } else {
                        tag.value.selected_attribute = e.value;
                    }
                    // hack to force selected_attribute to refresh
                    const temp = tag.value;
                    tag.value = temp;
                    loadTag(undefined);
                }}
                isMulti={false}
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
                        width: 'max-content',
                        borderStyle: "solid",
                        borderColor: "lavender",
                    }),
                    singleValue: (base) => ({
                        ...base,
                        padding: 0,
                        margin: 0,
                    }),
                }}
            />
        </div>
    );
};
