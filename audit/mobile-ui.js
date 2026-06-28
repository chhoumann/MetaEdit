(async () => {
  const plugin = app.plugins.plugins.metaedit;
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
  const R={};
  try {
    // Suggester opens with rows on mobile
    let f=app.vault.getAbstractFileByPath('m-ui.md'); const body='---\nstatus: draft\nprio: 1\n---\nbody\n';
    if(f){await app.vault.modify(f,body);}else{f=await app.vault.create('m-ui.md',body);} await sleep(350);
    await plugin.runMetaEditForFile(f); await sleep(400);
    const items=Array.from(document.querySelectorAll('.suggestion-item')).map(e=>((e.querySelector('.suggestion-item-text')||e).textContent||'').trim());
    R.suggesterRows = items.some(t=>t==='New YAML property') && items.some(t=>t.startsWith('status'));
    app.workspace.activeModal?.close?.();
    document.querySelectorAll('.suggestion-container,.suggestion-item,.prompt').forEach(el=>el.remove());
    await sleep(150);
    // Settings tab renders MetaEdit sections on mobile
    app.setting.open(); app.setting.openTabById('metaedit'); await sleep(500);
    const names=Array.from(app.setting.activeTab.containerEl.querySelectorAll('.setting-item-name')).map(e=>e.textContent.trim());
    R.settingsSections = names.includes('Auto Properties') && names.includes('Kanban Board Helper') && names.includes('UI Elements');
    app.setting.close();
    R.errors = (typeof app.plugins.plugins.metaedit !== 'undefined');
  } catch(e){ R.__error=String(e&&e.message||e); }
  return JSON.stringify(R);
})()
