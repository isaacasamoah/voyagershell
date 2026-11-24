use super::Avatar;
use gpui::{Context, Window};
use voyager_contract::avatar_animation::Trigger;
use voyager_contract::{Action, Context as Scope};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum Click {
    Restore,
    Home,
}

impl Click {
    pub(super) fn of(floating: bool, scope: &Scope) -> Option<Self> {
        match (floating, scope) {
            (true, _) => Some(Self::Restore),
            (false, Scope::Workspace) => Some(Self::Home),
            (false, _) => None,
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
            Some(Click::Restore) => self.restore_workspace(cx),
            Some(Click::Home) => self.submit(Action::Home, cx),
            None => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use voyager_contract::FleetId;

    #[test]
    fn a_click_opens_home_at_home_and_does_nothing_anywhere_else() {
        let fleet = Scope::Fleet {
            id: FleetId("fleet".into()),
        };
        assert_eq!(Click::of(false, &Scope::Workspace), Some(Click::Home));
        assert_eq!(Click::of(false, &fleet), None);
        assert_eq!(Click::of(true, &Scope::Workspace), Some(Click::Restore));
        assert_eq!(Click::of(true, &fleet), Some(Click::Restore));
    }
}
