import { emptyGroup, type SearchGroup, type SearchNode } from './search';
import { unsetSelection } from './search-selection';

export type SkillSelection = { values: string[]; mode: string; proficiency: string };
const absent = (): SearchGroup => ({ ...emptyGroup(), context: 'skills', match: 'none' });
const isAbsent = (node: SearchNode) => node.kind === 'group' && node.context === 'skills' && node.match === 'none' && !node.children.length;

export function skillSelectionNode(selection: SkillSelection): SearchNode | undefined {
 const ids = selection.values.filter(value => value !== unsetSelection);
 const missing = selection.values.includes(unsetSelection);
 if (!ids.length) return missing ? absent() : undefined;
 const skills = ids.map(value => ({ ...emptyGroup(), context: 'skills', match: 'some' as const, children: [
  { kind: 'rule' as const, field: 'selection', operator: 'eq', value },
  { kind: 'rule' as const, field: 'record.proficiency', operator: 'gte', value: Number(selection.proficiency) }
 ] }));
 // Distribute absence over all-skills to keep rules within the API's depth of 3.
 if (selection.mode === 'all') return { ...emptyGroup(), children: skills.map(node => missing ? { ...emptyGroup(), mode: 'any', children: [node, absent()] } : node) };
 return { ...emptyGroup(), mode: 'any', children: [...skills, ...(missing ? [absent()] : [])] };
}

export function skillSelectionValues(node: SearchNode): SkillSelection | undefined {
 if (isAbsent(node)) return { values: [unsetSelection], mode: 'all', proficiency: '1' };
 if (node.kind !== 'group' || node.context || !node.children.length) return;
 const values: string[] = []; let proficiency: string | undefined; let missing: boolean | undefined;
 for (let child of node.children) {
  if (node.mode === 'any' && isAbsent(child)) { values.push(unsetSelection); continue; }
  let withMissing = false;
  if (node.mode === 'all' && child.kind === 'group' && !child.context && child.mode === 'any' && child.children.length === 2 && isAbsent(child.children[1])) { child = child.children[0]; withMissing = true; }
  if (missing !== undefined && missing !== withMissing) return;
  missing = withMissing;
  if (child.kind !== 'group' || child.context !== 'skills' || child.match !== 'some' || child.mode !== 'all' || child.children.length !== 2) return;
  const [id, level] = child.children;
  if (id.kind !== 'rule' || id.field !== 'selection' || id.operator !== 'eq' || typeof id.value !== 'string' || level.kind !== 'rule' || level.field !== 'record.proficiency' || level.operator !== 'gte' || ![1,2,3].includes(Number(level.value))) return;
  if (proficiency !== undefined && proficiency !== String(level.value)) return;
  proficiency = String(level.value); values.push(id.value);
 }
 if (missing) values.push(unsetSelection);
 return { values, mode: node.mode, proficiency: proficiency ?? '1' };
}

function representedSkills(group: SearchGroup): {nodes:SearchNode[];selection:SkillSelection} | undefined {
 if (group.mode !== 'all' || group.context) return;
 const nodes = group.children.filter(child => skillSelectionValues(child) || skillSelectionValues({...emptyGroup(),children:[child]}));
 if (!nodes.length) return;
 if (nodes.length === 1) {
  const selection = skillSelectionValues(nodes[0]) ?? skillSelectionValues({...emptyGroup(),children:nodes});
  if (selection) return {nodes,selection};
 }
 const selection = skillSelectionValues({...emptyGroup(),children:nodes});
 if (selection) return {nodes,selection};
}

export function readSkillSelection(group: SearchGroup, fallback: SkillSelection): SkillSelection {
 return representedSkills(group)?.selection ?? fallback;
}

export function replaceSkillSelection(group: SearchGroup, selection: SkillSelection): SearchGroup {
 const node = skillSelectionNode(selection);
 const nodes = node?.kind === 'group' && !node.context && node.mode === 'all' ? node.children : node ? [node] : [];
 if (group.mode !== 'all' || group.context) return { ...emptyGroup(), children: [group, ...nodes] };
 const represented = representedSkills(group);
 return { ...group, children: [...group.children.filter(child => !represented?.nodes.includes(child)), ...nodes] };
}
