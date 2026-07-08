// @ts-nocheck
import * as __fd_glob_26 from "../content/docs/support/sponsor.mdx?collection=docs"
import * as __fd_glob_25 from "../content/docs/support/security.mdx?collection=docs"
import * as __fd_glob_24 from "../content/docs/support/donate.mdx?collection=docs"
import * as __fd_glob_23 from "../content/docs/progress/todo.mdx?collection=docs"
import * as __fd_glob_22 from "../content/docs/progress/pending-test.mdx?collection=docs"
import * as __fd_glob_21 from "../content/docs/progress/local-agent-integration-plan.mdx?collection=docs"
import * as __fd_glob_20 from "../content/docs/overview/third-party-prompt-repositories.mdx?collection=docs"
import * as __fd_glob_19 from "../content/docs/overview/render.mdx?collection=docs"
import * as __fd_glob_18 from "../content/docs/overview/quick-start.mdx?collection=docs"
import * as __fd_glob_17 from "../content/docs/overview/low-memory.mdx?collection=docs"
import * as __fd_glob_16 from "../content/docs/overview/features.mdx?collection=docs"
import * as __fd_glob_15 from "../content/docs/overview/docker.mdx?collection=docs"
import * as __fd_glob_14 from "../content/docs/overview/codex-app-plugin.mdx?collection=docs"
import * as __fd_glob_13 from "../content/docs/canvas/canvas-shortcuts.mdx?collection=docs"
import * as __fd_glob_12 from "../content/docs/canvas/canvas-node-manual.mdx?collection=docs"
import * as __fd_glob_11 from "../content/docs/backend/local-development.mdx?collection=docs"
import * as __fd_glob_10 from "../content/docs/backend/canvas-data-structure.mdx?collection=docs"
import * as __fd_glob_9 from "../content/docs/business/license.mdx?collection=docs"
import * as __fd_glob_8 from "../content/docs/business/cla.mdx?collection=docs"
import * as __fd_glob_7 from "../content/docs/business/business.mdx?collection=docs"
import { default as __fd_glob_6 } from "../content/docs/support/meta.json?collection=docs"
import { default as __fd_glob_5 } from "../content/docs/progress/meta.json?collection=docs"
import { default as __fd_glob_4 } from "../content/docs/canvas/meta.json?collection=docs"
import { default as __fd_glob_3 } from "../content/docs/overview/meta.json?collection=docs"
import { default as __fd_glob_2 } from "../content/docs/business/meta.json?collection=docs"
import { default as __fd_glob_1 } from "../content/docs/backend/meta.json?collection=docs"
import { default as __fd_glob_0 } from "../content/docs/meta.json?collection=docs"
import { server } from 'fumadocs-mdx/runtime/server';
import type * as Config from '../source.config';

const create = server<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>({"doc":{"passthroughs":["extractedReferences"]}});

export const docs = await create.docs("docs", "content/docs", {"meta.json": __fd_glob_0, "backend/meta.json": __fd_glob_1, "business/meta.json": __fd_glob_2, "overview/meta.json": __fd_glob_3, "canvas/meta.json": __fd_glob_4, "progress/meta.json": __fd_glob_5, "support/meta.json": __fd_glob_6, }, {"business/business.mdx": __fd_glob_7, "business/cla.mdx": __fd_glob_8, "business/license.mdx": __fd_glob_9, "backend/canvas-data-structure.mdx": __fd_glob_10, "backend/local-development.mdx": __fd_glob_11, "canvas/canvas-node-manual.mdx": __fd_glob_12, "canvas/canvas-shortcuts.mdx": __fd_glob_13, "overview/codex-app-plugin.mdx": __fd_glob_14, "overview/docker.mdx": __fd_glob_15, "overview/features.mdx": __fd_glob_16, "overview/low-memory.mdx": __fd_glob_17, "overview/quick-start.mdx": __fd_glob_18, "overview/render.mdx": __fd_glob_19, "overview/third-party-prompt-repositories.mdx": __fd_glob_20, "progress/local-agent-integration-plan.mdx": __fd_glob_21, "progress/pending-test.mdx": __fd_glob_22, "progress/todo.mdx": __fd_glob_23, "support/donate.mdx": __fd_glob_24, "support/security.mdx": __fd_glob_25, "support/sponsor.mdx": __fd_glob_26, });