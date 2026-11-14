import {evmApi} from '#lib/server/projects/management.js';
export const GET:import('./$types').RequestHandler=e=>evmApi(e,'evm-preview');
export const POST:import('./$types').RequestHandler=e=>evmApi(e,'evm-preview');
export const PATCH:import('./$types').RequestHandler=e=>evmApi(e,'evm-preview');
export const DELETE:import('./$types').RequestHandler=e=>evmApi(e,'evm-preview');
