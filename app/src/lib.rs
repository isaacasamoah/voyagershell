mod administrator;
mod canvas;
pub mod client;
pub mod content;
pub mod context;
pub mod core;
mod core_endpoint;
mod process;
mod scope;
pub mod workspace;

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
