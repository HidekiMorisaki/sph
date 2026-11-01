import {readFileSync} from 'node:fs';

const defaults=JSON.parse(readFileSync(new URL('./workflow-defaults.json',import.meta.url),'utf8'));
export function defaultWorkflowTemplates(language='en'){
 if(!['ja','en'].includes(language))throw Error('Unsupported workflow template language.');
 return defaults.templates.map(item=>({templateKey:item.templateKey,...structuredClone(item.localized[language])}));
}

// Stable natural keys preserve edits and logical deletion across installation
// and upgrade runs. Never match by an editable name or revive a deleted row.
export async function seedDefaultWorkflowTemplates(client,language='en'){
 let inserted=0;
 for(const template of defaultWorkflowTemplates(language)){
  const result=await client.query(`INSERT INTO workflow_templates(template_key,name,description,definition,route,active)
   VALUES($1,$2,$3,$4::jsonb,'[]'::jsonb,false)
   ON CONFLICT(template_key) DO NOTHING RETURNING id`,[template.templateKey,template.name,template.description,JSON.stringify(template.definition)]);
  inserted+=result.rowCount;
 }
 return inserted;
}
