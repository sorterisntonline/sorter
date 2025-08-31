<script lang="ts">
	const { magnitude }: { magnitude: number } = $props();

	// Normalize magnitude from the range [-50, 50] to a percentage [0, 100].
	// This will determine the position of the slider's knob.
	const percentage = ((magnitude + 50) / 100) * 100;
</script>

<div
	class="relative flex h-5 w-full items-center"
	title={`Magnitude: ${magnitude > 0 ? '+' : ''}${magnitude}`}
>
	<!-- Gradient track representing the full spectrum of choice -->
	<div
		class="h-1.5 w-full rounded-full bg-gradient-to-r from-teal-500/50 via-zinc-500/50 to-blue-500/50"
	></div>

	<!-- Slider Knob, positioned based on the vote's magnitude -->
	<div
		class="absolute h-4 w-4 rounded-full border-2 border-zinc-900 shadow-md transition-all {magnitude < 0 ? 'bg-teal-400' : magnitude > 0 ? 'bg-blue-400' : 'bg-white'}"
		style="left: {percentage}%; top: 50%; transform: translate(-50%, -50%);"
	></div>
</div>
