import { lazy, Suspense, useEffect, useState, type ComponentType } from 'react'

const OrdersPage = lazy(() => import('../features/orders/OrdersPage.tsx'))
const AccountPage = lazy(() => import('../features/orders/AccountPage.tsx'))

const TABS = [
  { id: 'tools', label: 'Công cụ', icon: '🧰' },
  { id: 'orders', label: 'Đơn hàng', icon: '📦' },
  { id: 'carriers', label: 'Vận tải', icon: '🚚' },
  { id: 'me', label: 'Tôi', icon: '👤' },
] as const
type TabId = (typeof TABS)[number]['id']

const TOOLS: { path: string; title: string; hint: string; icon: string; page: ComponentType }[] = [
  { path: 'data', title: 'Nạp dữ liệu', hint: 'Nạp file Excel/CSV từ WMS, MISA; quản lý nguồn', icon: '📥', page: lazy(() => import('../features/data/DataPage.tsx')) },
  { path: 'kiem-kho', title: 'Kiểm kho', hint: 'Phiếu kiểm A4 theo dãy kệ, xem trên điện thoại', icon: '📋', page: lazy(() => import('../features/inventory-check/InventoryCheckPage.tsx')) },
  { path: 'tra-sku', title: 'Tra SKU', hint: 'Gõ SKU, xem mọi vị trí, lô, ngày, tình trạng', icon: '🔎', page: lazy(() => import('../features/sku-lookup/SkuLookupPage.tsx')) },
  { path: 'barcode', title: 'Barcode / QR', hint: 'Mã Code128 và QR, in hàng loạt', icon: '▥', page: lazy(() => import('../features/barcode/BarcodePage.tsx')) },
  { path: 'label', title: 'Label Maker', hint: 'Giấy đánh dấu pallet, vị trí, lô trên A4', icon: '🏷️', page: lazy(() => import('../features/label-maker/LabelMakerPage.tsx')) },
  { path: 'excel', title: 'Excel Formatter', hint: 'Lọc, sắp xếp, đổi tên, nhóm, tách, gộp cột', icon: '📊', page: lazy(() => import('../features/excel-formatter/ExcelFormatterPage.tsx')) },
  { path: 'dvt', title: 'Đơn vị tính', hint: 'Gom CAI / CÁI / Cái về một tên', icon: '⚖️', page: lazy(() => import('../features/settings/UomPage.tsx')) },
]

const routeOf = () => location.hash.replace(/^#\/?/, '')

function useRoute() {
  const [route, setRoute] = useState(routeOf)
  useEffect(() => {
    const on = () => setRoute(routeOf())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

export default function App() {
  const route = useRoute()
  // Link đăng nhập từ email quay về với token trong URL → mở thẳng tab Đơn hàng.
  const [tab, setTab] = useState<TabId>(() =>
    /access_token=|[?&#]code=|error_code=/.test(location.hash + location.search) ? 'orders' : 'tools',
  )
  const tool = TOOLS.find((t) => t.path === route)
  const active: TabId = tool ? 'tools' : tab
  const title = tool?.title ?? TABS.find((t) => t.id === active)!.label

  function go(id: TabId) {
    setTab(id)
    if (location.hash) location.hash = ''
  }

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      {/* Điện thoại: tab dưới đáy; tablet: thanh bên icon; laptop: thanh bên đầy đủ */}
      <nav
        className="fixed inset-x-0 bottom-0 z-10 flex border-t border-slate-200 bg-white md:static md:w-20 md:flex-col md:border-t-0 md:border-r lg:w-56"
        aria-label="Điều hướng chính"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => go(t.id)}
            aria-current={active === t.id ? 'page' : undefined}
            className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-sm md:flex-none md:py-4 lg:flex-row lg:justify-start lg:gap-3 lg:px-5 lg:text-base ${
              active === t.id ? 'font-semibold text-teal-700' : 'text-slate-600'
            }`}
          >
            <span aria-hidden className="text-xl">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      <main className="min-w-0 flex-1 space-y-4 p-4 pb-24 md:p-6 md:pb-6">
        <div className="no-print flex items-center gap-3">
          {tool && (
            <a href="#/" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-lg" aria-label="Về danh sách công cụ">
              ←
            </a>
          )}
          <h1 className="text-2xl font-bold">{title}</h1>
        </div>

        {tool ? (
          <Suspense fallback={<p className="text-slate-600">Đang tải…</p>}>
            <tool.page />
          </Suspense>
        ) : active === 'tools' ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {TOOLS.map((t) => (
              <a key={t.path} href={`#/${t.path}`} className="flex min-h-20 items-center gap-4 rounded-xl bg-white p-4 shadow-sm hover:bg-slate-50">
                <span aria-hidden className="text-3xl">{t.icon}</span>
                <span>
                  <span className="block text-lg font-semibold">{t.title}</span>
                  <span className="block text-sm text-slate-600">{t.hint}</span>
                </span>
              </a>
            ))}
          </div>
        ) : active === 'orders' ? (
          <Suspense fallback={<p className="text-slate-600">Đang tải…</p>}>
            <OrdersPage />
          </Suspense>
        ) : active === 'me' ? (
          <Suspense fallback={<p className="text-slate-600">Đang tải…</p>}>
            <AccountPage />
          </Suspense>
        ) : (
          <p className="text-slate-600">Chưa làm — thuộc phase sau.</p>
        )}
      </main>
    </div>
  )
}
