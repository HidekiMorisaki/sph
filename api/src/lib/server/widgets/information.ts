import type { Manifest } from './contract';

export function widgetInformation(definition: Manifest, _sourceKey: string) {
 return {author:definition.author ?? definition.provider,description:definition.description ?? null};
}
