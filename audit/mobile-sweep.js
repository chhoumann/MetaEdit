(async () => {
  const plugin = app.plugins.plugins.metaedit;
  const api = plugin.api, c = plugin.controller;
  const mk = async (path, body) => { let f=app.vault.getAbstractFileByPath(path); if(f){await app.vault.modify(f,body);}else{f=await app.vault.create(path,body);} await new Promise(r=>setTimeout(r,350)); return f; };
  const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
  const R = {};
  try {
    // CTRL/RUN/API create + read
    let f = await mk('m-create.md', '---\nexisting: 1\n---\nbody\n');
    await api.createYamlProperty('fresh','v',f); await sleep(200);
    R.create = (await app.vault.read(f)).includes('fresh: v');
    R.getPropertyValue = (await api.getPropertyValue('existing', f)) === 1;

    // API-03 fix: falsy value presence
    let f2 = await mk('m-falsy.md', '---\npub: false\n---\nx\n'); await sleep(300);
    R.api03_falsy = api.getFilesWithProperty('pub').some(x=>x.path==='m-falsy.md');

    // API-07 fix: bad path returns []
    const g = await api.getPropertiesInFile('m-nope-xyz.md'); R.api07_array = Array.isArray(g);

    // deleteProperty block list (CTRL-07 fix)
    let f3 = await mk('m-del.md', '---\ntags:\n  - a\n  - b\nkeep: y\n---\nbody\n');
    const tp=(await c.getPropertiesInFile(f3)).find(p=>p.type===0&&p.key==='tags'&&!p.path);
    await c.deleteProperty(tp,f3); await sleep(200);
    const dc=await app.vault.read(f3); R.delBlockList = !/^\s*-\s*a/m.test(dc) && dc.includes('keep: y');

    // appendDataviewField inline
    let f4 = await mk('m-inline.md', 'start\nfield:: one\n');
    await api.appendDataviewField('field','two',f4); await sleep(200);
    const ic=await app.vault.read(f4); R.appendInline = ic.includes('field:: one') && ic.includes('field:: two');

    // multi-value api.update array -> YAML list
    let f5 = await mk('m-multi.md', '---\nl: x\n---\nb\n');
    await api.update('l',['p','q'],f5); await sleep(200);
    R.multiArray = JSON.stringify(app.metadataCache.getFileCache(f5)?.frontmatter?.l)==='["p","q"]';

    // nested YAML upsert + read
    let f6 = await mk('m-yaml.md', '---\nmeta:\n  a: 1\n---\nb\n');
    await api.addOrUpdateYamlPath(['meta','b'],'created',f6,{createParents:true}); await sleep(200);
    R.yamlNested = (await api.getYamlPath('meta.b', f6))==='created';

    // tag editing (rename body tag)
    let f7 = await mk('m-tag.md', '#alpha here\n');
    for(let i=0;i<40;i++){await sleep(50);const t=(await c.getPropertiesInFile(f7)).filter(p=>p.type===2);if(t.length&&t.every(x=>x.position&&'#alpha here\n'.slice(x.position.start,x.position.end)===x.key))break;}
    const tag=(await c.getPropertiesInFile(f7)).find(p=>p.type===2&&p.key==='#alpha');
    await c.updatePropertyInFile(tag,'#beta',f7); await sleep(200);
    R.tagRename = (await app.vault.read(f7))==='#beta here\n';

    // progress counting (PROG-03 fix): only [x]/[X] complete
    let f8 = await mk('m-prog.md', '---\ndone: 0\ntodo: 0\n---\n- [ ] a\n- [x] b\n- [/] c\n- [X] d\n');
    for(let i=0;i<40;i++){await sleep(50);const li=app.metadataCache.getFileCache(f8)?.listItems?.filter(x=>x.task);if(li&&li.length===4)break;}
    const pe=plugin.settings.ProgressProperties.enabled, pp=plugin.settings.ProgressProperties.properties;
    plugin.settings.ProgressProperties.enabled=true;
    plugin.settings.ProgressProperties.properties=[{name:'done',type:'Completed Tasks'},{name:'todo',type:'Incomplete Tasks'}];
    await c.handleProgressProps(await c.getPropertiesInFile(f8), f8); await sleep(250);
    const pf=app.metadataCache.getFileCache(f8)?.frontmatter;
    R.progCount = String(pf?.done)==='2' && String(pf?.todo)==='2';
    plugin.settings.ProgressProperties.enabled=pe; plugin.settings.ProgressProperties.properties=pp;

    // bulk merge
    let f9 = await mk('m-bulk.md', '---\ntags: [a, b]\n---\nb\n');
    await plugin.bulkEditor.apply([f9],'tags','c','merge'); await sleep(200);
    R.bulkMerge = JSON.stringify(app.metadataCache.getFileCache(f9)?.frontmatter?.tags)==='["a","b","c"]';

  } catch(e) { R.__error = String(e && e.message || e); }
  return JSON.stringify(R);
})()
