import { trpcServer } from '$lib/server/server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { runId } = event.params;
	// Pre-fetch the history data on the server
	await trpcServer.gitsorter.getRunReplay.ssr({ runId });
};
