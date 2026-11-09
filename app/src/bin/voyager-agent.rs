fn main() {
    #[cfg(target_os = "linux")]
    let result = voyager_app::coordination::command::run(std::env::args().collect());
    #[cfg(not(target_os = "linux"))]
    let result: Result<(), String> =
        Err("This agent communication experiment currently supports Linux only".into());
    if let Err(error) = result {
        eprintln!("{error}");
        std::process::exit(2);
    }
}
