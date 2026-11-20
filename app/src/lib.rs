mod activity;
mod administrator;
mod adoption;
pub mod agent_programs;
mod canvas;
pub mod client;
pub mod content;
pub mod context;
pub mod core;
mod core_endpoint;
pub mod core_state;
pub mod diagnostics;
mod families;
pub mod focus_hook;
mod front_door;
pub mod launch;
mod layout_parts;
mod layout_store;
pub mod observation;
mod panels;
pub mod replies;
pub mod reply_hook;
mod scope;
pub mod spoken;
pub mod vessel_socket;
pub mod vessel_type;
pub mod voyager_binding;
mod voyager_start;
pub mod workspace;

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
mod voice_live;
mod voice_live_transcript;

mod audio_io;
mod http1;
pub mod omni;
pub mod speech;
pub mod voice_layer;
pub mod voice_parts;
pub mod voice_reply;
mod voice_speaker;
pub mod voice_voyager;

use diagnostics as typing_trace;
