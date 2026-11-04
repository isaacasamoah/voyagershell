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
export function revision(): string;
export function context_facts(): Promise<string>;
export function launches(): Promise<string>;
export function processes(version: string): Promise<string>;
export function notice(): { revision: string; packageRevision: string; activityRevision: string };
export function reported_activity(): string;
export function refresh_activity(): Promise<void>;
"#;

pub const CONVERSATION_MODULE: &str = "voyager_conversation";

pub const CONVERSATION: &str = r#"
export const Speech: { new: (id: string, props: Record<string, never>) => import("gpui-kit").NativeElement };
export function request_id(): string;
export function call(request: string): Promise<string>;
export function snapshot(after: string | null): Promise<string>;
"#;

pub const CONTENT_VIEW_MODULE: &str = "voyager_content_view";
pub const CONTENT_VIEW: &str = r#"
export const Notes: { new: (id: string, props: { contentId: string }) => import("gpui-kit").NativeElement };
export function descriptions(): Promise<string>;
"#;

pub const CONTENT_MODULE: &str = "voyager_content";
pub const CONTENT: &str = r#"
export function identity(): string;
export function request_id(): string;
export function changed(after: string | null): Promise<string>;
export function invoke(request: string, requestId: string, expectedRevision: string): Promise<string>;
export function theme(): {
    background: import("gpui-kit").Color;
    foreground: import("gpui-kit").Color;
    muted: import("gpui-kit").Color;
    accent: import("gpui-kit").Color;
};
"#;

pub const AVATAR_MODULE: &str = "voyager_avatar";

pub const AVATAR: &str = r#"
export const Brand: { new: (id: string, props: Record<string, never>) => import("gpui-kit").NativeElement };
export const Layer: { new: (id: string, props: { dockReceipt: string; dockEpoch: string; version: string; scope: string; layoutKey: string }) => import("gpui-kit").NativeElement };
export const Target: { new: (id: string, props: { scope: string; fallback: boolean }) => import("gpui-kit").NativeElement };
export const PortalArea: { new: (id: string, props: Record<string, never>) => import("gpui-kit").NativeElement };
export function window_epoch(): string;
export function dock_target_visible(scope: string): boolean;
export function speech_in_primary(): boolean;
export function take_result(): string | null;
"#;
