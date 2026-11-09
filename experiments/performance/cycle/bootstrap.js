export function seed(view, cx, count) {
  cx.spawn(async task => {
    while (!view.layout || view.busy) await task.sleep(25);
    const voyage = view.layout.voyages.find(v => v.id === view.layout.selectedVoyage);
    const main = voyage.fleets.find(f => f.id === view.layout.selectedFleet);
    const apply = async action => {
      while (view.busy) await task.sleep(25);
      const result = await new Promise(resolve => view.run(action, task, resolve));
      if (!result || result.status !== 'applied') throw Error(JSON.stringify(result));
      return result.layout;
    };
    try {
      if (count > 1 && voyage.fleets.flatMap(f => f.vessels).length === 1) {
        const add = (id, side, owner, typeId) => apply({
          operation:'create-content', typeId,
          destination:{kind:'panel',owner,insertion:{kind:'beside',id,side}}
        });
        const owner = {kind:'fleet',id:main.id};
        let layout = await add(main.vessels[0].id,'right',owner,'notes');
        let fleet = layout.voyages.find(v => v.id === voyage.id).fleets.find(f => f.id === main.id);
        await add(fleet.vessels.at(-1).id,'bottom',owner,'notes');
        layout = await apply({operation:'create-fleet-with-content',voyage:voyage.id,name:'Hidden',source:{kind:'voyage',voyageId:voyage.id,cwd:voyage.cwd},typeId:'terminal'});
        let hidden = layout.voyages.find(v => v.id === voyage.id).fleets.find(f => f.id !== main.id);
        for(let index=4;index<count;index++) {
          layout = await add(hidden.vessels[0].id,'right',{kind:'fleet',id:hidden.id},'terminal');
          hidden = layout.voyages.find(v => v.id === voyage.id).fleets.find(f => f.id === hidden.id);
        }
        await apply({operation:'select-fleet',id:main.id});
      }
      view.status = '';
    } catch(error) {
      view.status = 'Performance setup failed: ' + String(error);
    }
    task.notify();
  });
}
