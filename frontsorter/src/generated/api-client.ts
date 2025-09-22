import { makeApi, Zodios, type ZodiosOptions } from "@zodios/core";
import { z } from "zod";

const Entity = z
  .object({
    pk: z.string(),
    pk_namespace: z.string(),
    title: z.string().nullish(),
    description: z.string().nullish(),
    profile_picture_url: z.string().nullish(),
    metadata: z.object({}).partial().passthrough().nullish(),
    created_at: z.string().datetime({ offset: true }),
    updated_at: z.string().datetime({ offset: true }),
  })
  .passthrough();
const CreateEntityData = z
  .object({
    pk_namespace: z.string(),
    pk: z.string().nullish(),
    title: z.string().nullish(),
    description: z.string().nullish(),
    profile_picture_url: z.string().nullish(),
    metadata: z.object({}).partial().passthrough().nullish(),
  })
  .passthrough();
const VoteData = z
  .object({
    left_ns: z.string(),
    left_pk: z.string(),
    right_ns: z.string(),
    right_pk: z.string(),
    attribute_id: z.number().int().optional().default(1),
    magnitude: z.number(),
  })
  .passthrough();
const VoteResponse = z
  .object({ status: z.string(), message: z.string().nullish() })
  .passthrough();

export const schemas = {
  Entity,
  CreateEntityData,
  VoteData,
  VoteResponse,
};

const endpoints = makeApi([
  {
    method: "get",
    path: "/api/entity",
    alias: "getApientity",
    requestFormat: "json",
    response: z.array(Entity),
  },
  {
    method: "post",
    path: "/api/entity",
    alias: "postApientity",
    requestFormat: "json",
    parameters: [
      {
        name: "body",
        type: "Body",
        schema: CreateEntityData,
      },
    ],
    response: Entity,
  },
  {
    method: "post",
    path: "/api/vote",
    alias: "postApivote",
    requestFormat: "json",
    parameters: [
      {
        name: "body",
        type: "Body",
        schema: VoteData,
      },
    ],
    response: VoteResponse,
  },
]);

export const api = new Zodios(endpoints);

export function createApiClient(baseUrl: string, options?: ZodiosOptions) {
  return new Zodios(baseUrl, endpoints, options);
}
