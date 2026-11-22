use super::Avatar;
use gpui::{Context, Window};
use voyager_contract::avatar_animation::Trigger;
use voyager_contract::{Action, Context as Scope};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum Click {
    Restore,
    Home,
    Minimize,
}

impl Click {
    pub(super) fn of(floating: bool, scope: &Scope) -> Self {
        match (floating, scope) {
            (true, _) => Self::Restore,
            (false, Scope::Workspace) => Self::Home,
            (false, _) => Self::Minimize,
        }
    }
}

impl Avatar {
    pub(super) fn activate(&mut self, window: &Window, cx: &mut Context<Self>) {
        self.animate(Trigger::Click, cx);
        if self.pending.is_some() {
            self.waiting_click = Some(window.window_handle());
            return;
        }
        self.click(window, cx);
    }

    pub(super) fn dock(&mut self, scope: Scope, cx: &mut Context<Self>) {
        self.submit(Action::Dock { context: scope }, cx);
    }

    pub(super) fn release_waiting_click(&mut self, cx: &mut Context<Self>) {
        let Some(handle) = self.waiting_click.take() else {
            return;
        };
        let avatar = cx.weak_entity();
        cx.defer(move |cx| {
            let _ = handle.update(cx, |_, window, cx| {
                let _ = avatar.update(cx, |avatar, cx| avatar.click(window, cx));
            });
        });
    }

    fn click(&mut self, window: &Window, cx: &mut Context<Self>) {
        match Click::of(self.floating == Some(window.window_handle()), &self.scope) {
            Click::Restore => self.restore_workspace(cx),
            Click::Home => self.submit(Action::Home, cx),
            Click::Minimize => {
                if std::env::var_os("VOYAGER_AVATAR_DIAGNOSTICS").is_some() {
                    eprintln!("Avatar float trigger: activation");
                }
                self.float(window, cx);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use voyager_contract::FleetId;

    #[test]
    fn a_click_opens_home_at_home_and_minimizes_anywhere_else() {
        let fleet = Scope::Fleet {
            id: FleetId("fleet".into()),
        };
        assert_eq!(Click::of(false, &Scope::Workspace), Click::Home);
        assert_eq!(Click::of(false, &fleet), Click::Minimize);
        assert_eq!(Click::of(true, &Scope::Workspace), Click::Restore);
        assert_eq!(Click::of(true, &fleet), Click::Restore);
    }
}
