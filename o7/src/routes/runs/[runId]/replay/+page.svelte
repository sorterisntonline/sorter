<script lang="ts">
	import { page } from '$app/stores';
	import { trpc } from '$lib/trpc';
	import { onMount, onDestroy } from 'svelte';
	import Chart from 'chart.js/auto';

	// Get runId from the URL and fetch data
	const runId = $page.params.runId;
	if (!runId) throw new Error('Run ID is required');
	const replayQuery = trpc.gitsorter.getRunReplay.query({ runId });

	// --- Svelte 5 State Management ---
	let currentStep = $state(0);
	let isPlaying = $state(false);
	let playbackSpeed = $state(1);
	// Keep these non-reactive to avoid UpdatedAtError feedback loops
	let chartInstance: Chart | null = null;
	let canvasElement: HTMLCanvasElement | null = null;

	// --- Derived state is clean in Svelte ---
	const history = $derived($replayQuery.data?.history ?? []);
	const items = $derived($replayQuery.data?.items ?? []);
	const maxSteps = $derived(history.length > 0 ? history.length - 1 : 0);
	const currentHistoryStep = $derived(history[currentStep]);

	// --- Chart Logic ---
	function createChart() {
		if (!canvasElement || chartInstance || items.length === 0) return;

		chartInstance = new Chart(canvasElement, {
			type: 'line',
			data: {
				labels: [],
				datasets: items.map((item: { pk: string }, i: number) => ({
					label: item.pk.split(':')[0], // Extract branch name
					data: [],
					borderColor: `hsl(${(i * 360) / items.length}, 70%, 50%)`,
					backgroundColor: `hsl(${(i * 360) / items.length}, 70%, 50%, 0.1)`,
					tension: 0.4,
					fill: false
				}))
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				interaction: {
					mode: 'index',
					intersect: false,
				},
				scales: {
					x: {
						display: true,
						title: {
							display: true,
							text: 'Vote Number'
						}
					},
					y: {
						display: true,
						title: {
							display: true,
							text: 'Ranking Score'
						},
						min: 0,
						max: 1
					}
				},
				plugins: {
					legend: {
						display: true,
						position: 'top'
					},
					tooltip: {
						callbacks: {
							label: function(context) {
								return `${context.dataset.label}: ${context.parsed.y.toFixed(4)}`;
							}
						}
					}
				}
			}
		});
	}

	// Create chart when canvas and items are ready (once)
	$effect.pre(() => {
		if (canvasElement && items.length > 0 && !chartInstance) {
			createChart();
		}
	});

	onMount(() => {
		// Destroy chart when component is removed
		return () => {
			if (chartInstance) {
				chartInstance.destroy();
				chartInstance = null;
			}
		};
	});

	function updateChart() {
		if (!chartInstance || !currentHistoryStep) return;

		chartInstance.data.labels = Array.from({length: currentStep + 1}, (_, i: number) => i + 1);

		items.forEach((item: { pk: string }, i: number) => {
			if (chartInstance) {
				const dataset = chartInstance.data.datasets[i];
				if (dataset) {
					dataset.data = history
						.slice(0, currentStep + 1)
						.map((step: any) => step.current_rankings.find((r: any) => r.identifier.pk === item.pk)?.score ?? null);
				}
			}
		});

		chartInstance.update('none'); // 'none' for no animation, making it snappier
	}

	// --- Reactive Effects for Logic ---
	$effect(() => {
		if (chartInstance && currentHistoryStep) {
			updateChart(); // Update chart whenever step changes
		}
	});

	$effect(() => { // Playback timer logic
		let timer: ReturnType<typeof setTimeout> | undefined;
		if (isPlaying && currentStep < maxSteps) {
			timer = setTimeout(() => {
				currentStep++;
			}, 1000 / playbackSpeed);
		}
		// Cleanup function
		return () => {
			if (timer) clearTimeout(timer);
		};
	});

	// --- Control Functions ---
	function togglePlayback() {
		isPlaying = !isPlaying;
	}

	function resetPlayback() {
		currentStep = 0;
		isPlaying = false;
	}

	function stepBackward() {
		if (currentStep > 0) {
			currentStep--;
			isPlaying = false;
		}
	}

	function stepForward() {
		if (currentStep < maxSteps) {
			currentStep++;
			isPlaying = false;
		}
	}

	function goToStart() {
		currentStep = 0;
		isPlaying = false;
	}

	function goToEnd() {
		currentStep = maxSteps;
		isPlaying = false;
	}

	// Format timestamp for display
	function formatTimestamp(timestamp: string) {
		return new Date(timestamp).toLocaleString();
	}
