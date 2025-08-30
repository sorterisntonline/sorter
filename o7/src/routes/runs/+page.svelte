<script lang="ts">
	import { trpc } from '$lib/trpc';
	import { ChevronRight } from 'lucide-svelte'; // For a nice icon

	// This gets the data pre-fetched by +page.server.ts
	const runsQuery = trpc.gitsorter.listRuns.query();
</script>

<main class="container mx-auto p-8">
	<h1 class="mb-6 text-4xl font-bold text-zinc-100">Gitsorter Runs</h1>

	{#if $runsQuery.isLoading}
		<p class="text-zinc-400">Loading runs...</p>
	{:else if $runsQuery.error}
		<p class="text-red-400">Error: {$runsQuery.error.message}</p>
	{:else if $runsQuery.data && $runsQuery.data.length > 0}
		<div class="divide-y divide-zinc-700 rounded-lg bg-zinc-800 shadow-md">
			{#each $runsQuery.data as run (run.pk)}
				<a
					href={`/runs/${run.pk}`}
					class="flex items-center justify-between p-4 transition-colors hover:bg-zinc-700/50"
				>
					<div>
						<h2 class="text-lg font-semibold text-zinc-100">{run.title}</h2>
						<p class="text-sm text-zinc-400">
							ID: {run.pk} &bull; Created: {run.created_at
								? new Date(run.created_at).toLocaleString()
								: 'Unknown'}
						</p>
					</div>
					<ChevronRight class="text-zinc-500" />
				</a>
			{/each}
		</div>
	{:else}
		<p class="text-zinc-400">
			No sorting runs found. Use the CLI to start one!
		</p>
	{/if}
</main>

<style>
	a {
		text-decoration: none;
	}
</style>
