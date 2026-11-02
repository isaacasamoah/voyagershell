mod administrator;
pub mod client;
pub mod core;
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
