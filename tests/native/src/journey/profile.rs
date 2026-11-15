use super::{Cases, Verdict, cases};
use crate::native::Native;
use crate::x11::Pixels;
use anyhow::{Context as _, Result, ensure};
use serde::Deserialize;
use serde_json::json;
use std::fs;

cases! {
    SeededTheme => "seeded-theme-drawn",
    LiveEdit => "live-edit-recolours",
    SecondBuild => "second-build-keeps-voyage",
    SeededDocument => "seeded-core-document-kept",
}

pub const CONTROL: Case = Case::SeededTheme;

const THEME: &str = "themes/voyager.json";
const PROBE: &str = "voyager-verifier-probe";
const SEEDED: &str = "#1b3a2d";
const EDITED: &str = "#3a1b2d";
const SHARE: f64 = 0.05;
const TOLERANCE: u8 = 2;

#[derive(Deserialize)]
struct Theme {
    background: String,
}

fn edited_theme() -> String {
    format!(
        "{{\"background\":\"{EDITED}\",\"foreground\":\"#f2e8cf\",\"muted\":\"#8aa399\",\"accent\":\"#e07a5f\"}}\n"
    )
}

fn rgb(text: &str) -> Result<[u8; 3]> {
    ensure!(
        text.len() == 7 && text.starts_with('#'),
        "{text} is not a six-digit colour"
    );
    let part = |at: usize| u8::from_str_radix(&text[at..at + 2], 16).context("A colour digit");
    Ok([part(1)?, part(3)?, part(5)?])
}

fn share(look: &Pixels, colour: [u8; 3], tolerance: u8) -> f64 {
    let near = |seen: u8, wanted: u8| seen.abs_diff(wanted) <= tolerance;
    let (mut hits, mut total) = (0usize, 0usize);
    for row in look.rows() {
        for pixel in row.as_chunks::<4>().0 {
            total += 1;
            hits += usize::from(
                near(pixel[2], colour[0]) && near(pixel[1], colour[1]) && near(pixel[0], colour[2]),
            );
        }
    }
    hits as f64 / total.max(1) as f64
}

fn drawn(native: &Native, colour: [u8; 3]) -> Result<Option<f64>> {
    let seen = share(&native.window_look()?, colour, TOLERANCE);
    Ok((seen >= SHARE).then_some(seen))
}

fn selected(native: &Native) -> Result<Option<String>> {
    Ok(native
        .document()?
        .and_then(|(_, layout)| layout.selected_voyage)
        .map(|voyage| format!("{voyage:?}")))
}

fn seeded(native: &Native) -> Result<([u8; 3], bool)> {
    let intact = native.seeded_intact(THEME)?;
    if intact {
        let text = fs::read(native.profile_path(THEME))?;
        let theme: Theme =
            serde_json::from_slice(&text).context("The seeded theme is not a theme")?;
        ensure!(
            theme.background == SEEDED,
            "The fixture's theme is {}, not {SEEDED}",
            theme.background
        );
    }
    Ok((rgb(SEEDED)?, intact))
}

pub fn drive(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
    let (seeded, intact) = seeded(native)?;
    native.seeded_document(PROBE)?;
    let edited = rgb(EDITED)?;
    ensure!(seeded != edited, "The fixture theme is the edit's colour");
    cases.check(native, Case::SeededTheme, |native| {
        let share = if intact {
            native.watch(|native| drawn(native, seeded))?
        } else {
            None
        };
        Verdict::new()
            .expect(
                "the app leaves the seeded theme file as it found it",
                intact,
            )
            .expect(
                "the window draws the seeded theme's background colour",
                share.is_some(),
            )
            .observed("seededShare", share)?
            .observed("seeded", json!(seeded))
    })?;
    let viewer = native.candidate()?.clone();
    cases.check(native, Case::LiveEdit, |native| {
        native.edit_profile_file(THEME, edited_theme().as_bytes())?;
        let share = native.watch(|native| drawn(native, edited))?;
        let same = native.candidate()? == &viewer;
        Verdict::new()
            .expect(
                "the window draws the edited background colour while the app runs",
                share.is_some(),
            )
            .expect("the same viewer process drew it, with no relaunch", same)
            .observed("editedShare", share)
    })?;
    cases.check(native, Case::SecondBuild, |native| {
        let before = selected(native)?;
        native.close()?;
        let kept = native.profile_holds(THEME, edited_theme().as_bytes());
        native.relaunch_with_second()?;
        let share = native.watch(|native| drawn(native, edited))?;
        let after = selected(native)?;
        Verdict::new()
            .expect(
                "the edited theme file is still in the profile after the first build quits",
                kept,
            )
            .expect(
                "the second build opens the same Voyage",
                before.is_some() && before == after,
            )
            .expect(
                "the second build draws the edited background colour",
                share.is_some(),
            )
            .observed("voyage", json!({"before":before,"after":after}))
    })?;
    cases.check(native, Case::SeededDocument, |native| {
        let wanted = native.seeded_document(PROBE)?.clone();
        let kept = native.core_document(PROBE)?;
        Verdict::new()
            .expect(
                "Core still holds the document the run seeded, at its seeded version",
                kept.as_ref() == Some(&wanted),
            )
            .observed("seededVersion", wanted.0)?
            .observed("keptVersion", kept.map(|(version, _)| version))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::x11::Geometry;

    fn look(colours: &[[u8; 3]]) -> Pixels {
        let bgrx = colours
            .iter()
            .flat_map(|[r, g, b]| [*b, *g, *r, 0])
            .collect();
        Pixels::new(
            Geometry {
                x: 0,
                y: 0,
                width: colours.len() as u16,
                height: 1,
            },
            bgrx,
        )
    }

    #[test]
    fn a_share_counts_only_pixels_near_the_colour() {
        let picture = look(&[[1, 2, 3], [1, 2, 4], [9, 9, 9], [9, 9, 9]]);
        assert_eq!(share(&picture, [1, 2, 3], 1), 0.5);
        assert_eq!(share(&picture, [1, 2, 3], 0), 0.25);
        assert_eq!(share(&picture, [200, 0, 0], 2), 0.0);
    }

    #[test]
    fn a_colour_is_read_from_six_digits() -> Result<()> {
        assert_eq!(rgb("#1b3a2d")?, [0x1b, 0x3a, 0x2d]);
        assert!(rgb("1b3a2d").is_err() && rgb("#1b3").is_err());
        Ok(())
    }
}
