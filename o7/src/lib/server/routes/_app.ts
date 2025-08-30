import { router, publicProcedure, authedProcedure } from '../trpc';
import { z } from 'zod';
import { RUST_SORTER_API_URL, RUST_SORTER_API_KEY } from '$env/static/private';

// Type definitions matching the Rust API structures
interface Entity {
	user_id: string;
	pk_namespace: string;
	pk: string;
	title?: string;
	profile_picture_url?: string;
	metadata?: Record<string, unknown>;
	created_at?: string;
}

interface EntityIdentifier {
	pk_namespace: string;
	pk: string;
}

interface RankedEntity {
	identifier: EntityIdentifier;
	score: number;
}

interface RankingResponse {
	sorted: RankedEntity[];
	unsorted: EntityIdentifier[];
}

interface EntityWithChildren {
	entity: Entity & { children?: Entity[] };
	children?: Entity[];
}

// Helper function to make authenticated requests to the Rust API
async function fetchSorterAPI<T = unknown>(
	endpoint: string,
	options: RequestInit = {},
): Promise<T> {
	const url = `${RUST_SORTER_API_URL}${endpoint}`;
	const response = await fetch(url, {
		...options,
		headers: {
			...options.headers,
			Authorization: `Bearer ${RUST_SORTER_API_KEY}`,
			'Content-Type': 'application/json',
		},
	});
	if (!response.ok) {
		const errorText = await response.text();
		console.error(`Sorter API Error: ${response.status} ${errorText}`);
		throw new Error(`Failed to fetch from Sorter API: ${endpoint}`);
	}
	return response.json();
}

// --- Define the Gitsorter Router ---
export const gitsorterRouter = router({
	listRuns: publicProcedure.query(async () => {
		// 1. Fetch ALL entities from the rustsorter API
		const allEntities: Entity[] = await fetchSorterAPI('/entity');

		// 2. Filter in the BFF to find only the gitsort runs
		const runs = allEntities.filter((e) => e.pk_namespace === 'gitsort.run');
		return runs;
	}),

	getRunDetails: publicProcedure
		.input(z.object({ runId: z.string() }))
		.query(async ({ input }) => {
			// 1. Fetch the run and all its children (snapshots, lens) in one go
			const runData: EntityWithChildren = await fetchSorterAPI(
				`/entity/gitsort.run/${input.runId}?children=true`,
			);
			const runEntity = runData.entity;
			const children = runEntity.children || [];

			// 2. Separate snapshots from other children (like the lens)
			const snapshots = children.filter(
				(c: Entity) => c.pk_namespace === 'gitsort.branch_snapshot',
			);

			if (snapshots.length === 0) {
				return { run: runEntity, ranking: { sorted: [], unsorted: [] } };
			}

			// 3. Prepare the payload for the /rank endpoint
			const rankPayload = snapshots.map((s: Entity) => ({
				pk_namespace: s.pk_namespace,
				pk: s.pk,
			}));

			// 4. Call the /rank endpoint to get the latest ranking
			const ranking: RankingResponse = await fetchSorterAPI('/rank', {
				method: 'POST',
				body: JSON.stringify(rankPayload),
			});

			// 5. Enrich the ranking data with full snapshot details for the UI
			const snapshotMap = new Map(snapshots.map((s: Entity) => [s.pk, s]));

			const enrichedRanking = {
				sorted: ranking.sorted.map((item) => ({
					...item,
					snapshot: snapshotMap.get(item.identifier.pk) as Entity | undefined,
				})),
				unsorted: ranking.unsorted.map((item) => ({
					...item,
					snapshot: snapshotMap.get(item.pk) as Entity | undefined,
				})),
			};

			// 6. Return everything the UI will need
			return {
				run: runEntity,
				ranking: enrichedRanking,
			};
		}),
});

// --- Update the Main App Router ---
export const appRouter = router({
	greeting: publicProcedure
		.input(
			z.object({
				name: z.string().optional(),
			}),
		)
		.query(({ input }) => {
			return `Welcome to ${input.name ?? 'the world'}!`;
		}),
	me: publicProcedure.query(({ ctx }) => {
		return ctx.user;
	}),
	secret: authedProcedure.query(({ ctx }) => {
		// This is a protected route
		return `Hello, ${ctx.user.username}!`;
	}),

	// Add the new router here
	gitsorter: gitsorterRouter,
});

export type AppRouter = typeof appRouter;
