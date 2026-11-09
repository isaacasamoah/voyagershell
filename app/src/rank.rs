use voyager_contract::{Layout, PanelOwner, PlacementId, rank::Rank};

pub(crate) fn eligible(owner: &PanelOwner, rank: Rank) -> Result<(), String> {
    match (owner, rank) {
        (_, Rank::Crew)
        | (PanelOwner::Fleet { .. }, Rank::Captain | Rank::Commodore)
        | (PanelOwner::Portals { .. }, Rank::Admiral) => Ok(()),
        (PanelOwner::Fleet { .. }, Rank::Admiral) => {
            Err("Admiral requires a persistent Voyage Portal".into())
        }
        _ => Err("Portals support Crew or Admiral in this trial".into()),
    }
}

pub(crate) fn set(layout: &mut Layout, id: &PlacementId, rank: Rank) -> Result<(), String> {
    let owner = crate::panels::owner_of(layout, id)?;
    eligible(&owner, rank)?;
    let content_id = crate::panels::group(layout, &owner)?
        .members
        .iter()
        .find(|panel| &panel.id == id)
        .ok_or("Rank target is unavailable")?
        .content
        .clone();
    let content = layout
        .contents
        .iter_mut()
        .find(|content| content.id == content_id)
        .ok_or("Rank content is unavailable")?;
    if content.type_id != "terminal" {
        return Err("Only terminal agent content supports trial ranks".into());
    }
    if !matches!(
        (content.rank, rank),
        (_, Rank::Crew)
            | (Rank::Crew, Rank::Captain | Rank::Admiral)
            | (Rank::Captain, Rank::Commodore)
    ) {
        return Err("Promote one rank at a time or explicitly reset to Crew".into());
    }
    content.rank = rank;
    Ok(())
}

pub(crate) fn validate(layout: &Layout) -> Result<(), String> {
    for content in layout
        .contents
        .iter()
        .filter(|content| !content.rank.is_crew())
    {
        if content.type_id != "terminal" {
            return Err("Only terminal agent content supports trial ranks".into());
        }
        for owner in crate::panels::owners(layout) {
            if crate::panels::group(layout, &owner)?
                .members
                .iter()
                .any(|panel| panel.content == content.id)
            {
                eligible(&owner, content.rank)?;
            }
        }
    }
    Ok(())
}
