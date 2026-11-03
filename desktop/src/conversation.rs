use gpui_shell::{HostError, HostModule, HostValue};
use voyager_app::conversation_client::Client;
use voyager_contract::conversation::Request;

pub fn module(client: Client) -> HostModule {
    let identity = client.clone();
    let calls = client.clone();
    let speech = client.clone();
    HostModule::new(crate::script_types::CONVERSATION_MODULE)
        .declarations(crate::script_types::CONVERSATION)
        .component("Speech", crate::speech::component(speech))
        .function("request_id", move |_| {
            Ok(HostValue::from(identity.request_id()))
        })
        .async_function("call", move |arguments| {
            let raw = arguments.string(0)?;
            if raw.len() > 65536 {
                return Err(HostError::new("Conversation request exceeds 64 KiB"));
            }
            let request: Request =
                serde_json::from_str(raw).map_err(|e| HostError::new(e.to_string()))?;
            let client = calls.clone();
            Ok(async move {
                let reply = client.call(request).map_err(HostError::new)?;
                serde_json::to_string(&reply)
                    .map(HostValue::from)
                    .map_err(|e| HostError::new(e.to_string()))
            })
        })
        .async_function("snapshot", move |arguments| {
            let after = match arguments.get(0) {
                None | Some(HostValue::Null) => None,
                _ => Some(
                    arguments
                        .string(0)?
                        .parse::<u64>()
                        .map_err(|_| HostError::new("Invalid conversation revision"))?,
                ),
            };
            let client = client.clone();
            Ok(async move {
                let snapshot = client.snapshot(after).map_err(HostError::new)?;
                let encoded =
                    serde_json::to_string(&snapshot).map_err(|e| HostError::new(e.to_string()))?;
                if snapshot.is_some()
                    && let Some(path) = std::env::var_os("VOYAGER_CONVERSATION_EVIDENCE")
                {
                    let path = std::path::PathBuf::from(path);
                    let temporary = path.with_extension("tmp");
                    std::fs::write(&temporary, &encoded)
                        .and_then(|()| std::fs::rename(temporary, path))
                        .map_err(|e| HostError::new(e.to_string()))?;
                }
                Ok(HostValue::from(encoded))
            })
        })
}
