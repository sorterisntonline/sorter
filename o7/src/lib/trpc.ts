import { createTRPCSvelte } from 'trpc-svelte-query';
import { httpBatchLink } from '@trpc/client';
import type { AppRouter } from '$lib/server/routes/_app';
import superjson from 'superjson';
import type { inferRouterOutputs, inferRouterInputs } from '@trpc/server';

export const transformer = superjson;

export const trpc = createTRPCSvelte<AppRouter>({
	links: [
		httpBatchLink({
			url: '/api/trpc',
			transformer,
		}),
	],
});

export type RouterOutput = inferRouterOutputs<AppRouter>;
export type RouterInput = inferRouterInputs<AppRouter>;
