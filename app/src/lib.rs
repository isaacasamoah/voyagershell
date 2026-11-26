mod activity;
mod administrator;
mod adoption;
pub mod agent_programs;
mod canvas;
pub mod change_sentence;
pub mod client;
pub mod content;
pub mod context;
pub mod core;
mod core_endpoint;
#[cfg(test)]
mod core_session;
pub mod core_state;
pub mod diagnostics;
mod families;
pub mod focus_hook;
mod front_door;
#[cfg(unix)]
pub mod install;
pub mod launch;
mod layout_parts;
mod layout_store;
pub mod observation;
mod panels;
pub mod replies;
pub mod reply_hook;
mod scope;
mod session_name;
pub mod spoken;
pub mod vessel_overview;
pub mod vessel_socket;
pub mod vessel_type;
pub mod voyager_binding;
mod voyager_start;
pub mod workspace;

#[cfg(test)]
mod dock_tests;
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

mod audio_io;
mod http1;
pub mod omni;
mod silero;
pub mod speech;
mod voice;
mod voice_host;
pub mod voice_layer;
pub mod voice_parts;
pub mod voice_reply;
pub mod voice_route;
mod voice_session;
pub mod voice_settings;
mod voice_speaker;
pub mod voice_talk_over;
mod voice_transcript;
pub mod voice_voyager;
mod voice_wire;

use diagnostics as typing_trace;
