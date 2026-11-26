use super::Avatar;
use gpui::{Context, Window};
use voyager_contract::avatar_animation::Trigger;
use voyager_contract::{Action, Context as Scope};

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) enum Click {
    Restore,
    Home,
    Return(Action),
}

impl Click {
    pub(super) fn of(floating: bool, parked: bool, scope: &Scope) -> Option<Self> {
        match (floating, parked, scope) {
            (true, _, _) => Some(Self::Restore),
            (false, _, Scope::Workspace) => Some(Self::Home),
            (false, _, Scope::Portal { .. }) | (false, false, _) => None,
            (false, true, Scope::Voyage { id }) => {
                Some(Self::Return(Action::SelectVoyage { id: id.clone() }))
            }
            (false, true, Scope::Fleet { id }) => {
                Some(Self::Return(Action::SelectFleet { id: id.clone() }))
            }
            (false, true, Scope::Vessel { id }) => {
                Some(Self::Return(Action::RevealPlacement { id: id.clone() }))
            }
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
        let parked = self.geometry.borrow().dock_target(&self.scope).is_none();
        match Click::of(
            self.floating == Some(window.window_handle()),
            parked,
            &self.scope,
        ) {
            Some(Click::Restore) => self.restore_workspace(cx),
            Some(Click::Home) => self.submit(Action::Home, cx),
            Some(Click::Return(action)) => self.submit(action, cx),
            None => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use voyager_contract::{FleetId, PlacementId, VoyageId};

    #[test]
    fn a_click_opens_home_returns_a_parked_dock_and_leaves_a_portal_or_a_dock_in_view() {
        let fleet = FleetId("fleet".into());
        let voyage = VoyageId("voyage".into());
        let placement = PlacementId("placement".into());
        let scopes = [
            Scope::Workspace,
            Scope::Voyage { id: voyage.clone() },
            Scope::Fleet { id: fleet.clone() },
            Scope::Vessel {
                id: placement.clone(),
            },
            Scope::Portal {
                id: placement.clone(),
            },
        ];
        let parked = [
            Some(Click::Home),
            Some(Click::Return(Action::SelectVoyage { id: voyage })),
            Some(Click::Return(Action::SelectFleet { id: fleet })),
            Some(Click::Return(Action::RevealPlacement { id: placement })),
            None,
        ];
        for (scope, parked) in scopes.iter().zip(parked) {
            assert_eq!(Click::of(true, false, scope), Some(Click::Restore));
            assert_eq!(Click::of(true, true, scope), Some(Click::Restore));
            assert_eq!(Click::of(false, true, scope), parked);
            let in_view = matches!(scope, Scope::Workspace).then_some(Click::Home);
            assert_eq!(Click::of(false, false, scope), in_view);
        }
    }
}
