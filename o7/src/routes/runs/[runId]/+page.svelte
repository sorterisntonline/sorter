<script lang="ts">
	import { page } from '$app/stores';
	import { trpc } from '$lib/trpc';

	// Get runId from the URL
	const runId = $page.params.runId;

	// This gets the detailed data pre-fetched on the server
	const detailsQuery = trpc.gitsorter.getRunDetails.query({
		runId: runId || '',
	});

	// Helper to format scores
	const formatScore = (score: number) => (score * 100).toFixed(2);
</script>

<main class="container mx-auto p-8">
	<a href="/runs" class="mb-6 block text-blue-400 hover:underline"
		>&larr; Back to all runs</a
	>

	{#if $detailsQuery.isLoading}
		<p class="text-zinc-400">Loading run details...</p>
	{:else if $detailsQuery.error}
		<p class="text-red-400">Error: {$detailsQuery.error.message}</p>
	{:else if $detailsQuery.data}
		{@const { run, ranking } = $detailsQuery.data}
		<h1 class="mb-2 text-4xl font-bold text-zinc-100">{run.title}</h1>
		<p class="mb-8 font-mono text-sm text-zinc-500">{run.pk}</p>

		<!-- Ranked Branches -->
		<h2 class="mb-4 text-2xl font-semibold text-zinc-200">Ranked Branches</h2>
		{#if ranking.sorted.length > 0}
			<div class="overflow-hidden rounded-lg bg-zinc-800 shadow-md">
				<table class="w-full text-left">
					<thead class="bg-zinc-700/50">
						<tr>
							<th class="w-16 p-3">Rank</th>
							<th class="p-3">Branch</th>
							<th class="p-3">Score</th>
							<th class="p-3">Commit SHA</th>
						</tr>
					</thead>
					<tbody>
						{#each ranking.sorted as item, i (item.identifier.pk)}
							<tr class="border-t border-zinc-700">
								<td class="p-3 text-center font-bold">{i + 1}</td>
								<td class="p-3 font-mono text-zinc-100"
									>{item.snapshot?.title}</td
								>
								<td class="p-3 font-mono text-blue-300"
									>{formatScore(item.score)}</td
								>
								<td class="p-3 font-mono text-zinc-400"
									>{typeof item.snapshot?.metadata?.commit_sha === 'string'
										? item.snapshot.metadata.commit_sha.substring(0, 10) + '...'
										: 'N/A'}</td
								>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<p class="italic text-zinc-400">No branches have been ranked yet.</p>
		{/if}

		<!-- Unranked Branches -->
		<h2 class="mb-4 mt-12 text-2xl font-semibold text-zinc-200">
			Unranked Branches
		</h2>
		{#if ranking.unsorted.length > 0}
			<ul class="list-inside list-disc rounded-lg bg-zinc-800 p-4">
				{#each ranking.unsorted as item (item.pk)}
					<li class="font-mono text-zinc-300">{item.snapshot?.title}</li>
				{/each}
			</ul>
		{:else}
			<p class="italic text-zinc-400">All branches are part of the ranking.</p>
		{/if}
	{/if}
</main>
