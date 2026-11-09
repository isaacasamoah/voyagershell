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

pub(super) fn cell_width(font_advance: f32, scale: f32) -> f32 {
    super::background::span_width(font_advance, scale, 1)
}

pub(super) fn fitted_columns(inner_width: f32, cell_width: f32) -> u16 {
    ((inner_width / cell_width).floor() as u16).max(1)
}

#[cfg(test)]
mod tests {
    #[test]
    fn fitted_columns_fill_without_clipping_painted_cells() {
        for scale in [1., 1.25, 1.5, 2., 3.] {
            for (raw, inner) in [(7.826, 1410.), (7.25, 1000.), (6.2, 700.)] {
                let width = super::cell_width(raw, scale);
                let columns = super::fitted_columns(inner, width);
                let painted = super::super::background::span_width(width, scale, columns.into());
                let next =
                    super::super::background::span_width(width, scale, usize::from(columns) + 1);
                assert!(
                    painted <= inner,
                    "{raw}/{scale}: {columns} cells paint {painted} into {inner}"
                );
                assert!(next > inner, "{raw}/{scale}: another cell still fits");
            }
        }
        assert_ne!(
            super::cell_width(7.826, 3.),
            super::cell_width(super::cell_width(7.826, 2.), 3.)
        );
    }

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
