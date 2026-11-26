use std::{
    ffi::OsString,
    path::{Path, PathBuf},
};

pub fn runtime_folder(runtime: Option<OsString>) -> Option<PathBuf> {
    absolute(runtime)
}

pub fn cache_folder(cache: Option<OsString>, home: Option<OsString>) -> Option<PathBuf> {
    absolute(cache).or_else(|| absolute(home).map(|home| home.join(".cache")))
}

fn absolute(value: Option<OsString>) -> Option<PathBuf> {
    value
        .map(PathBuf::from)
        .filter(|path| Path::is_absolute(path))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn some(text: &str) -> Option<OsString> {
        Some(OsString::from(text))
    }

    #[test]
    fn a_relative_runtime_folder_is_ignored() {
        assert_eq!(
            runtime_folder(some("/run/user/1000")),
            Some("/run/user/1000".into())
        );
        assert_eq!(runtime_folder(some("run/user")), None);
        assert_eq!(runtime_folder(some("")), None);
        assert_eq!(runtime_folder(None), None);
    }

    #[test]
    fn a_relative_cache_folder_is_ignored_in_favour_of_the_home_cache() {
        assert_eq!(
            cache_folder(some("/cache"), some("/home/a")),
            Some("/cache".into())
        );
        assert_eq!(
            cache_folder(some("cache"), some("/home/a")),
            Some("/home/a/.cache".into())
        );
        assert_eq!(
            cache_folder(None, some("/home/a")),
            Some("/home/a/.cache".into())
        );
    }

    #[test]
    fn a_relative_or_missing_home_gives_no_cache_folder() {
        assert_eq!(cache_folder(some("cache"), some("home")), None);
        assert_eq!(cache_folder(None, some("")), None);
        assert_eq!(cache_folder(None, None), None);
    }
}
