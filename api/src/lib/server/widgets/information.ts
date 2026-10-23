import bundled from '../../../../widgets/catalogue.json';
import descriptions from '../../../../widgets/information.json';
import { digest, type Manifest } from './contract';

// Supplement existing official releases without rewriting immutable definitions or approvals.
export function widgetInformation(definition: Manifest, sourceKey: string) {
 const original = sourceKey === 'sph-official' && bundled.widgets.find(w => w.id === definition.id && w.version === definition.version);
 const officialDescription = original && digest(original) === digest(definition)
  ? (descriptions as Record<string, {ja:string;en:string}>)[`${definition.id}@${definition.version}`]
  : undefined;
 return {author:definition.author ?? definition.provider,description:definition.description ?? officialDescription ?? null};
}
