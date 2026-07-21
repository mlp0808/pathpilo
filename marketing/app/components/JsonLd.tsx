/**
 * Renders one or more JSON-LD graphs as `<script type="application/ld+json">`.
 * Safe for Server Components. Pass a single object or an array of graphs.
 */
export default function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  const graphs = Array.isArray(data) ? data : [data]
  return (
    <>
      {graphs.map((graph, i) => (
        <script
          // Stable enough: graphs are static per page render and order is fixed.
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
        />
      ))}
    </>
  )
}
