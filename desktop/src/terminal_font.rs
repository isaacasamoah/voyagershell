pub fn family(names: &[String]) -> &str {
    [
        "DejaVu Sans Mono",
        "Noto Sans Mono",
        "Liberation Mono",
        "Menlo",
        "Consolas",
    ]
    .into_iter()
    .find_map(|preferred| names.iter().find(|name| name.as_str() == preferred))
    .or_else(|| {
        names
            .iter()
            .find(|name| name.to_lowercase().contains("mono"))
    })
    .map(String::as_str)
    .unwrap_or("DejaVu Sans Mono")
}

#[cfg(test)]
mod tests {
    #[test]
    fn selects_the_reference_monospace_before_a_proportional_fallback() {
        let local = vec!["Adwaita Sans".into(), "Noto Sans Mono".into()];
        assert_eq!(super::family(&local), "Noto Sans Mono");
        let mut with_reference = local;
        with_reference.push("DejaVu Sans Mono".into());
        assert_eq!(super::family(&with_reference), "DejaVu Sans Mono");
        let alternate = vec!["Adwaita Sans".into(), "Example Mono".into()];
        assert_eq!(super::family(&alternate), "Example Mono");
        assert_eq!(super::family(&["Adwaita Sans".into()]), "DejaVu Sans Mono");
    }
}
