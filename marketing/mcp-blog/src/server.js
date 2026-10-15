import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  BLOG_CATEGORIES,
  BLOG_TAG_LABELS,
  MDX_COMPONENTS,
} from './taxonomy.js'
import * as store from './blogStore.js'

function ok(data) {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  }
}

function fail(err) {
  const message = err?.message || String(err)
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: message }, null, 2) }],
    isError: true,
  }
}

export function createBlogMcpServer() {
  const server = new McpServer({
    name: 'pathpilo-blog',
    version: '1.0.0',
  })

  server.registerTool(
    'blog_sandbox_info',
    {
      title: 'Blog sandbox info',
      description:
        'Show what this MCP can access. Blog content + article images only — no application source code.',
      inputSchema: {},
    },
    async () => ok(store.sandboxInfo())
  )

  server.registerTool(
    'blog_list_taxonomy',
    {
      title: 'List categories and tags',
      description: 'Return valid blog categories and known tag slugs/labels.',
      inputSchema: {},
    },
    async () =>
      ok({
        categories: BLOG_CATEGORIES,
        knownTags: Object.entries(BLOG_TAG_LABELS).map(([slug, label]) => ({ slug, label })),
        note: 'Unknown tags still work; prefer known tags for related-article linking.',
      })
  )

  server.registerTool(
    'blog_list_mdx_components',
    {
      title: 'List MDX section components',
      description: 'Available JSX blocks authors can use inside article bodies.',
      inputSchema: {},
    },
    async () => ok({ components: MDX_COMPONENTS })
  )

  server.registerTool(
    'blog_get_guide',
    {
      title: 'Get authoring guide',
      description: 'Read AUTHORING-GUIDE.md (rules for frontmatter, SEO, components, linking).',
      inputSchema: {},
    },
    async () => {
      try {
        const text = await store.getAuthoringGuide()
        return { content: [{ type: 'text', text }] }
      } catch (e) {
        return fail(e)
      }
    }
  )

  server.registerTool(
    'blog_get_index',
    {
      title: 'Get article index',
      description: 'Read ARTICLE-INDEX.md for existing slugs to internal-link.',
      inputSchema: {},
    },
    async () => {
      try {
        const text = await store.getArticleIndex()
        return { content: [{ type: 'text', text }] }
      } catch (e) {
        return fail(e)
      }
    }
  )

  server.registerTool(
    'blog_get_template',
    {
      title: 'Get article template',
      description: 'Read _TEMPLATE.mdx starter content.',
      inputSchema: {},
    },
    async () => {
      try {
        const text = await store.getTemplate()
        return { content: [{ type: 'text', text }] }
      } catch (e) {
        return fail(e)
      }
    }
  )

  server.registerTool(
    'blog_list_articles',
    {
      title: 'List articles',
      description: 'List blog posts with optional filters (category, tag, locale, drafts).',
      inputSchema: {
        includeDrafts: z.boolean().optional().describe('Include drafts (default true)'),
        category: z.string().optional(),
        tag: z.string().optional(),
        locale: z.enum(['en', 'da']).optional(),
      },
    },
    async (args) => {
      try {
        return ok({ articles: await store.listArticles(args) })
      } catch (e) {
        return fail(e)
      }
    }
  )

  server.registerTool(
    'blog_get_article',
    {
      title: 'Get article',
      description: 'Load one article: frontmatter (incl. SEO meta) + MDX body.',
      inputSchema: {
        slug: z.string().describe('Article slug (filename without .mdx)'),
      },
    },
    async ({ slug }) => {
      try {
        return ok(await store.getArticle(slug))
      } catch (e) {
        return fail(e)
      }
    }
  )

  server.registerTool(
    'blog_create_article',
    {
      title: 'Create article',
      description:
        'Create a new .mdx article. Defaults to draft:true. Goes live on pathpilo.com within seconds when draft is false (no rebuild). Sets title, description, category, tags, SEO fields, cover, and body.',
      inputSchema: {
        slug: z.string(),
        title: z.string(),
        description: z.string().describe('Card + default meta description (120–160 chars)'),
        category: z.string(),
        content: z.string().optional().describe('MDX body without frontmatter'),
        tags: z.array(z.string()).optional(),
        date: z.string().optional().describe('YYYY-MM-DD'),
        author: z.string().optional(),
        authorRole: z.string().optional(),
        image: z.string().optional().describe('e.g. /images/articles/my-slug.jpg'),
        imageAlt: z.string().optional(),
        draft: z.boolean().optional().describe('Default true'),
        featured: z.boolean().optional(),
        seoTitle: z.string().optional().describe('Overrides <title> for search engines'),
        seoDescription: z.string().optional().describe('Overrides meta description for SEO'),
        locale: z.enum(['en', 'da']).optional(),
      },
    },
    async (args) => {
      try {
        return ok({ created: await store.createArticle(args) })
      } catch (e) {
        return fail(e)
      }
    }
  )

  server.registerTool(
    'blog_update_article',
    {
      title: 'Update article content/frontmatter',
      description:
        'Patch any frontmatter fields and/or replace the MDX body. Use for full edits.',
      inputSchema: {
        slug: z.string(),
        content: z.string().optional().describe('Full MDX body replacement (no frontmatter)'),
        title: z.string().optional(),
        description: z.string().optional(),
        category: z.string().optional(),
        tags: z.array(z.string()).optional(),
        date: z.string().optional(),
        updated: z.string().optional(),
        author: z.string().optional(),
        authorRole: z.string().optional(),
        image: z.string().nullable().optional(),
        imageAlt: z.string().nullable().optional(),
        draft: z.boolean().optional(),
        featured: z.boolean().nullable().optional(),
        seoTitle: z.string().nullable().optional(),
        seoDescription: z.string().nullable().optional(),
        locale: z.enum(['en', 'da']).nullable().optional(),
      },
    },
    async ({ slug, content, ...fields }) => {
      try {
        const frontmatterPatch = {}
        for (const [k, v] of Object.entries(fields)) {
          if (v !== undefined) frontmatterPatch[k] = v
        }
        return ok({
          updated: await store.updateArticle(slug, { frontmatterPatch, content }),
        })
      } catch (e) {
        return fail(e)
      }
    }
  )

  server.registerTool(
    'blog_update_meta',
    {
      title: 'Update SEO / card meta',
      description:
        'Update title, description, seoTitle, seoDescription only (search + card metadata).',
      inputSchema: {
        slug: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        seoTitle: z.string().nullable().optional(),
        seoDescription: z.string().nullable().optional(),
      },
    },
    async ({ slug, ...fields }) => {
      try {
        const frontmatterPatch = {}
        for (const [k, v] of Object.entries(fields)) {
          if (v !== undefined) frontmatterPatch[k] = v
        }
        if (Object.keys(frontmatterPatch).length === 0) {
          throw new Error('Provide at least one of title, description, seoTitle, seoDescription.')
        }
        frontmatterPatch.updated = new Date().toISOString().slice(0, 10)
        return ok({
          updated: await store.updateArticle(slug, { frontmatterPatch }),
        })
      } catch (e) {
        return fail(e)
      }
    }
  )

  server.registerTool(
    'blog_update_taxonomy',
    {
      title: 'Update category and tags',
      description: 'Set category and/or tags for an article.',
      inputSchema: {
        slug: z.string(),
        category: z.string().optional(),
        tags: z.array(z.string()).optional(),
      },
    },
    async ({ slug, category, tags }) => {
      try {
        const frontmatterPatch = { updated: new Date().toISOString().slice(0, 10) }
        if (category !== undefined) frontmatterPatch.category = category
        if (tags !== undefined) frontmatterPatch.tags = tags
        return ok({
          updated: await store.updateArticle(slug, { frontmatterPatch }),
        })
      } catch (e) {
        return fail(e)
      }
    }
  )

  server.registerTool(
    'blog_set_status',
    {
      title: 'Publish / draft / feature',
      description:
        'Toggle draft, featured, or dates. draft:false publishes live immediately (no marketing rebuild).',
      inputSchema: {
        slug: z.string(),
        draft: z.boolean().optional(),
        featured: z.boolean().nullable().optional(),
        date: z.string().optional(),
        updated: z.string().optional(),
      },
    },
    async ({ slug, ...fields }) => {
      try {
        const frontmatterPatch = {}
        for (const [k, v] of Object.entries(fields)) {
          if (v !== undefined) frontmatterPatch[k] = v
        }
        return ok({
          updated: await store.updateArticle(slug, { frontmatterPatch }),
        })
      } catch (e) {
        return fail(e)
      }
    }
  )

  server.registerTool(
    'blog_set_cover',
    {
      title: 'Set cover image',
      description:
        'Point the article cover at /images/articles/<file> and optional alt text. Upload first with blog_upload_image if needed.',
      inputSchema: {
        slug: z.string(),
        image: z.string().describe('Public path, e.g. /images/articles/my-slug.jpg'),
        imageAlt: z.string().optional(),
      },
    },
    async ({ slug, image, imageAlt }) => {
      try {
        const frontmatterPatch = {
          image,
          updated: new Date().toISOString().slice(0, 10),
        }
        if (imageAlt !== undefined) frontmatterPatch.imageAlt = imageAlt
        return ok({
          updated: await store.updateArticle(slug, { frontmatterPatch }),
        })
      } catch (e) {
        return fail(e)
      }
    }
  )

  server.registerTool(
    'blog_delete_article',
    {
      title: 'Delete article',
      description: 'Permanently delete an article .mdx file. Requires confirmSlug === slug.',
      inputSchema: {
        slug: z.string(),
        confirmSlug: z.string(),
      },
    },
    async (args) => {
      try {
        return ok(await store.deleteArticle(args.slug, { confirmSlug: args.confirmSlug }))
      } catch (e) {
        return fail(e)
      }
    }
  )

  server.registerTool(
    'blog_list_images',
    {
      title: 'List article images',
      description: 'List files in public/images/articles/.',
      inputSchema: {},
    },
    async () => {
      try {
        return ok({ images: await store.listImages() })
      } catch (e) {
        return fail(e)
      }
    }
  )

  server.registerTool(
    'blog_upload_image',
    {
      title: 'Upload article image',
      description:
        'Write an image into public/images/articles/. Pass base64 (no data: URL prefix). Max 8MB.',
      inputSchema: {
        filename: z.string().describe('e.g. my-slug.jpg'),
        base64: z.string(),
        contentType: z.string().optional().describe('Optional MIME if filename has no extension'),
      },
    },
    async (args) => {
      try {
        return ok({ uploaded: await store.uploadImage(args) })
      } catch (e) {
        return fail(e)
      }
    }
  )

  server.registerTool(
    'blog_delete_image',
    {
      title: 'Delete article image',
      description: 'Delete a file from public/images/articles/. Requires confirmFilename.',
      inputSchema: {
        filename: z.string(),
        confirmFilename: z.string(),
      },
    },
    async (args) => {
      try {
        return ok(
          await store.deleteImage(args.filename, { confirmFilename: args.confirmFilename })
        )
      } catch (e) {
        return fail(e)
      }
    }
  )

  server.registerTool(
    'blog_refresh_index',
    {
      title: 'Refresh ARTICLE-INDEX.md',
      description: 'Regenerate the internal-link index from current articles.',
      inputSchema: {},
    },
    async () => {
      try {
        return ok(await store.refreshIndex())
      } catch (e) {
        return fail(e)
      }
    }
  )

  return server
}
