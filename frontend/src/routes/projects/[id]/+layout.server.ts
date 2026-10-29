import { error } from '@sveltejs/kit';

export function load({ params }: {params:{id:string}}) {
 if(!/^[A-Z][A-Z0-9_]{0,63}$/.test(params.id))error(404,'Project not found');
 return {};
}
