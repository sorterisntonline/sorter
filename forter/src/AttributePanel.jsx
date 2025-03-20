import { tag, current_attribute } from "./App";
import Creatable from "react-select/creatable"
import { signal, computed } from "@preact/signals-react";
import { loadTag } from "./Network";
import { dark_mode } from "./utils/themeUtils";
import Select from "react-select";

export const selected_attribute = computed(() => {
    if (!current_attribute.value) return null;
    return { value: current_attribute.value, label: ":" + current_attribute.value.title };
});

export const AttributePanel = () => {
    if (!tag.value || !tag.value.attributes) return null;
    
    const options = tag.value.attributes.map((attr) => {
        return { value: attr, label: ":" + attr.title + " (" + attr.votes + ")" }
    });

    return (
        <div className="border-4 border-purple-400 w-full lg:w-auto"
            style={{ borderStyle: 'double' }}>
            <Select
                options={options}
                unstyled={true}
                value={selected_attribute.value}
                onChange={(e) => {
                    if (e["__isNew__"]) {
                        if (e.label.startsWith(":")) {
                            current_attribute.value = { id: -1, title: e.label.substring(1) }
                        } else {
                            current_attribute.value = { id: -1, title: e.label }
                        }
                    } else {
                        current_attribute.value = e.value;
                    }
                    loadTag(undefined);
                }}
                isMulti={false}
                styles={{
                    control: (base) => ({
                        ...base,
                        minHeight: 30,
                        padding: 0,
                        margin: 0,
                        backgroundColor: dark_mode.value ? "#181a1b" : "white",
                        border: 2,
                        borderStyle: "none",
                        width: '100%',
                    }),
                    menu: (base) => ({
                        ...base,
                        backgroundColor: dark_mode.value ? "#181a1b" : "white",
                        border: 2,
                        width: '100%',
                        maxWidth: '100vw',
                        borderStyle: "solid",
                        borderColor: "lavender",
                    }),
                    singleValue: (base) => ({
                        ...base,
                        padding: 0,
                        margin: 0,
                    }),
                }}
                className="w-full lg:w-auto"
            />
        </div>
    );
};
