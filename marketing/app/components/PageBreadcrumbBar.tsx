import Breadcrumbs from './Breadcrumbs'
import type { BreadcrumbItem } from './Breadcrumbs'

/** Breadcrumb bar rendered below the site header on inner pages. */
export default function PageBreadcrumbBar({ items }: { items: BreadcrumbItem[] }) {
  if (items.length <= 1) return null
  return (
    <div className="border-b border-gray-100 bg-white">
      <div className="mx-auto max-w-7xl px-6 py-3">
        <Breadcrumbs items={items} />
      </div>
    </div>
  )
}
