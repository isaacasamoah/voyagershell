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

pub const CONTENT_VIEW_MODULE: &str = "voyager_content_view";
pub const CONTENT_VIEW: &str = r#"
export const Notes: { new: (id: string, props: { contentId: string }) => import("gpui-kit").NativeElement };
"#;

pub const CONTENT_MODULE: &str = "voyager_content";
pub const CONTENT: &str = r#"
export function identity(): string;
export function invoke(request: string, requestId: string, expectedRevision: string): Promise<string>;
export function theme(): {
    background: import("gpui-kit").Color;
    foreground: import("gpui-kit").Color;
    muted: import("gpui-kit").Color;
    accent: import("gpui-kit").Color;
};
"#;
