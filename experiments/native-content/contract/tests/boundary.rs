use voyager_contract::{Request, Response};

#[test]
fn requests_and_results_reject_unknown_fields_and_versions() {
    let inspect =
        r#"{"version":"1","operation":"content.inspect","requestId":"r1","contentId":"notes-a"}"#;
    assert!(serde_json::from_str::<Request>(inspect).is_ok());
    assert!(serde_json::from_str::<Request>(&inspect.replace("\"1\"", "\"2\"")).is_err());
    assert!(
        serde_json::from_str::<Request>(
            &inspect.replace("\"notes-a\"", "\"notes-a\",\"role\":\"owner\"")
        )
        .is_err()
    );
    assert!(serde_json::from_str::<Response>(r#"{"version":"1","status":"applied","requestId":"r1","contentId":"notes-a","snapshot":{"contentId":"notes-a","revision":"rev","data":{"title":"t","text":"x"}}}"#).is_ok());
}
