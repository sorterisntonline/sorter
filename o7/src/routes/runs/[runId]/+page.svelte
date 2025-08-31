<script lang="ts">
	import { page } from '$app/stores';
	import { trpc } from '$lib/trpc';

	// Get runId from the URL
	const runId = $page.params.runId;

	// This gets the detailed data pre-fetched on the server
	const detailsQuery = trpc.gitsorter.getRunDetails.query({
		runId: runId || '',
	});

	// NEW: State for selected entities (up to 2 entities can be selected)
	let selectedIdentifiers = $state([] as Array<{ pk_namespace: string; pk: string }>);

	// NEW: Reactive query that runs when selectedIdentifiers changes
	let votesQuery = $derived.by(() => {
		if (selectedIdentifiers.length > 0 && selectedIdentifiers.length <= 2) {
			return trpc.gitsorter.getVotes.query(selectedIdentifiers);
		}
		return null;
	});

	// NEW: Click handling — single click selects only that entry; Shift+Click adds a second for pair filter
	function handleRowClick(event: MouseEvent, identifier: { pk_namespace: string; pk: string }) {
		if (event.shiftKey) {
			if (selectedIdentifiers.length === 0) {
				selectedIdentifiers = [identifier];
				return;
			}

			const first = selectedIdentifiers[0];
			if (selectedIdentifiers.length === 1) {
				if (first && !(first.pk === identifier.pk && first.pk_namespace === identifier.pk_namespace)) {
					selectedIdentifiers = [first, identifier];
					return;
				}
			}

			// If already have two or Shift+Click same as first, set pair with first + current
			if (first) {
				selectedIdentifiers = [first, identifier];
			} else {
				selectedIdentifiers = [identifier];
			}
			return;
		}

		// Regular click: select only this entry
		selectedIdentifiers = [identifier];
	}

	// NEW: Helper function to check if an entity is selected
	function isSelected(identifier: { pk_namespace: string; pk: string }): boolean {
		return selectedIdentifiers.some(
			(i) => i.pk === identifier.pk && i.pk_namespace === identifier.pk_namespace
		);
	}

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
		{@const { run, ranking, lens } = $detailsQuery.data}
		<h1 class="mb-2 text-4xl font-bold text-zinc-100">{run.title}</h1>
		<p class="mb-8 font-mono text-sm text-zinc-500">{run.pk}</p>

		<!-- Run Information Section -->
		<section class="mb-12 rounded-lg bg-zinc-800 p-6 shadow-lg">
			<h2 class="mb-4 border-b border-zinc-700 pb-2 text-xl font-semibold">
				Run Information
			</h2>
			<div class="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-3">
				<!-- Column 1 -->
				<div>
					<div class="text-sm text-zinc-400">Created At</div>
					<div class="font-mono text-zinc-100">
						{run.created_at ? new Date(run.created_at).toLocaleString() : 'N/A'}
					</div>
				</div>

				<!-- Column 2 -->
				<div>
					<div class="text-sm text-zinc-400">Lens Used</div>
					<div class="font-mono text-zinc-100">
						{#if lens}
							{lens.title || lens.pk}
						{:else}
							<span class="italic text-zinc-500">Default Lens</span>
						{/if}
					</div>
				</div>

				<!-- Column 3 -->
				<div>
					<div class="text-sm text-zinc-400">AI Model</div>
					<div class="font-mono text-zinc-100">
						{#if run.metadata?.model}
							{run.metadata.model}
						{:else}
							<span class="italic text-zinc-500">Not Specified</span>
						{/if}
					</div>
				</div>

				<!-- Optional: Show original branches from config -->
				{#if run.metadata?.branches && Array.isArray(run.metadata.branches)}
				<div class="sm:col-span-3">
					<div class="text-sm text-zinc-400">Branches in Run</div>
					<div class="font-mono text-zinc-100">
						{run.metadata.branches.join(', ')}
					</div>
				</div>
				{/if}
			</div>
		</section>

		<!-- Vote Inspector Section -->
		{#if selectedIdentifiers.length > 0}
			<section class="mb-12 rounded-lg bg-zinc-800 p-4">
				<h2 class="mb-4 text-xl font-semibold">
					{#if selectedIdentifiers.length === 1}
						Votes involving "{selectedIdentifiers[0]?.pk?.split(':')[0] || 'Unknown'}"
					{:else}
						Vote between "{selectedIdentifiers[0]?.pk?.split(':')[0] || 'Unknown'}" and "{selectedIdentifiers[1]?.pk?.split(':')[0] || 'Unknown'}"
					{/if}
				</h2>
				{#if !votesQuery || !$votesQuery}
					<p class="text-zinc-400">Select entities to view votes.</p>
				{:else if $votesQuery.isLoading}
					<p>Loading votes...</p>
				{:else if $votesQuery.error}
					<p class="text-red-400">Error loading votes: {$votesQuery.error.message}</p>
				{:else if $votesQuery.data && $votesQuery.data.length > 0}
					<div class="space-y-2">
						{#each $votesQuery.data as vote}
							<div class="border-b border-zinc-700 p-2">
								<div class="flex items-center justify-between">
									<div class="flex-1">
										<span class="font-mono text-sm text-zinc-300">
											{vote.left_entity_pk_namespace}:{vote.left_entity_pk.split(':')[0]}
										</span>
										<span class="mx-2 text-zinc-500">vs</span>
										<span class="font-mono text-sm text-zinc-300">
											{vote.right_entity_pk_namespace}:{vote.right_entity_pk.split(':')[0]}
										</span>
									</div>
									<div class="flex items-center gap-2">
										<span class="text-sm text-zinc-400">
											Magnitude: {vote.magnitude > 0 ? '+' : ''}{vote.magnitude}
										</span>
										<span class="text-xs text-zinc-500">
											{new Date(vote.created_at).toLocaleDateString()}
										</span>
									</div>
								</div>

								<!-- ADD THIS BLOCK to display the rationale -->
								{#if vote.rationale}
									<div class="mt-2 rounded bg-zinc-900/50 p-2">
										<p class="text-sm italic text-zinc-400">
											&ldquo;{vote.rationale}&rdquo;
										</p>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{:else}
					<p class="text-zinc-400">No votes found for the selected entities.</p>
				{/if}
			</section>
		{/if}

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
							<tr
								class="cursor-pointer border-t border-zinc-700 transition-colors hover:bg-zinc-700/30 {isSelected(item.identifier) ? 'bg-blue-900/50' : ''}"
								onclick={(e) => handleRowClick(e, item.identifier)}
							>
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