</script>

<main class="container mx-auto p-8 max-w-7xl">
	<!-- Header -->
	<div class="mb-6">
		<div class="flex items-center justify-between">
			<a href="/runs/{runId}" class="text-blue-600 hover:text-blue-800 inline-flex items-center gap-2">
				<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
				</svg>
				Back to Run Details
			</a>
			<div class="text-sm text-gray-500">
				Interactive ranking evolution visualization
			</div>
		</div>
		<h1 class="text-3xl font-bold mt-4">Ranking History Replay</h1>
		<p class="text-gray-600 mt-2">Watch how the rankings evolved vote by vote in real-time</p>
	</div>

	{#if $replayQuery.isLoading}
		<div class="flex items-center justify-center h-64">
			<div class="text-center">
				<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
				<p>Loading replay data...</p>
			</div>
		</div>
	{:else if $replayQuery.error}
		<div class="bg-red-50 border border-red-200 rounded-lg p-4">
			<h3 class="text-red-800 font-semibold">Error loading replay data</h3>
			<p class="text-red-600 mt-2">{$replayQuery.error.message}</p>
		</div>
	{:else if $replayQuery.data}
		<!-- Debug info -->
		<div class="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded text-sm">
			<strong>Debug:</strong> Items: {items.length}, History: {history.length}, Current Step: {currentStep}
			{#if items.length > 0}
				<br>Sample item: {JSON.stringify(items[0])}
			{/if}
			{#if currentHistoryStep}
				<br>Current rankings: {currentHistoryStep.current_rankings.length}
			{/if}
		</div>
		<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
			<!-- Chart Section -->
			<div class="lg:col-span-2">
				<div class="bg-white rounded-lg shadow-lg p-6">
					<div class="h-[500px] mb-4">
						<canvas bind:this={canvasElement}></canvas>
					</div>

					<!-- CONTROLS -->
					<div class="flex flex-wrap items-center justify-center gap-4 p-4 bg-gray-50 rounded-lg">
						<!-- Navigation Buttons -->
						<div class="flex items-center gap-2">
							<button
								onclick={goToStart}
								class="p-2 text-gray-600 hover:text-gray-800 disabled:opacity-50"
								disabled={currentStep === 0}
								title="Go to start"
								aria-label="Go to start"
							>
								<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"></path>
								</svg>
							</button>

							<button
								onclick={stepBackward}
								class="p-2 text-gray-600 hover:text-gray-800 disabled:opacity-50"
								disabled={currentStep === 0}
								title="Step backward"
								aria-label="Step backward"
							>
								<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
								</svg>
							</button>

							<button
								onclick={togglePlayback}
								class="p-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50"
								title={isPlaying ? 'Pause' : 'Play'}
								aria-label={isPlaying ? 'Pause' : 'Play'}
							>
								{#if isPlaying}
									<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6"></path>
									</svg>
								{:else}
									<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1.586a1 1 0 01.707.293l.707.707A1 1 0 0012.414 11H15m-3 7.5A9.5 9.5 0 1121.5 12 9.5 9.5 0 0112 2.5z"></path>
									</svg>
								{/if}
							</button>

							<button
								onclick={stepForward}
								class="p-2 text-gray-600 hover:text-gray-800 disabled:opacity-50"
								disabled={currentStep >= maxSteps}
								title="Step forward"
								aria-label="Step forward"
							>
								<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
								</svg>
							</button>

							<button
								onclick={goToEnd}
								class="p-2 text-gray-600 hover:text-gray-800 disabled:opacity-50"
								disabled={currentStep >= maxSteps}
								title="Go to end"
								aria-label="Go to end"
							>
								<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"></path>
								</svg>
							</button>
						</div>

						<!-- Progress Bar -->
						<div class="flex-1 max-w-xs mx-4">
							<input
								type="range"
								bind:value={currentStep}
								min="0"
								max={maxSteps}
								class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
							/>
						</div>

						<!-- Step Counter -->
						<div class="text-sm text-gray-600 font-medium min-w-[80px] text-center">
							{currentStep} / {maxSteps}
						</div>

						<!-- Speed Control -->
						<div class="flex items-center gap-2">
							<label for="speed" class="text-sm text-gray-600">Speed:</label>
							<select
								id="speed"
								bind:value={playbackSpeed}
								class="text-sm border border-gray-300 rounded px-2 py-1"
							>
								<option value={0.25}>0.25x</option>
								<option value={0.5}>0.5x</option>
								<option value={1}>1x</option>
								<option value={2}>2x</option>
								<option value={4}>4x</option>
							</select>
						</div>

						<!-- Reset Button -->
						<button
							onclick={resetPlayback}
							class="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
							title="Reset to beginning"
						>
							Reset
						</button>
					</div>
				</div>
			</div>

			<!-- Rankings Sidebar -->
			<div class="lg:col-span-1">
				<div class="bg-white rounded-lg shadow-lg p-6 sticky top-6">
					{#if currentHistoryStep}
						<!-- Current Vote Info -->
						{#if currentHistoryStep.vote_added}
							<div class="mb-6 p-4 bg-blue-50 rounded-lg">
								<h3 class="font-semibold text-blue-800 mb-2">Latest Vote</h3>
								<div class="text-sm text-blue-700">
									<p><strong>{currentHistoryStep.vote_added.left_entity_pk.split(':')[0]}</strong></p>
									<p class="text-center my-1">
										{#if currentHistoryStep.vote_added.magnitude > 0}
											<span class="text-green-600">↑</span>
											<strong class="mx-2">beats</strong>
											<span class="text-red-600">↓</span>
										{:else}
											<span class="text-red-600">↓</span>
											<strong class="mx-2">loses to</strong>
											<span class="text-green-600">↑</span>
										{/if}
									</p>
									<p><strong>{currentHistoryStep.vote_added.right_entity_pk.split(':')[0]}</strong></p>
									{#if currentHistoryStep.vote_added.rationale}
										<p class="mt-2 italic">"{currentHistoryStep.vote_added.rationale}"</p>
									{/if}
									<p class="mt-2 text-xs opacity-75">
										{formatTimestamp(currentHistoryStep.vote_added.created_at)}
									</p>
								</div>
							</div>
						{/if}

						<!-- Current Rankings -->
						<div class="mb-6">
							<h3 class="font-semibold text-gray-800 mb-3">Current Rankings</h3>
							<div class="space-y-2 max-h-80 overflow-y-auto">
								{#each currentHistoryStep.current_rankings.sort((a: any, b: any) => b.score - a.score) as ranking, i}
									<div class="flex items-center justify-between p-2 bg-gray-50 rounded">
										<div class="flex items-center gap-2">
											<span class="font-mono text-sm text-gray-500 w-6">{i + 1}.</span>
											<span class="font-medium">{ranking.identifier.pk.split(':')[0]}</span>
										</div>
										<span class="text-sm font-mono text-gray-600">
											{ranking.score.toFixed(4)}
										</span>
									</div>
								{/each}
							</div>
						</div>

						<!-- Unsorted Items -->
						{#if currentHistoryStep.unsorted_items.length > 0}
							<div>
								<h3 class="font-semibold text-gray-800 mb-3">Unsorted Items</h3>
								<div class="space-y-1">
									{#each currentHistoryStep.unsorted_items as item}
										<div class="flex items-center gap-2 p-2 bg-gray-100 rounded">
											<span class="w-2 h-2 bg-gray-400 rounded-full"></span>
											<span class="text-sm">{item.pk.split(':')[0]}</span>
										</div>
									{/each}
								</div>
							</div>
						{/if}
					{:else}
						<div class="text-center text-gray-500 py-8">
							<p>No voting data available yet.</p>
							<p class="text-sm mt-2">Start voting to see the ranking evolution!</p>
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</main>

<style>
	/* Custom styles for the range slider */
	input[type="range"] {
		-webkit-appearance: none;
		appearance: none;
		background: transparent;
		cursor: pointer;
	}

	input[type="range"]::-webkit-slider-track {
		background: #e2e8f0;
		height: 8px;
		border-radius: 4px;
	}

	input[type="range"]::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		height: 20px;
		width: 20px;
		border-radius: 50%;
		background: #2563eb;
		cursor: pointer;
		border: 2px solid #ffffff;
		box-shadow: 0 0 2px rgba(0,0,0,0.3);
	}

	input[type="range"]::-moz-range-track {
		background: #e2e8f0;
		height: 8px;
		border-radius: 4px;
		border: none;
	}

	input[type="range"]::-moz-range-thumb {
		height: 20px;
		width: 20px;
		border-radius: 50%;
		background: #2563eb;
		cursor: pointer;
		border: 2px solid #ffffff;
		box-shadow: 0 0 2px rgba(0,0,0,0.3);
	}
</style>
