mod activity;
mod administrator;
mod canvas;
pub mod client;
pub mod content;
pub mod context;
pub use client::coordination;
pub mod core;
mod core_endpoint;
pub mod launch;
pub mod observation;
mod panels;
mod process;
mod rank;
mod scope;
mod terminal_lifecycle;
pub mod voyage_close;
pub mod workspace;
pub mod worktrees;

#[cfg(test)]
mod tests;

pub mod wire;

pub mod core_shapes {
    typify::import_types!("core-schema.json");
}
mod codex;
pub mod conversation;
pub mod conversation_client;
pub mod provider;

mod voice;
mod voice_host;
mod voice_session;
mod voice_transcript;
mod voice_wire;

#[path = "../../experiments/performance/typing-latency/trace.rs"]
mod typing_trace;
pub use typing_trace::record as record_terminal_trace;
