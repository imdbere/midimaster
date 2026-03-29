fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        let manifest_dir =
            std::path::PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
        let lib_dir = manifest_dir
            .join("libs")
            .join("teVirtualMIDI");
        println!("cargo:rustc-link-search=native={}", lib_dir.display());
        let arch = std::env::var("CARGO_CFG_TARGET_ARCH").unwrap_or_default();
        let lib = if arch == "x86" { "teVirtualMIDI32" } else { "teVirtualMIDI64" };
        println!("cargo:rustc-link-lib={lib}");
    }
    tauri_build::build()
}
