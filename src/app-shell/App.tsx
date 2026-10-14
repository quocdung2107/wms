import { lazy, Suspense, useEffect, useState, type ComponentType } from 'react'
import { Icon, type IconName } from '../shared/ui/icons.tsx'

const OverviewPage = lazy(() => import('../features/overview/OverviewPage.tsx'))
const OrdersPage = lazy(() => import('../features/orders/OrdersPage.tsx'))
const CarriersPage = lazy(() => import('../features/carriers/CarriersPage.tsx'))
const AccountPage = lazy(() => import('../features/orders/AccountPage.tsx'))

type TabId = 'overview' | 'tools' | 'orders' | 'carriers' | 'me'

const TABS: { id: TabId; label: string; icon: IconName }[] = [
  { id: 'overview', label: 'Tổng quan', icon: 'chart' },
  { id: 'tools', label: 'Kho', icon: 'tools' },
  { id: 'orders', label: 'Đơn & chat', icon: 'chat' },
  { id: 'carriers', label: 'Vận tải', icon: 'truck' },
]

const TOOLS: { group: string; path: string; title: string; hint: string; icon: IconName; page: ComponentType }[] = [
  { group: 'Dữ liệu', path: 'data', title: 'Nạp dữ liệu', hint: 'Nạp file Excel/CSV từ WMS, MISA; quản lý nguồn', icon: 'download', page: lazy(() => import('../features/data/DataPage.tsx')) },
  { group: 'Kiểm đếm', path: 'kiem-kho', title: 'Kiểm kho', hint: 'Phiếu kiểm A4 theo dãy kệ, xem trên điện thoại', icon: 'clipboard', page: lazy(() => import('../features/inventory-check/InventoryCheckPage.tsx')) },
  { group: 'Kiểm đếm', path: 'tra-sku', title: 'Tra SKU', hint: 'Gõ SKU, xem mọi vị trí, lô, ngày, tình trạng', icon: 'search', page: lazy(() => import('../features/sku-lookup/SkuLookupPage.tsx')) },
  { group: 'Lấy hàng', path: 'don-picking', title: 'Lệnh lấy hàng', hint: 'Tạo lệnh PK, lấy hàng theo đơn, theo dõi tiến độ', icon: 'receipt', page: lazy(() => import('../features/pick-orders/PickOrdersPage.tsx')) },
  { group: 'In ấn & file', path: 'barcode', title: 'Barcode / QR', hint: 'Mã Code128 và QR, in hàng loạt', icon: 'barcode', page: lazy(() => import('../features/barcode/BarcodePage.tsx')) },
  { group: 'In ấn & file', path: 'label', title: 'Label Maker', hint: 'Giấy đánh dấu pallet, vị trí, lô trên A4', icon: 'tag', page: lazy(() => import('../features/label-maker/LabelMakerPage.tsx')) },
  { group: 'In ấn & file', path: 'excel', title: 'Excel Formatter', hint: 'Lọc, sắp xếp, đổi tên, nhóm, tách, gộp cột', icon: 'chart', page: lazy(() => import('../features/excel-formatter/ExcelFormatterPage.tsx')) },
  { group: 'Dữ liệu', path: 'nhap-hang', title: 'Nhập hàng', hint: 'Nhập tay hàng về: cộng vào dòng có sẵn hoặc thêm dòng mới', icon: 'box', page: lazy(() => import('../features/receive/ReceivePage.tsx')) },
  { group: 'Dữ liệu', path: 'khach-hang', title: 'Khách hàng', hint: 'Danh sách khách: mã, địa chỉ giao, Sup, SĐT', icon: 'users', page: lazy(() => import('../features/customers/CustomersPage.tsx')) },
  { group: 'Dữ liệu', path: 'dvt', title: 'Đơn vị tính', hint: 'Gom CAI / CÁI / Cái về một tên', icon: 'scale', page: lazy(() => import('../features/settings/UomPage.tsx')) },
]

const GROUPS = ['Dữ liệu', 'Kiểm đếm', 'Lấy hàng', 'In ấn & file']

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

function useOnline() {
  const [on, setOn] = useState(navigator.onLine)
  useEffect(() => {
    const up = () => setOn(true)
    const down = () => setOn(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return on
}

export default function App() {
  const route = useRoute()
  // Link đăng nhập từ email quay về với token trong URL → mở thẳng tab Đơn & chat.
  const [tab, setTab] = useState<TabId>(() =>
    /access_token=|[?&#]code=|error_code=/.test(location.hash + location.search) ? 'orders' : 'overview',
  )
  const tool = TOOLS.find((t) => t.path === route)
  const active: TabId = tool ? 'tools' : tab
  const title = tool?.title ?? (active === 'me' ? 'Tài khoản' : TABS.find((t) => t.id === active)!.label)
  const online = useOnline()

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
              active === t.id ? 'font-semibold text-brand-700' : 'text-slate-600'
            }`}
          >
            <Icon name={t.icon} size={22} />
            {t.label}
          </button>
        ))}
      </nav>

      <main className="min-w-0 flex-1 space-y-4 p-4 pb-24 md:p-6 md:pb-6">
        <div className="no-print flex items-center gap-3">
          {tool && (
            <a href="#/" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-lg" aria-label="Về trang Kho">
              ←
            </a>
          )}
          <h1 className="min-w-0 flex-1 text-2xl font-bold">{title}</h1>
          <span
            role="status"
            className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium ${online ? 'bg-brand-50 text-brand-800' : 'bg-amber-100 text-amber-900'}`}
          >
            <Icon name="dot" size={10} />
            {online ? 'Trực tuyến' : 'Ngoại tuyến'}
          </span>
          <button
            onClick={() => go('me')}
            aria-label="Tài khoản và cài đặt"
            aria-current={active === 'me' ? 'page' : undefined}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-slate-300 bg-white text-brand-700"
          >
            <Icon name="user" size={22} />
          </button>
        </div>

        {tool ? (
          <Suspense fallback={<p className="text-slate-600">Đang tải…</p>}>
            <tool.page />
          </Suspense>
        ) : active === 'overview' ? (
          <Suspense fallback={<p className="text-slate-600">Đang tải…</p>}>
            <OverviewPage />
          </Suspense>
        ) : active === 'tools' ? (
          <div className="space-y-6">
            {GROUPS.map((g) => (
              <section key={g} aria-labelledby={`grp-${g}`} className="space-y-2">
                <h2 id={`grp-${g}`} className="text-sm font-semibold uppercase tracking-wide text-slate-600">{g}</h2>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {TOOLS.filter((t) => t.group === g).map((t) => (
                    <a key={t.path} href={`#/${t.path}`} className="flex min-h-20 items-center gap-4 rounded-xl bg-white p-4 shadow-sm hover:bg-slate-50">
                      <Icon name={t.icon} size={32} className="text-brand-700" />
                      <span>
                        <span className="block text-lg font-semibold">{t.title}</span>
                        <span className="block text-sm text-slate-600">{t.hint}</span>
                      </span>
                    </a>
                  ))}
                </div>
              </section>
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
          <Suspense fallback={<p className="text-slate-600">Đang tải…</p>}>
            <CarriersPage />
          </Suspense>
        )}
      </main>
    </div>
  )
}
