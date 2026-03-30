export type FieldType =
    | "text"
    | "number"
    | "select"
    | "toggle"
    | "color"
    | "url"
    | "textarea"
    | "secret";

export interface SelectOption {
    value: string;
    label: string;
}

/** Show this field only when another field matches a specific value */
export interface FieldCondition {
    field: string;
    value: string | boolean | number;
}

export interface ConfigSchemaField {
    key: string;
    label: string;
    type: FieldType;
    required?: boolean;
    default?: unknown;
    options?: SelectOption[]; // for "select" type
    hint?: string;
    conditions?: FieldCondition[]; // conditional visibility
    placeholder?: string;
}

export interface ConfigSchema {
    schemaVersion: number;
    fields: ConfigSchemaField[];
}
