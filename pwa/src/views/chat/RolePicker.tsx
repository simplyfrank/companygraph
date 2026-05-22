// Role picker dropdown (FR-R03).
//
// 20 roles from CHAT_ROLE_IDS plus a leading "Auto-route" option
// (value === undefined). Labels are derived: strip the `uj_` prefix,
// replace underscores with spaces, title-case each word.

import { CHAT_ROLE_IDS, type ChatRoleId } from "@companygraph/shared/types";

const AUTO_VALUE = "__auto__";

function labelFor(id: ChatRoleId): string {
  const stripped = id.startsWith("uj_") ? id.slice(3) : id;
  return stripped
    .split("_")
    .map((w) => (w.length === 0 ? w : w[0]!.toUpperCase() + w.slice(1)))
    .join(" ");
}

export interface RolePickerProps {
  value: ChatRoleId | undefined;
  onChange: (id: ChatRoleId | undefined) => void;
  disabled?: boolean;
}

export function RolePicker(props: RolePickerProps) {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const v = e.target.value;
    if (v === AUTO_VALUE) {
      props.onChange(undefined);
    } else {
      props.onChange(v as ChatRoleId);
    }
  };

  return (
    <select
      className="role-picker"
      aria-label="Chat role"
      value={props.value ?? AUTO_VALUE}
      onChange={handleChange}
      disabled={props.disabled ?? false}
    >
      <option value={AUTO_VALUE}>Auto-route</option>
      {CHAT_ROLE_IDS.map((id) => (
        <option key={id} value={id}>
          {labelFor(id)}
        </option>
      ))}
    </select>
  );
}
