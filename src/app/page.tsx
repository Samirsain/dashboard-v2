import MobileHeader from "@/components/MobileHeader";
import SideNav from "@/components/SideNav";

const kpis = [
  { label: "Total Tasks", value: "23", color: "text-on-surface" },
  { label: "Completed", value: "15", color: "text-on-surface" },
  { label: "Late", value: "04", color: "text-error" },
  { label: "Pending", value: "04", color: "text-on-surface-variant" },
];

const departments = [
  { name: "MIS", pct: 85 },
  { name: "EA", pct: 62 },
  { name: "HR", pct: 90 },
  { name: "OPS", pct: 45 },
];

const tasks = [
  { id: "CL-2", desc: "Security Guard Photo", status: "Completed" },
  { id: "CL-1", desc: "Office Wifi Bill", status: "Pending" },
  { id: "CL-3", desc: "Rajendra Call", status: "Late" },
  { id: "CL-4", desc: "Q3 Review Deck", status: "Pending", muted: true },
];

function StatusBadge({ status }: { status: string }) {
  if (status === "Completed") {
    return (
      <span className="inline-block bg-primary-container text-on-primary font-label-sm text-label-sm uppercase px-3 py-1 border border-primary-container">
        Completed
      </span>
    );
  }
  if (status === "Late") {
    return (
      <span className="inline-block bg-error text-on-error font-label-sm text-label-sm uppercase px-3 py-1 border border-error">
        Late
      </span>
    );
  }
  return (
    <span className="inline-block bg-surface-variant text-on-surface font-label-sm text-label-sm uppercase px-3 py-1 border border-on-surface-variant">
      Pending
    </span>
  );
}

export default function DashboardPage() {
  return (
    <>
      <MobileHeader />
      <SideNav active="dashboard" />

      <div className="md:ml-64 flex flex-col min-h-screen bg-background">
        {/* TopNavBar */}
        <header className="hidden md:flex justify-between items-center h-16 w-full px-container-padding sticky top-0 z-30 border-b-2 border-on-surface bg-surface text-primary">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 font-headline-md text-headline-md">
              <a
                className="text-on-surface-variant hover:text-primary underline decoration-2 transition-colors"
                href="#"
              >
                Portfolio
              </a>
              <span className="text-on-surface-variant text-sm">/</span>
              <a
                className="text-on-surface-variant hover:text-primary underline decoration-2 transition-colors"
                href="#"
              >
                Analytics
              </a>
              <span className="text-on-surface-variant text-sm">/</span>
              <span className="text-on-surface font-bold border-b-2 border-on-surface pb-0.5">
                Reports
              </span>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-primary-container rounded-full" />
              <span className="font-label-sm text-label-sm uppercase text-on-surface">
                Operational Status: Active
              </span>
            </div>
            <div className="flex items-center gap-4 border-l-2 border-on-surface pl-6">
              <button className="text-on-surface-variant hover:text-primary transition-colors">
                <span className="material-symbols-outlined">notifications</span>
              </button>
              <button className="text-on-surface-variant hover:text-primary transition-colors">
                <span className="material-symbols-outlined">account_circle</span>
              </button>
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-container-padding">
          <div className="max-w-[1440px] mx-auto grid grid-cols-12 gap-4 md:gap-gutter">
            {/* Hero Metric */}
            <div className="col-span-12 bg-on-surface text-inverse-on-surface border-2 border-on-surface p-6 md:p-stack-lg flex flex-col justify-center relative overflow-hidden group">
              <div className="absolute -right-10 -top-10 w-64 h-64 border-4 border-surface/10 rounded-full opacity-20 pointer-events-none group-hover:scale-110 transition-transform duration-700" />
              <span className="font-label-sm text-label-sm uppercase tracking-widest text-surface-variant mb-stack-md relative z-10">
                System Status
              </span>
              <h2 className="font-headline-lg-mobile text-headline-lg-mobile md:font-headline-xl md:text-headline-xl text-surface-container-lowest relative z-10">
                72% Overall Completion
              </h2>
            </div>

            {/* KPI Grid */}
            <div className="col-span-12 grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-gutter">
              {kpis.map((kpi) => (
                <div
                  key={kpi.label}
                  className="bg-surface border-2 border-on-surface p-stack-md flex flex-col justify-between hover:bg-surface-container-lowest transition-colors"
                >
                  <span className="font-label-sm text-label-sm text-on-surface-variant uppercase border-b-2 border-on-surface pb-2 mb-4">
                    {kpi.label}
                  </span>
                  <div className={`font-data-mono text-data-mono text-4xl font-bold ${kpi.color}`}>
                    {kpi.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Department Performance */}
            <div className="col-span-12 lg:col-span-5 bg-surface border-2 border-on-surface p-stack-lg flex flex-col">
              <div className="border-b-2 border-on-surface pb-stack-md mb-stack-md flex justify-between items-end">
                <h3 className="font-headline-md text-headline-md text-on-surface">
                  Department Performance
                </h3>
                <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">
                  By Completion %
                </span>
              </div>
              <div className="flex flex-col gap-6 flex-1 justify-center">
                {departments.map((d) => (
                  <div key={d.name} className="flex items-center gap-4">
                    <span className="font-data-mono text-data-mono w-12">{d.name}</span>
                    <div className="flex-1 h-4 bg-surface-container border-2 border-on-surface relative">
                      <div
                        className="absolute top-0 left-0 h-full bg-on-surface"
                        style={{ width: `${d.pct}%` }}
                      />
                    </div>
                    <span className="font-data-mono text-data-mono w-10 text-right">
                      {d.pct}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Task Directory Table */}
            <div className="col-span-12 lg:col-span-7 bg-surface border-2 border-on-surface flex flex-col">
              <div className="bg-surface-container-low border-b-2 border-on-surface p-stack-md flex justify-between items-center">
                <h3 className="font-headline-md text-headline-md text-on-surface">
                  Task Directory
                </h3>
                <button className="font-label-sm text-label-sm uppercase border-2 border-on-surface px-4 py-2 hover:bg-on-surface hover:text-on-primary transition-colors">
                  View All
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low border-b-2 border-on-surface">
                      <th className="py-3 px-4 font-label-sm text-label-sm uppercase text-on-surface w-24">
                        Task ID
                      </th>
                      <th className="py-3 px-4 font-label-sm text-label-sm uppercase text-on-surface">
                        Description
                      </th>
                      <th className="py-3 px-4 font-label-sm text-label-sm uppercase text-on-surface text-right">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="font-body-md text-body-md text-on-surface">
                    {tasks.map((t) => (
                      <tr
                        key={t.id}
                        className="border-b border-outline-variant last:border-b-0 hover:bg-surface-container-lowest transition-colors"
                      >
                        <td className="py-4 px-4 font-data-mono text-data-mono text-on-surface-variant">
                          {t.id}
                        </td>
                        <td
                          className={`py-4 px-4 font-medium ${
                            t.muted ? "text-on-surface-variant" : ""
                          }`}
                        >
                          {t.desc}
                        </td>
                        <td className="py-4 px-4 text-right">
                          <StatusBadge status={t.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
