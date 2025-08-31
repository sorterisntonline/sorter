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

interface EntityWithParentsAndChildren {
	entity: Entity;
	parents?: Entity[];
	children?: Entity[];
}

interface Vote {
	left_entity_pk_namespace: string;
	left_entity_pk: string;
	right_entity_pk_namespace: string;
	right_entity_pk: string;
	user_id: string;
	magnitude: number;
	rationale?: string;
	attribute_id: number;
	created_at: string;
	deleted_at?: string;
}

interface HistoryStep {
	vote_added: Vote;
	current_rankings: RankedEntity[];
	unsorted_items: EntityIdentifier[];
}

interface ReplayResponse {
	items: EntityIdentifier[];
	history: HistoryStep[];
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
			const runData: EntityWithParentsAndChildren = await fetchSorterAPI(
				`/entity/gitsort.run/${input.runId}?children=true`,
			);
			const runEntity = runData.entity;
			const children = runData.children || [];

			// 2. Separate snapshots and the lens from other children
			const snapshots = children.filter(
				(c: Entity) => c.pk_namespace === 'gitsort.branch_snapshot',
			);
			const lens = children.find(
				(c: Entity) => c.pk_namespace === 'gitsort.lens',
			);

			if (snapshots.length === 0) {
				// We still want to show run info even if there are no snapshots yet
				return { run: runEntity, lens, ranking: { sorted: [], unsorted: [] } };
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
				lens,
				ranking: enrichedRanking,
			};
		}),

	getVotes: publicProcedure.input(
		z.array(
			z.object({
				pk_namespace: z.string(),
				pk: z.string(),
			}),
		)
		.min(1)
		.max(2),
	)
		.query(async ({ input }) => {
			// Build tagged union payload
			const payload =
				input.length === 1
					? { kind: 'Single', entity: input[0] }
					: { kind: 'Pair', entities: [input[0], input[1]] };

			const votes: Vote[] = await fetchSorterAPI('/vote/filtered', {
				method: 'POST',
				body: JSON.stringify(payload),
			});
			return votes;
		}),

	getRunReplay: publicProcedure
		.input(z.object({ runId: z.string() }))
		.query(async ({ input }) => {
			// Simply proxy the call to the Rust backend
			const replayData: ReplayResponse = await fetchSorterAPI(
				`/run/${input.runId}/history`
			);

			return replayData;
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
