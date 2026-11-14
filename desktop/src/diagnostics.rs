pub(crate) use voyager_app::diagnostics::record as trace;

#[path = "diagnostics_redraw.rs"]
pub(crate) mod redraw;

#[cfg(feature = "frame-profiler")]
#[path = "diagnostics_frame.rs"]
pub(crate) mod frame;

#[cfg(feature = "frame-profiler")]
#[path = "diagnostics_glyph.rs"]
pub(crate) mod glyph;
