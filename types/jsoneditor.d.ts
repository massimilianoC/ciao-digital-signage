declare module "jsoneditor" {
    export class JSONEditor {
        constructor(container: HTMLElement, options?: Record<string, unknown>);
        set(value: unknown): void;
        update(value: unknown): void;
        destroy(): void;
    }
}
