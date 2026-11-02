pub const HEADER_MODULE: &str = "voyager_header";
pub const WORKSPACE_MODULE: &str = "voyager_workspace";

pub const HEADER: &str = r#"
export function projection(): {
    background: import("gpui-kit").Color;
    foreground: import("gpui-kit").Color;
    muted: import("gpui-kit").Color;
    accent: import("gpui-kit").Color;
};
"#;

pub const WORKSPACE: &str = r#"
export function request_id(): string;
export function call(request: string): Promise<string>;
export function terminal_open(request: string): Promise<string>;
"#;

pub const CONVERSATION_MODULE: &str = "voyager_conversation";

pub const CONVERSATION: &str = r#"
export function request_id(): string;
export function call(request: string): Promise<string>;
export function snapshot(after: string | null): Promise<string>;
"#;

pub const AVATAR_MODULE: &str = "voyager_avatar";

pub const AVATAR: &str = r#"
export const Brand: { new: (id: string, props: Record<string, never>) => import("gpui-kit").NativeElement };
export const Layer: { new: (id: string, props: { dockReceipt: string; dockEpoch: string; version: string; scope: string; layoutKey: string }) => import("gpui-kit").NativeElement };
export const Target: { new: (id: string, props: { scope: string; fallback: boolean }) => import("gpui-kit").NativeElement };
export function window_epoch(): string;
export function take_result(): string | null;
"#;
