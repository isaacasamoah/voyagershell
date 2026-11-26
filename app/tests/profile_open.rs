use std::{collections::BTreeMap, fs, path::Path};
use voyager_app::client::open_profile;
use voyager_app::content::Shipped;
use voyager_app::content::install::Absent;

fn files(root: &Path) -> BTreeMap<String, Vec<u8>> {
    let mut found = BTreeMap::new();
    let mut folders = vec![root.to_path_buf()];
    while let Some(folder) = folders.pop() {
        for entry in fs::read_dir(&folder).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                folders.push(path);
            } else {
                let name = path.strip_prefix(root).unwrap().display().to_string();
                found.insert(name, fs::read(&path).unwrap());
            }
        }
    }
    found
}

#[test]
fn a_second_open_of_a_profile_is_refused_before_any_content_write() {
    let profile = std::env::temp_dir().join(format!("voyager-profile-open-{}", std::process::id()));
    let _ = fs::remove_dir_all(&profile);
    fs::create_dir_all(&profile).unwrap();
    let first = open_profile(&profile, &[]).unwrap();
    let before = files(&profile);
    let shipped = [Shipped {
        path: "canvas/late.json",
        bytes: b"{}",
        absent: Absent::Write,
    }];
    let refusal = open_profile(&profile, &shipped).err().unwrap();
    assert!(refusal.contains("already running"), "{refusal}");
    assert_eq!(
        files(&profile),
        before,
        "A refused second open changed the profile"
    );
    drop(first);
    let second = open_profile(&profile, &shipped).unwrap();
    assert!(profile.join("canvas/late.json").is_file());
    drop(second);
    fs::remove_dir_all(profile).unwrap();
}
