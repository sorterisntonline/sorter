import { signal, effect } from "@preact/signals-react";

export const errors = signal([]);

const msg_to_timer = {};

effect(() => {
  if (errors.value.length === 0) return;
  msg_to_timer[errors.value[0].message] = setTimeout(() => {
    errors.value = errors.value.slice(1);
  }, 4000);
});

export const ErrorPanel = () => {
  if (errors.value.length === 0) return null;
  return (
    <div
      style={{ position: "fixed", bottom: 0 }}
      className="border-2 border-red-400 bg-red-300"
    >
      {errors.value.map((error, i) => {
        return (
          <div key={i} className="text-red-950">
            {error.message}
          </div>
        );
      })}
    </div>
  );
};
