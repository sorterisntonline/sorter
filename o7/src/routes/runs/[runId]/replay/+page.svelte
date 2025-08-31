<script lang="ts">
	import { page } from '$app/stores';
	import { trpc } from '$lib/trpc';
	import { Line } from 'svelte5-chartjs';
	import {
		Chart as ChartJS,
		Title,
		Tooltip,
		Legend,
		LineElement,
		LinearScale,
		PointElement,
		CategoryScale
	} from 'chart.js';

	// Register Chart.js components
	ChartJS.register(Title, Tooltip, Legend, LineElement, LinearScale, PointElement, CategoryScale);

	// Get runId from the URL and fetch data
	const runId = $page.params.runId;
	if (!runId) throw new Error('Run ID is required');
	const replayQuery = trpc.gitsorter.getRunReplay.query({ runId });

	// --- Svelte 5 State Management ---
	let currentStep = $state(0);
	let isPlaying = $state(false);
	let playbackSpeed = $state(1);
	let transformType = $state('log'); // 'linear', 'log', 'sqrt', 'rank'
	let logAlpha = $state(9); // Controls log compression strength

	// --- Derived state is clean in Svelte ---
	const history = $derived($replayQuery.data?.history ?? []);
	const items = $derived($replayQuery.data?.items ?? []);
	const maxSteps = $derived(history.length > 0 ? history.length - 1 : 0);
	const currentHistoryStep = $derived(history[currentStep]);

	// --- Transform Functions ---
	const transformScore = (score: number | null, allScores: (number | null)[]): number | null => {
		if (score === null) return null;
		if (score === 0) return 0;
		
		switch (transformType) {
			case 'linear':
				return score;
			
			case 'log':
				// Normalized log transform: compresses high end
				return Math.log1p(logAlpha * score) / Math.log1p(logAlpha);
			
			case 'sqrt':
				// Square root: gentler compression than log
				return Math.sqrt(score);
			
			case 'rank':
				// Convert to rank-based: equal spacing regardless of score gaps
				const validScores = allScores.filter(s => s !== null && s > 0) as number[];
				if (validScores.length === 0) return 0;
				
				const sortedUnique = [...new Set(validScores)].sort((a, b) => b - a);
				const rank = sortedUnique.indexOf(score);
				if (rank === -1) return 0;
				
				// Convert rank to 0..1 scale (highest rank = 1, lowest = small positive)
				return rank === sortedUnique.length - 1 ? 0.05 : (sortedUnique.length - rank) / sortedUnique.length;
			
			default:
				return score;
		}
	};


	// --- Chart Data (reactive with svelte-chartjs) ---
	let chartData = $state({
		labels: [] as number[],
		datasets: [] as {
			label: string;
			data: (number | null)[];
			borderColor: string;
			backgroundColor: string;
			tension: number;
			fill: boolean;
		}[]
	});

	$effect(() => {
		if (items.length === 0) {
			chartData = { labels: [], datasets: [] };
			return;
		}

		const labels = Array.from({length: currentStep + 1}, (_, i) => i + 1);

		const datasets = items.map((item: { pk: string }, i: number) => ({
			label: item.pk.split(':')[0] || 'Unknown', // Extract branch name
			data: history
				.slice(0, currentStep + 1)
				.map((step: any) => {
					const score = step.current_rankings.find((r: any) => r.identifier.pk === item.pk)?.score ?? null;
					// Get all scores from this step for rank-based transforms
					const allScores = step.current_rankings.map((r: any) => r.score);
					return transformScore(score, allScores);
				}),
			borderColor: `hsl(${(i * 360) / items.length}, 70%, 50%)`,
			backgroundColor: `hsl(${(i * 360) / items.length}, 70%, 50%, 0.1)`,
			tension: 0.4,
			fill: false
		}));

		chartData = { labels, datasets };
	});

	const chartOptions = $derived({
		responsive: true,
		maintainAspectRatio: false,
		animation: {
			duration: 0 // Disable initial animation
		},
		interaction: {
			mode: 'index' as const,
			intersect: false,
		},
		scales: {
			x: {
				display: true,
				title: {
					display: true,
					text: 'Vote Number',
					color: '#d1d5db'
				},
				ticks: {
					color: '#9ca3af'
				},
				grid: {
					color: '#374151'
				}
			},
			y: {
				display: true,
				title: {
					display: true,
					text: transformType === 'linear' ? 'Ranking Score' : 
						  transformType === 'log' ? 'Ranking Score (Log Scale)' :
						  transformType === 'sqrt' ? 'Ranking Score (√ Scale)' :
						  'Ranking Position',
					color: '#d1d5db'
				},
				min: 0,
				max: 1,
				ticks: {
					color: '#9ca3af'
				},
				grid: {
					color: '#374151'
				}
			}
		},
		plugins: {
			legend: {
				display: true,
				position: 'top' as const,
				labels: {
					color: '#d1d5db'
				}
			},
			tooltip: {
				callbacks: {
					label: function(context: any) {
						// Find the original score from the history data
						const stepIndex = context.dataIndex;
						const item = items.find(item => item.pk.split(':')[0] === context.dataset.label);
						if (item && stepIndex >= 0 && stepIndex < history.length) {
							const step = history[stepIndex];
							if (step && step.current_rankings) {
								const originalScore = step.current_rankings.find((r: any) => r.identifier.pk === item.pk)?.score ?? 0;
								const allScores = step.current_rankings.map((r: any) => r.score);
								
								if (transformType === 'linear') {
									return `${context.dataset.label}: ${originalScore.toFixed(4)}`;
								} else {
									const transformedScore = transformScore(originalScore, allScores);
									const transformLabel = transformType === 'log' ? 'log' : 
														  transformType === 'sqrt' ? '√' : 'rank';
									return `${context.dataset.label}: ${originalScore.toFixed(4)} (${transformLabel}: ${transformedScore?.toFixed(4)})`;
								}
							}
						}
						return `${context.dataset.label}: ${context.parsed.y.toFixed(4)}`;
					}
				}
			}
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
			<a href="/runs/{runId}" class="text-blue-400 hover:text-blue-300 inline-flex items-center gap-2">
				<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
				</svg>
				Back to Run Details
			</a>
			<div class="text-sm text-gray-400">
				Interactive ranking evolution visualization
			</div>
		</div>
		<h1 class="text-3xl font-bold mt-4 text-white">Ranking History Replay</h1>
		<p class="text-gray-400 mt-2">Watch how the rankings evolved vote by vote in real-time</p>
	</div>

	{#if $replayQuery.isLoading}
		<div class="flex items-center justify-center h-64">
			<div class="text-center">
				<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
				<p class="text-gray-300">Loading replay data...</p>
			</div>
		</div>
	{:else if $replayQuery.error}
		<div class="bg-red-900/20 border border-red-800 rounded-lg p-4">
			<h3 class="text-red-400 font-semibold">Error loading replay data</h3>
			<p class="text-red-300 mt-2">{$replayQuery.error.message}</p>
		</div>
	{:else if $replayQuery.data}
		<!-- Debug info -->
		<div class="mb-4 p-4 bg-yellow-900/20 border border-yellow-800 rounded text-sm text-gray-300">
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
				<div class="bg-gray-800 rounded-lg shadow-lg p-6 border border-gray-700">
					<div class="h-[500px] mb-4">
						<Line
							data={chartData}
							options={chartOptions}
							width={null}
							height={null}
						/>
					</div>

					<!-- CHART CONTROLS -->
					<div class="mb-4 p-3 bg-gray-700 rounded-lg border border-gray-600">
						<div class="flex flex-wrap items-center gap-4">
							<!-- Transform Type Selection -->
							<div class="flex items-center gap-2">
								<label for="transform" class="text-sm text-gray-300">Scale:</label>
								<select
									id="transform"
									bind:value={transformType}
									class="text-sm border border-gray-600 bg-gray-800 text-gray-200 rounded px-2 py-1"
								>
									<option value="linear">Linear</option>
									<option value="log">Logarithmic</option>
									<option value="sqrt">Square Root</option>
									<option value="rank">Rank-Based</option>
								</select>
							</div>

							<!-- Alpha Control (only show when log scale is enabled) -->
							{#if transformType === 'log'}
								<div class="flex items-center gap-2">
									<label for="alpha" class="text-sm text-gray-300">Compression:</label>
									<input
										id="alpha"
										type="range"
										bind:value={logAlpha}
										min="1"
										max="1000"
										step="1"
										class="w-20 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
									/>
									<span class="text-xs text-gray-400 w-10">{logAlpha}</span>
								</div>
							{/if}
						</div>
					</div>

					<!-- PLAYBACK CONTROLS -->
					<div class="flex flex-wrap items-center justify-center gap-4 p-4 bg-gray-700 rounded-lg border border-gray-600">
						<!-- Navigation Buttons -->
						<div class="flex items-center gap-2">
							<button
								onclick={goToStart}
								class="p-2 text-gray-400 hover:text-gray-200 disabled:opacity-50"
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
								class="p-2 text-gray-400 hover:text-gray-200 disabled:opacity-50"
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
								class="p-3 bg-blue-500 text-white rounded-full hover:bg-blue-400 disabled:opacity-50"
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
								class="p-2 text-gray-400 hover:text-gray-200 disabled:opacity-50"
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
								class="p-2 text-gray-400 hover:text-gray-200 disabled:opacity-50"
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
								class="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
							/>
						</div>

						<!-- Step Counter -->
						<div class="text-sm text-gray-300 font-medium min-w-[80px] text-center">
							{currentStep} / {maxSteps}
						</div>

						<!-- Speed Control -->
						<div class="flex items-center gap-2">
							<label for="speed" class="text-sm text-gray-300">Speed:</label>
							<select
								id="speed"
								bind:value={playbackSpeed}
								class="text-sm border border-gray-600 bg-gray-800 text-gray-200 rounded px-2 py-1"
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
							class="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-500"
							title="Reset to beginning"
						>
							Reset
						</button>
					</div>
				</div>
			</div>

			<!-- Rankings Sidebar -->
			<div class="lg:col-span-1">
				<div class="bg-gray-800 rounded-lg shadow-lg p-6 sticky top-6 border border-gray-700">
					{#if currentHistoryStep}
						<!-- Current Vote Info -->
						{#if currentHistoryStep.vote_added}
							<div class="mb-6 p-4 bg-blue-900/20 rounded-lg border border-blue-800">
								<h3 class="font-semibold text-blue-400 mb-2">Latest Vote</h3>
								<div class="text-sm text-blue-300">
									<p><strong>{currentHistoryStep.vote_added.left_entity_pk.split(':')[0]}</strong></p>
									<p class="text-center my-1">
										{#if currentHistoryStep.vote_added.magnitude > 0}
											<span class="text-green-400">↑</span>
											<strong class="mx-2 text-gray-200">beats</strong>
											<span class="text-red-400">↓</span>
										{:else}
											<span class="text-red-400">↓</span>
											<strong class="mx-2 text-gray-200">loses to</strong>
											<span class="text-green-400">↑</span>
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
							<h3 class="font-semibold text-gray-200 mb-3">Current Rankings</h3>
							<div class="space-y-2 max-h-80 overflow-y-auto">
								{#each currentHistoryStep.current_rankings.sort((a: any, b: any) => b.score - a.score) as ranking, i}
									<div class="flex items-center justify-between p-2 bg-gray-700 rounded border border-gray-600">
										<div class="flex items-center gap-2">
											<span class="font-mono text-sm text-gray-400 w-6">{i + 1}.</span>
											<span class="font-medium text-gray-200">{ranking.identifier.pk.split(':')[0]}</span>
										</div>
										<span class="text-sm font-mono text-gray-300">
											{ranking.score.toFixed(4)}
										</span>
									</div>
								{/each}
							</div>
						</div>

						<!-- Unsorted Items -->
						{#if currentHistoryStep.unsorted_items.length > 0}
							<div>
								<h3 class="font-semibold text-gray-200 mb-3">Unsorted Items</h3>
								<div class="space-y-1">
									{#each currentHistoryStep.unsorted_items as item}
										<div class="flex items-center gap-2 p-2 bg-gray-700 rounded border border-gray-600">
											<span class="w-2 h-2 bg-gray-500 rounded-full"></span>
											<span class="text-sm text-gray-300">{item.pk.split(':')[0]}</span>
										</div>
									{/each}
								</div>
							</div>
						{/if}
					{:else}
						<div class="text-center text-gray-400 py-8">
							<p class="text-gray-300">No voting data available yet.</p>
							<p class="text-sm mt-2 text-gray-400">Start voting to see the ranking evolution!</p>
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
		background: #4b5563;
		height: 8px;
		border-radius: 4px;
	}

	input[type="range"]::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		height: 20px;
		width: 20px;
		border-radius: 50%;
		background: #3b82f6;
		cursor: pointer;
		border: 2px solid #1f2937;
		box-shadow: 0 0 2px rgba(255,255,255,0.3);
	}

	input[type="range"]::-moz-range-track {
		background: #4b5563;
		height: 8px;
		border-radius: 4px;
		border: none;
	}

	input[type="range"]::-moz-range-thumb {
		height: 20px;
		width: 20px;
		border-radius: 50%;
		background: #3b82f6;
		cursor: pointer;
		border: 2px solid #1f2937;
		box-shadow: 0 0 2px rgba(255,255,255,0.3);
	}
</style>
