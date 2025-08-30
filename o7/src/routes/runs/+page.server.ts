import { trpcServer } from '$lib/server/server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (_event) => {
	// Use our new tRPC procedure, pre-fetching the data on the server (SSR)
	await trpcServer.gitsorter.listRuns.ssr();
};
