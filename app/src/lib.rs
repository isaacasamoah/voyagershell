pub mod client;
pub mod core;
pub mod workspace;

#[cfg(test)]
mod tests;

pub mod wire;

pub mod core_shapes {
    typify::import_types!("core-schema.json");
}
