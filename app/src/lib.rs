mod activity;
mod administrator;
mod adoption;
mod canvas;
pub mod client;
pub mod content;
pub mod context;
pub mod core;
mod core_endpoint;
pub mod core_state;
pub mod diagnostics;
mod families;
mod front_door;
pub mod launch;
mod layout_parts;
mod layout_store;
pub mod observation;
mod panels;
mod scope;
pub mod vessel_socket;
pub mod vessel_type;
pub mod voyage_close;
pub mod workspace;
pub mod worktrees;

#[cfg(test)]
mod tests;

pub mod wire;

pub mod core_shapes {
    typify::import_types!("core-schema.json");
}
pub mod conversation;
pub mod conversation_client;
pub mod provider;
mod provider_settings;

mod voice;
mod voice_host;
mod voice_session;
mod voice_transcript;
mod voice_wire;

use diagnostics as typing_trace;
