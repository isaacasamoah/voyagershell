use std::path::Path;
use std::process::Command;

fn main() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("workspace root");
    for input in [
        ".cargo/config.toml",
        "desktop/prepare-sdk.py",
        "desktop/patches",
    ] {
        println!("cargo:rerun-if-changed={}", root.join(input).display());
    }
    let status = Command::new("python3")
        .arg(root.join("desktop/prepare-sdk.py"))
        .arg("--check")
        .current_dir(root)
        .status()
        .expect("python3 is required to verify the native SDK");
    if !status.success() {
        panic!("native SDK check failed; run python3 desktop/prepare-sdk.py");
    }
}
